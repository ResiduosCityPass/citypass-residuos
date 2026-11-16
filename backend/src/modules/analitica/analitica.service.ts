import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { urlTableroAnalitica } from '../../config/analitica.config';

export const TIMEOUT_ANALITICA_MS = 60_000;
export const CABECERAS_ANALITICA = [
  'content-type',
  'cache-control',
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
] as const;

@Injectable()
export class AnaliticaService {
  constructor(private readonly config: ConfigService) {}

  validarConfiguracion(): URL {
    const url = urlTableroAnalitica(
      this.config.get<string>('ANALITICA_URL'),
      this.config.get<string>('NODE_ENV', 'development'),
    );
    if (!url) {
      throw new ServiceUnavailableException({
        code: 'ANALITICA_NO_CONFIGURADA',
        message: 'El tablero de Analítica todavía no está conectado.',
      });
    }
    return url;
  }

  /** Reenvia el token humano, sin intercambiarlo por una credencial de servicio. */
  async tablero(authorization: string): Promise<{ body: Buffer; headers: Record<string, string> }> {
    const url = this.validarConfiguracion();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: authorization, Accept: 'text/html' },
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(TIMEOUT_ANALITICA_MS),
      });
      if (response.status === 200) {
        if (!/^text\/html(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
          throw new Error('Respuesta inesperada');
        }
        const headers: Record<string, string> = {};
        for (const name of CABECERAS_ANALITICA) {
          const value = response.headers.get(name);
          if (!value) throw new Error('Falta una cabecera del contrato');
          headers[name] = value;
        }
        if (
          !headers['cache-control'].split(',').some((v) => v.trim().toLowerCase() === 'no-store')
        ) {
          throw new Error('El tablero no permite cache');
        }
        const body = Buffer.from(await response.arrayBuffer());
        if (!body.toString('utf8').trim()) throw new Error('Tablero vacio');
        return { body, headers };
      }
    } catch {
      throw this.noDisponible();
    }
    // No se propagan cuerpos de errores de otro sistema. El 401 conserva el
    // refresh unico del cliente HTTP, sin guardar el HTML ni el token.
    const errors: Record<number, { code: string; message: string }> = {
      400: {
        code: 'ANALITICA_TABLERO_INVALIDO',
        message: 'El tablero de Residuos todavía no está habilitado en Analítica.',
      },
      401: { code: 'ANALITICA_SESION_VENCIDA', message: 'La sesión de Analítica debe renovarse.' },
      403: {
        code: 'ANALITICA_MODULO_NO_AUTORIZADO',
        message: 'Analítica no habilitó el tablero de Residuos para esta cuenta.',
      },
      404: {
        code: 'ANALITICA_TABLERO_NO_ENCONTRADO',
        message: 'El tablero de Residuos no está disponible en esa ruta.',
      },
    };
    const error = errors[response.status];
    if (error) throw new HttpException(error, response.status);
    throw this.noDisponible();
  }

  private noDisponible() {
    return new ServiceUnavailableException({
      code: 'ANALITICA_NO_DISPONIBLE',
      message: 'Analítica no disponible. Volvé a intentar en unos minutos.',
    });
  }
}
