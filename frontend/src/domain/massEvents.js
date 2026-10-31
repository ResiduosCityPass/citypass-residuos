/**
 * Squad 3 · Actividades masivas de Espacios.
 *
 * Cuando termina la actividad, la escuadrilla sale a limpiar los contenedores
 * de la zona: por eso al operador le importa la hora de fin, no la de inicio.
 */

/** Azul del design system: no se confunde con los colores de estado de los contenedores. */
export const MASS_EVENT_COLOR = '#2563A6';

/** "20:00", en hora de Buenos Aires. */
export function endTime(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/** "2 h 15 min", "40 min", "menos de 1 min". */
function duration(ms) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'menos de 1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "Termina a las 20:00 (en 2 h 15 min)" o "Terminó a las 20:00 (hace 40 min)". */
export function endLabel(iso, now = Date.now()) {
  const left = new Date(iso).getTime() - now;
  return left > 0
    ? `Termina a las ${endTime(iso)} (en ${duration(left)})`
    : `Terminó a las ${endTime(iso)} (hace ${duration(-left)})`;
}
