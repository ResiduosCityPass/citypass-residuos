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
  administrador: Rol.ADMINISTRADOR,
  operador: Rol.OPERADOR,
  chofer: Rol.CHOFER,
};

/**
 * Resuelve el rol interno a partir de los grupos del token.
 *
 * El contrato modela pertenencia a *varios* grupos; nuestra matriz de ADR-005 asume un
 * rol *unico* por persona. Hasta que un caso de uso real pida lo contrario, se toma el
 * primer grupo reconocido en el orden en que vino el array. Un grupo desconocido nunca
 * otorga nada (contrato §5) ni hace fallar la resolucion: simplemente se ignora.
 */
export function resolverRol(groups: string[]): Rol | undefined {
  for (const grupo of groups) {
    const rol = GRUPO_A_ROL[grupo];
    if (rol) {
      return rol;
    }
  }
  return undefined;
}
