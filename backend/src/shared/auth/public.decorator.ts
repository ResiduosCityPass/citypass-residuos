import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como accesible sin JWT.
 *
 * El guard global protege TODO por defecto (ADR-005): este decorador es la unica
 * forma de abrir un endpoint, y al ser explicito queda visible en el code review.
 * Hoy solo lo usa CU-11 (consulta ciudadana de contenedores cercanos).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
