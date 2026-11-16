import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Cuanto se espera a Analitica. Corre en Azure y el primer pedido puede despertarla. */
export const ANALITICA_TIMEOUT_MS = 15000;

/** El tablero de Residuos que arma Analitica: una pagina HTML con los datos adentro. */
export interface TableroAnalitica {
  html: string;
}

/**
 * Pide el tablero de Residuos a Analitica (Grupo 8) en nombre del admin logueado.
 *
 * Analitica valida el token de la persona (`token_use: human`), no el de
 * servicio (Valen, 14/11 y 16/11), y no habilita CORS para nuestro frontend:
 * por eso pasa por aca. Se reenvia el mismo `Authorization` con el que el admin
 * llego a esta API, sin tocarlo ni guardarlo.
 *
 * Un rechazo de Analitica (401 o 403) se devuelve como 502 y no como 401: si
 * no, el frontend creeria que vencio la sesion de Residuos y la cerraria.
 */
@Injectable()
export class AnaliticaService {
  private readonly logger = new Logger(AnaliticaService.name);

  constructor(private readonly config: ConfigService) {}

  async tablero(autorizacion: string): Promise<TableroAnalitica> {
    const base = this.config.get<string>('ANALITICA_URL')?.trim().replace(/\/+$/, '');
    if (!base) {
      throw new ServiceUnavailableException({
        code: 'ANALITICA_NO_CONFIGURADA',
        message: 'El tablero de Analítica todavía no está conectado.',
      });
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(`${base}/embed/residuos`, {
        headers: { Authorization: autorizacion, Accept: 'text/html, application/json' },
        signal: AbortSignal.timeout(ANALITICA_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch (error) {
      this.logger.warn(`Analitica no respondio: ${(error as Error).message}`);
      throw new BadGatewayException({
        code: 'ANALITICA_SIN_RESPUESTA',
        message: 'Analítica no respondió. Probá de nuevo en unos minutos.',
      });
    }

    const cuerpo = await respuesta.text();

    if (!respuesta.ok) {
      const detalle = detalleDe(cuerpo);
      this.logger.warn(`Analitica respondio ${respuesta.status}: ${detalle ?? 'sin detalle'}`);
      throw new BadGatewayException({
        code: 'ANALITICA_RECHAZO',
        message: `Analítica respondió ${respuesta.status}${detalle ? `: ${detalle}` : ''}.`,
      });
    }

    // Hoy devuelve el HTML directo. Se acepta tambien el JSON con `html` del
    // ejemplo del 10/11, por si lo cambian.
    const html = respuesta.headers.get('content-type')?.includes('json')
      ? htmlDeJson(cuerpo)
      : cuerpo;

    if (!html?.trim()) {
      throw new BadGatewayException({
        code: 'ANALITICA_SIN_TABLERO',
        message: 'Analítica respondió, pero todavía no devuelve el tablero.',
      });
    }

    return { html };
  }
}

/** El `detail` de un error de Analitica (FastAPI), si vino. */
function detalleDe(cuerpo: string): string | null {
  try {
    const detail = (JSON.parse(cuerpo) as { detail?: unknown }).detail;
    return typeof detail === 'string' ? detail : null;
  } catch {
    return null;
  }
}

function htmlDeJson(cuerpo: string): string | null {
  try {
    const html = (JSON.parse(cuerpo) as { html?: unknown }).html;
    return typeof html === 'string' ? html : null;
  } catch {
    return null;
  }
}
