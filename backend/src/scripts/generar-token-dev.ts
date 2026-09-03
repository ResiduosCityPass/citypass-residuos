import { JwtService } from '@nestjs/jwt';
import { config as cargarEnv } from 'dotenv';
import { AUDIENCIA_TOKEN_DEFAULT, EMISOR_TOKEN_DEFAULT } from '../config/env.validation';
import { payloadDePrueba } from '../shared/auth/payload-de-prueba';
import { Rol } from '../shared/domain/enums';

/**
 * Genera un JWT firmado localmente para probar la API durante los sprints 1 y 2,
 * mientras el emisor del Squad 2 no exista (ADR-005).
 *
 * Uso:  npm run token:dev -- OPERADOR
 *
 * ESTO NO ES UN SUSTITUTO DEL LOGIN FEDERADO. A partir del Sprint 3 los tokens
 * los emite el Squad 2 y este script deja de usarse.
 *
 * El script arma su propio JwtService y NO pasa por AuthModule, asi que no
 * hereda nada de su configuracion: todo lo que el guard valida se repite aca a
 * mano. El payload sale de `payloadDePrueba` justamente para que no se
 * desincronice — si se desincroniza, el sintoma es un 401 sin explicacion.
 */
cargarEnv();

const rolPedido = (process.argv[2] ?? Rol.ADMINISTRADOR).toUpperCase();

if (!Object.values(Rol).includes(rolPedido as Rol)) {
  console.error(`Rol invalido: ${rolPedido}`);
  console.error(`Roles disponibles: ${Object.values(Rol).join(', ')}`);
  process.exit(1);
}

const rol = rolPedido as Rol;
const jwt = new JwtService({ secret: process.env.JWT_SECRET });

const token = jwt.sign(payloadDePrueba(rol, `dev-${rolPedido.toLowerCase()}`), {
  // El tipo de `expiresIn` viene de la libreria `ms` y no acepta un string
  // generico; el valor real sale del entorno. Mismo acotamiento que AuthModule.
  expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as '8h',
  issuer: process.env.JWT_ISSUER ?? EMISOR_TOKEN_DEFAULT,
  // Lista, no string suelto: el guard rechaza cualquier `aud` que no sea array.
  audience: [process.env.JWT_AUDIENCE ?? AUDIENCIA_TOKEN_DEFAULT],
});

console.log(token);
