import { createHash, randomBytes } from 'crypto';

/**
 * Credencial del sensor (ADR-005).
 *
 * Se usa SHA-256 y no bcrypt a proposito: una API key son 32 bytes aleatorios,
 * no una contrasenia elegida por una persona. Contra alta entropia el ataque de
 * diccionario no aplica, y el hash rapido importa porque este valor se verifica
 * en cada `POST /lecturas`, que es el endpoint mas caliente del modulo.
 */
export function generarApiKey(): string {
  return randomBytes(32).toString('hex');
}

export function hashearApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}
