import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EdaTokenService } from './eda-token.service';

export interface TipoEda {
  fqn: string;
  topic: string;
  schemaId: number;
  version: number;
}

@Injectable()
export class EdaGatewayClient {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: EdaTokenService,
  ) {}
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const base = this.config.getOrThrow<string>('EDA_GATEWAY_URL').replace(/\/+$/, '');
    let token = await this.tokens.obtener();
    const send = () =>
      fetch(`${base}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let response = await send();
    if (response.status === 401) {
      token = await this.tokens.obtener(token);
      response = await send();
    }
    if (!response.ok) throw new Error(`EDA respondio HTTP ${response.status} en ${method} ${path}`);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  listarTipos() {
    return this.request<TipoEda[]>('/event-types');
  }
}
