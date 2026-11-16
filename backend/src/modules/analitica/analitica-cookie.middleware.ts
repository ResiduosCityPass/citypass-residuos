import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const COOKIE_ANALITICA = 'citypass_analitica';

/** Solo se instala en el GET del iframe: las demas APIs siguen exigiendo Bearer. */
@Injectable()
export class AnaliticaCookieMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    if (!request.headers.authorization) {
      const prefix = `${COOKIE_ANALITICA}=`;
      const cookie = request.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(prefix));
      if (cookie) request.headers.authorization = `Bearer ${cookie.slice(prefix.length)}`;
    }
    // Firma, emisor, audiencia, vigencia, modulo y rol se verifican despues,
    // con los mismos guards globales. La cookie no otorga permisos nuevos.
    next();
  }
}
