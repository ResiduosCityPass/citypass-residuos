import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwksService } from '../../auth/jwks.service';
import { sinBarrasFinales } from './eda-url';

@Injectable()
export class EdaTokenService {
  private cached?: { value: string; renewAt: number };
  private pending?: Promise<string>;
  private readonly jwks: JwksService;
  constructor(private readonly config: ConfigService) {
    this.jwks = new JwksService(
      new ConfigService({
        JWT_JWKS_URL: `${sinBarrasFinales(config.get<string>('EDA_AUTH_URL', 'https://api.citypass-login.pp.ua'))}/.well-known/jwks.json`,
      }),
    );
  }

  async obtener(rechazado?: string): Promise<string> {
    if (rechazado && this.cached?.value === rechazado) this.cached = undefined;
    if (this.cached && Date.now() < this.cached.renewAt) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.solicitar();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }

  private async solicitar(): Promise<string> {
    const clientId = this.config.getOrThrow<string>('EDA_CLIENT_ID');
    const secret = this.config.getOrThrow<string>('EDA_CLIENT_SECRET');
    const namespace = this.config.get<string>('EDA_NAMESPACE', 'com.citypass.residuos');
    const auth = sinBarrasFinales(
      this.config.get<string>('EDA_AUTH_URL', 'https://api.citypass-login.pp.ua'),
    );
    const response = await fetch(`${auth}/oauth/token`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok)
      throw new Error(`EDA no pudo autenticar el servicio (HTTP ${response.status})`);
    const pair = (await response.json()) as { access_token?: string; expires_in?: number };
    if (
      typeof pair.access_token !== 'string' ||
      typeof pair.expires_in !== 'number' ||
      pair.expires_in <= 60
    )
      throw new Error('Respuesta OAuth de EDA invalida');
    const jwt = new JwtService();
    const decoded = jwt.decode(pair.access_token, { complete: true });
    if (!decoded || typeof decoded !== 'object' || decoded.header.alg !== 'RS256')
      throw new Error('EDA requiere RS256');
    const claims = await jwt.verifyAsync<{
      token_use: string;
      namespace: string;
      sub: string;
      exp: number;
      ver: number;
    }>(pair.access_token, {
      secret: await this.jwks.clave(decoded.header.kid),
      algorithms: ['RS256'],
      issuer: this.config.get<string>('EDA_TOKEN_ISSUER', 'https://idp.citypass.local'),
      audience: 'citypass',
    });
    if (
      claims.token_use !== 'service' ||
      claims.namespace !== namespace ||
      claims.sub !== clientId ||
      claims.ver !== 1 ||
      !claims.exp
    )
      throw new Error('El token de servicio no corresponde a Residuos');
    const renewAt = Math.min(claims.exp * 1000, Date.now() + pair.expires_in * 1000) - 60000;
    if (renewAt <= Date.now()) throw new Error('El token de EDA ya esta por vencer');
    this.cached = { value: pair.access_token, renewAt };
    return pair.access_token;
  }
}
