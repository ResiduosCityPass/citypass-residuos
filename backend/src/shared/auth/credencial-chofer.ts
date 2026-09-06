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
 * `token_use` de la credencial del chofer.
 *
 * TODAVIA dice 'human' porque es lo unico que el guard acepta hoy. Segun
 * ADR-009 pasa a 'chofer-interno' apenas el guard lo admita, y el orden no es
 * intercambiable: un `if` que acepta un valor que nadie emite es inerte, un
 * emisor que emite un valor que el guard rechaza corta todos los ingresos de
 * chofer. Cuando eso pase, este es el unico lugar que hay que cambiar.
 *
 * El motivo del cambio: 'human' significa, en el contrato del Squad 2, una
 * persona autenticada por ellos con un `sub` de ellos. El chofer no paso por
 * ahi, y reusar el valor contamina el campo que existe para trazar quien hizo
 * que.
 */
export const TOKEN_USE_CHOFER = 'human';

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
