import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../shared/auth/public.decorator';
import { PublicoController } from './publico.controller';

/**
 * CU-11 es el unico endpoint del modulo que se sirve sin token (ADR-005).
 *
 * El guard global protege todo por defecto, asi que abrir un endpoint es
 * siempre una decision explicita. Este test la deja fijada: si alguien saca el
 * decorador, la vista ciudadana empieza a pedir login en silencio y nadie se
 * entera hasta que un vecino no puede usarla.
 */
describe('PublicoController · exposicion publica', () => {
  it('el endpoint de contenedores cercanos esta marcado como publico', () => {
    const esPublico = new Reflector().get<boolean>(
      IS_PUBLIC_KEY,
      PublicoController.prototype.buscarCercanos,
    );

    expect(esPublico).toBe(true);
  });
});
