import { AUDIENCIA_TOKEN_DEFAULT } from '../../config/env.validation';
import { Rol } from '../domain/enums';
import { JwtPayload } from './jwt-payload';

/**
 * Grupos del IdP que corresponden a cada rol interno. Es el inverso de
 * `grupo-rol.map.ts`: el token trae grupos, no roles.
 */
export const GRUPO_DE_ROL: Record<Rol, string> = {
  [Rol.ADMINISTRADOR]: 'administrador',
  [Rol.OPERADOR]: 'operador',
  [Rol.CHOFER]: 'chofer',
  [Rol.CIUDADANO]: 'ciudadano',
};

/**
 * Claims de un token humano valido, con la forma que exige el contrato del
 * Squad 2. Lo usan el generador de tokens de desarrollo y los tests.
 *
 * Existe para que haya UN solo lugar donde se arma el payload: mientras el
 * emisor real no exista, cada sitio que firme por su cuenta se desincroniza del
 * guard, y el sintoma es un 401 sin explicacion.
 *
 * `iss`, `aud` y `exp` NO van aca: los pone `signOptions` al firmar.
 */
export function payloadDePrueba(
  rol: Rol,
  sub: string,
): Omit<JwtPayload, 'iss' | 'aud' | 'exp' | 'iat'> {
  return {
    sub,
    preferred_username: `${rol.toLowerCase()}@dev.local`,
    token_use: 'human',
    ver: 1,
    module: 'residuos',
    groups: [GRUPO_DE_ROL[rol]],
    jti: `dev-${Date.now()}`,
  };
}

export { AUDIENCIA_TOKEN_DEFAULT };
