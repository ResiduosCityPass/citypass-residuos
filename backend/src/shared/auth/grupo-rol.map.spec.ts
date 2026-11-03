import { Rol } from '../domain/enums';
import { resolverRol } from './grupo-rol.map';

describe('resolverRol', () => {
  it.each([
    ['residuos-administradores', Rol.ADMINISTRADOR],
    ['residuos-operadores', Rol.OPERADOR],
    // Nombres de los tokens de desarrollo.
    ['administrador', Rol.ADMINISTRADOR],
    ['operador', Rol.OPERADOR],
    ['chofer', Rol.CHOFER],
  ])('el grupo %s da el rol %s', (grupo, rol) => {
    expect(resolverRol([grupo])).toBe(rol);
  });

  it('los grupos de otros modulos no otorgan nada', () => {
    expect(resolverRol(['reclamos-administradores', 'reclamos-operadores'])).toBeUndefined();
  });

  it('un grupo desconocido se ignora y no impide reconocer el siguiente', () => {
    expect(resolverRol(['otro-grupo', 'residuos-operadores'])).toBe(Rol.OPERADOR);
  });

  it('sin grupos no hay rol', () => {
    expect(resolverRol([])).toBeUndefined();
  });
});
