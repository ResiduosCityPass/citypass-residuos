import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Response } from 'express';

/** El padre no puede leer el documento aislado: se avisa solo el estado HTTP. */
@Catch()
export class AnaliticaIframeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const original = exception instanceof HttpException ? exception.getStatus() : 503;
    const status = [400, 401, 403, 404, 503].includes(original) ? original : 503;
    const nonce = randomBytes(18).toString('base64');
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'`,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      })
      .send(
        `<!doctype html><html lang="es"><meta charset="utf-8"><title>Analítica no disponible</title><p>Analítica no disponible. Volvé a intentar en unos minutos.</p><script nonce="${nonce}">parent.postMessage({tipo:'citypass-analitica-error',estado:${status}},'*');</script></html>`,
      );
  }
}
