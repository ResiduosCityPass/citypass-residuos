import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RespuestaError {
  statusCode: number;
  error: string;
  message: string | string[];
  code: string;
  timestamp: string;
  path: string;
}

/**
 * Filtro global de excepciones (dimension 4 de la rubrica).
 *
 * Unifica el formato de error de toda la API. El campo `code` es un identificador
 * estable pensado para que el frontend ramifique sin parsear el mensaje en castellano.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const esHttp = exception instanceof HttpException;
    const status = esHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const cuerpo = esHttp ? exception.getResponse() : null;

    const payload: RespuestaError = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Internal Server Error',
      message: this.extraerMensaje(cuerpo, exception),
      code: this.extraerCodigo(cuerpo, status),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(payload);
  }

  private extraerMensaje(cuerpo: unknown, exception: unknown): string | string[] {
    if (typeof cuerpo === 'string') return cuerpo;

    if (cuerpo && typeof cuerpo === 'object' && 'message' in cuerpo) {
      return (cuerpo as { message: string | string[] }).message;
    }

    return exception instanceof Error ? exception.message : 'Error interno del servidor';
  }

  private extraerCodigo(cuerpo: unknown, status: number): string {
    if (cuerpo && typeof cuerpo === 'object' && 'code' in cuerpo) {
      return String((cuerpo as { code: unknown }).code);
    }

    return `HTTP_${status}`;
  }
}
