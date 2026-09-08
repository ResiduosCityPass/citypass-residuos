import { Rol } from '../domain/enums';

/**
 * Claims del token. La forma es la del contrato del Squad 2
 * (docs/arquitectura/contrato-identidad-token.md §3) para `human`/`service`.
 *
 * `chofer-interno` no es del Squad 2 (ADR-009): reusa la misma forma de
 * payload por conveniencia, pero `iss` y `token_use` marcan que es una
 * identidad nuestra, nunca una persona autenticada por ellos.
 */
export interface JwtPayload {
  iss: string;
  sub: string;
  aud: string[];
  token_use: 'human' | 'service' | 'chofer-interno';
  ver: number;
  preferred_username: string;
  module: string;
  groups: string[];
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Claims + rol interno ya resuelto a partir de `groups` (ver grupo-rol.map.ts).
 * `rol` es `undefined` si ninguno de los grupos del token es uno que reconocemos:
 * RolesGuard lo trata igual que "sin permiso", nunca como error (contrato §5).
 */
export interface UsuarioAutenticado extends JwtPayload {
  rol?: Rol;
}

declare module 'express' {
  interface Request {
    usuario?: UsuarioAutenticado;
  }
}
