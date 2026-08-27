import { Rol } from '../domain/enums';

/**
 * Claims del token humano emitido por el IdP del Squad 2.
 * Ver docs/arquitectura/contrato-identidad-token.md (§3).
 */
export interface JwtPayload {
  iss: string;
  sub: string;
  aud: string[];
  token_use: 'human' | 'service';
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
