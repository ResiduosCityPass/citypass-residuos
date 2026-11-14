import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { urlTableroAnalitica } from '../../config/analitica.config';

export const TIMEOUT_ANALITICA_MS = 60_000;

@Injectable()
export class AnaliticaService {
  constructor(private readonly config: ConfigService) {}

  /** Reenvia el token humano, sin intercambiarlo por una credencial de servicio. */
  async tablero(authorization: string): Promise<{ html: string }> {
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
    let response: Response;
    try {
      response = await fetch(url, {
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
        const html = await response.text();
        if (!html.trim()) throw new Error('Tablero vacio');
        return { html };
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
