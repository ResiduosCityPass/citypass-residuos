/**
 * Normaliza la patente antes de guardarla o compararla.
 *
 * Sin esto, "ab 123 cd" y "AB123CD" serian dos camiones distintos y la
 * restriccion de unicidad no serviria de nada.
 */
export function normalizarPatente(patente: string): string {
  return patente.trim().toUpperCase().replace(/\s+/g, '');
}
