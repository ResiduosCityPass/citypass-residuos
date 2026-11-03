import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, JsonWebKey } from 'crypto';

/** Claves publicas del IdP configurado. Nunca sigue URLs incluidas en un JWT. */
@Injectable()
export class JwksService {
  private keys = new Map<string, string>();
  private expiresAt = 0;
  private lastAttempt = 0;
  private pending?: Promise<void>;

  constructor(private readonly config: ConfigService) {}

  async clave(kid: unknown): Promise<string> {
    if (typeof kid !== 'string' || !/^[\w.-]{1,200}$/.test(kid)) {
      throw new Error('kid de firma ausente o invalido');
    }
    if (Date.now() < this.expiresAt && this.keys.has(kid)) return this.keys.get(kid)!;
    // Un kid inventado no puede provocar una descarga por cada request.
    if (this.pending) await this.pending;
    else if (Date.now() - this.lastAttempt >= 30000) {
      this.lastAttempt = Date.now();
      this.pending = this.descargar();
      try {
        await this.pending;
      } finally {
        this.pending = undefined;
      }
    }
    const key = Date.now() < this.expiresAt && this.keys.get(kid);
    if (!key) throw new Error('No hay clave vigente para el kid del token');
    return key;
  }

  private async descargar(): Promise<void> {
    const url = new URL(this.config.getOrThrow<string>('JWT_JWKS_URL'));
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('JWT_JWKS_URL debe ser HTTPS sin credenciales');
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    if (!response.ok) throw new Error('No se pudo consultar el JWKS del IdP');
    const document = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
    if (!Array.isArray(document.keys) || document.keys.length > 100) {
      throw new Error('JWKS invalido');
    }
    const keys = new Map<string, string>();
    for (const key of document.keys) {
      if (
        key.kty !== 'RSA' ||
        key.use !== 'sig' ||
        key.alg !== 'RS256' ||
        !key.kid ||
        !key.n ||
        !key.e ||
        key.d ||
        keys.has(key.kid)
      )
        continue;
      keys.set(
        key.kid,
        createPublicKey({ key, format: 'jwk' }).export({ type: 'spki', format: 'pem' }).toString(),
      );
    }
    if (keys.size === 0) throw new Error('JWKS sin claves RS256 de firma');
    this.keys = keys;
    this.expiresAt = Date.now() + 300000;
  }
}
