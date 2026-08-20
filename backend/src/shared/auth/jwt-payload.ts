import { Rol } from '../domain/enums';

/**
 * Claims que esperamos del JWT emitido por el Squad 2 (Login Federado LDAP + JWT).
 *
 * PENDIENTE SPRINT 3: confirmar con el Squad 2 el nombre exacto del claim de rol.
 * Si difiere, se traduce aca y no en los guards.
 */
export interface JwtPayload {
  sub: string;
  username: string;
  rol: Rol;
  iss?: string;
  exp?: number;
  iat?: number;
}

declare module 'express' {
  interface Request {
    usuario?: JwtPayload;
  }
}
