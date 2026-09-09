import { randomBytes } from 'crypto';
import { Rol } from '../domain/enums';
import { JwtPayload } from './jwt-payload';

/**
 * Cuanto dura la credencial de un chofer. Es larga a proposito: sin login
 * federado el chofer no tiene forma de volver a entrar por su cuenta, asi que
 * una credencial que vence a mitad de turno lo deja tildado en la calle.
 *
 * Que sea larga no la vuelve irrevocable: ver `rotarSubDeChofer`.
 */
export const CREDENCIAL_CHOFER_EXPIRA_EN = '30d';

/**
 * `token_use` de la credencial del chofer (ADR-009).
 *
 * No es el 'human' del contrato del Squad 2: ese valor significa, para ellos,
 * una persona autenticada por ellos con un `sub` de ellos. El chofer no paso
 * por ahi. Reusarlo contaminaba el campo que existe para trazar quien hizo que:
 * alguien mirando ese `sub` en un evento de residuos dentro de dos meses habria
 * creido que era un identificador del Squad 2.
 *
 * Va de la mano con el emisor propio. El guard cruza los dos -- un token
 * `human` con el emisor del chofer se rechaza, y al reves tambien -- asi que
 * cambiar uno solo no alcanza.
 */
export const TOKEN_USE_CHOFER = 'chofer-interno';

/**
 * Identificador de sesion de un chofer.
 *
 * Es opaco y aleatorio a proposito: no deriva del id del chofer ni de su
 * legajo, asi que tener uno no permite adivinar el de otro.
 */
export function generarSubDeChofer(): string {
  return `chofer_${randomBytes(24).toString('hex')}`;
}

/**
 * Claims de la credencial. `iss`, `aud` y `exp` no van aca: los pone el firmado.
 */
export function payloadDeCredencialChofer(
  sub: string,
  legajo: string,
): Omit<JwtPayload, 'iss' | 'aud' | 'exp' | 'iat'> {
  return {
    sub,
    preferred_username: legajo,
    token_use: TOKEN_USE_CHOFER,
    ver: 1,
    module: 'residuos',
    groups: [Rol.CHOFER.toLowerCase()],
    jti: randomBytes(12).toString('hex'),
  };
}
