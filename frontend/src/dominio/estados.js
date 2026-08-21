/**
 * Vocabulario del dominio, tal cual lo devuelve la API.
 * Fuente: docs/arquitectura/guia-frontend.md, seccion 2.
 * Si agregas un valor aca, revisa que exista en backend/src/shared/domain/enums.ts.
 */

export const ESTADO = {
  NORMAL: 'NORMAL',
  ADVERTENCIA: 'ADVERTENCIA',
  CRITICO: 'CRITICO',
  FUERA_DE_SERVICIO: 'FUERA_DE_SERVICIO',
};

/** El color del marcador sale SOLO del nivel de llenado. El incendio se pinta aparte. */
export const COLOR_POR_ESTADO = {
  NORMAL: '#22a06b',
  ADVERTENCIA: '#e2b53e',
  CRITICO: '#d64545',
  FUERA_DE_SERVICIO: '#8d949e',
};

export const ETIQUETA_ESTADO = {
  NORMAL: 'Normal',
  ADVERTENCIA: 'Advertencia',
  CRITICO: 'Critico',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

export const ETIQUETA_TIPO_RESIDUO = {
  COMUN: 'Comun',
  RECICLABLE: 'Reciclable',
  ORGANICO: 'Organico',
};

export const colorDeEstado = (estado) => COLOR_POR_ESTADO[estado] ?? COLOR_POR_ESTADO.FUERA_DE_SERVICIO;

/**
 * Un contenedor sin sensor se queda en NORMAL con nivel 0 y ultimaLecturaEn null
 * para siempre. No es un contenedor vacio: es uno que no reporta, y conviene
 * distinguirlo en la UI para no mostrar un verde que miente.
 */
export const nuncaReporto = (contenedor) => contenedor.ultimaLecturaEn === null;

/** "hace 3 min" a partir de un ISO, o un guion si nunca reporto. */
export function haceCuanto(iso) {
  if (!iso) return '—';
  const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'hace instantes';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}
