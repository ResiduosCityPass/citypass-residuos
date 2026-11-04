import { Rol } from '../domain/enums';

/**
 * Traduccion grupos del IdP -> Rol interno (ADR-005, matriz de autorizacion).
 *
 * Nombres de grupo coordinados con el Squad 2: solo minusculas, numeros y guiones
 * (contrato de identidad, ver docs/arquitectura/contrato-identidad-token.md §5).
 * No hay grupo para Ciudadano: CU-11 es @Public(), no requiere login.
 *
 * PENDIENTE: confirmar con el delegado del panel del Squad 2 que estos son los nombres
 * dados de alta. Si difieren, se corrige aca, no en los guards.
 */
const GRUPO_A_ROL: Record<string, Rol> = {
  // Nombres que se crean en el panel del Login, con el formato de Reclamos
  // (reclamos-administradores, reclamos-operadores). El chofer no tiene grupo
  // aca: entra con la credencial interna de ADR-009.
  'residuos-administradores': Rol.ADMINISTRADOR,
  'residuos-operadores': Rol.OPERADOR,
  // Nombres de los sprints 1 y 2, que usan los tokens de desarrollo
  // (`npm run token:dev`). Se sacan cuando el Login real este en uso.
  administrador: Rol.ADMINISTRADOR,
  operador: Rol.OPERADOR,
  chofer: Rol.CHOFER,
};

/**
 * Resuelve el rol interno a partir de los grupos del token.
 *
 * El rol único se resuelve por prioridad ADMINISTRADOR > OPERADOR > CHOFER,
 * independientemente del orden de los grupos LDAP. Los grupos desconocidos no
 * otorgan permisos. El guard federado comparte esta regla con su mapa configurable.
 */
export function resolverRol(
  groups: string[],
  mapeo: ReadonlyMap<string, Rol> = new Map(Object.entries(GRUPO_A_ROL)),
): Rol | undefined {
  const presentes = new Set(groups.map((grupo) => mapeo.get(grupo)));
  return [Rol.ADMINISTRADOR, Rol.OPERADOR, Rol.CHOFER].find((rol) => presentes.has(rol));
}
