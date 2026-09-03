import { JwtService } from '@nestjs/jwt';
import { config as cargarEnv } from 'dotenv';
import { EMISOR_TOKEN_DEFAULT } from '../config/env.validation';
import { Rol } from '../shared/domain/enums';

/**
 * Genera un JWT firmado localmente para probar la API durante los sprints 1 y 2,
 * mientras el emisor del Squad 2 no exista (ADR-005).
 *
 * Uso:  npm run token:dev -- OPERADOR
 *
 * ESTO NO ES UN SUSTITUTO DEL LOGIN FEDERADO. A partir del Sprint 3 los tokens
 * los emite el Squad 2 y este script deja de usarse.
 */
cargarEnv();

const rolPedido = (process.argv[2] ?? Rol.ADMINISTRADOR).toUpperCase();

if (!Object.values(Rol).includes(rolPedido as Rol)) {
  console.error(`Rol invalido: ${rolPedido}`);
  console.error(`Roles disponibles: ${Object.values(Rol).join(', ')}`);
  process.exit(1);
}

const jwt = new JwtService({ secret: process.env.JWT_SECRET });

const token = jwt.sign(
  {
    sub: `dev-${rolPedido.toLowerCase()}`,
    username: `${rolPedido.toLowerCase()}@dev.local`,
    rol: rolPedido,
  },
  // Mismo valor por defecto que usa la aplicacion: este script firma por su
  // cuenta, y sin el falla con "issuer must be a string" si no hay `.env`.
  { expiresIn: '8h', issuer: process.env.JWT_ISSUER ?? EMISOR_TOKEN_DEFAULT },
);

console.log(token);
