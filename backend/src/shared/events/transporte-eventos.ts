/**
 * Token del transporte real de eventos.
 *
 * Se separa de EVENT_PUBLISHER a proposito (ADR-003):
 *
 *   EVENT_PUBLISHER    lo usa el dominio. Hoy escribe en la tabla outbox.
 *   TRANSPORTE_EVENTOS lo usa solo el despachador. Es el broker de verdad.
 *
 * Asi el dominio no sabe —ni tiene por que saber— si el evento sale ya mismo o
 * dentro de cinco segundos tras dos reintentos. Cuando el Squad 1 defina el bus,
 * lo unico que cambia es que implementacion se ata a TRANSPORTE_EVENTOS.
 */
export const TRANSPORTE_EVENTOS = Symbol('TRANSPORTE_EVENTOS');
