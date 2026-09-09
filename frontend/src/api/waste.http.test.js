import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setZoneBlocked,
  linkSensor,
  fetchMapContainers,
  deleteZone,
  fetchDrivers,
  assignRoute,
  fetchMyRoute,
  confirmStop,
  skipStop,
  fetchNearbyContainers,
} from './waste.http.js';
import { saveToken } from './client.js';

/**
 * Estas funciones son de una linea, pero la linea tiene forma: el metodo, la
 * ruta y donde va cada parametro. Equivocarse ahi no se descubre hasta que el
 * backend responde 404, y con mocks encendidos eso puede tardar semanas.
 */
describe('rutas contra la API real', () => {
  beforeEach(() => {
    saveToken('un-jwt');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
  });

  const calledPath = () => globalThis.fetch.mock.calls[0][0];
  const calledOptions = () => globalThis.fetch.mock.calls[0][1];

  it('el bloqueo de zona manda el valor por query, no en el cuerpo', async () => {
    await setZoneBlocked('zn-1', true);

    expect(calledPath()).toMatch(/\/zonas\/zn-1\/bloqueo\?bloqueada=true$/);
    expect(calledOptions().method).toBe('PATCH');
  });

  it('vincular sensor sin codigo manda un objeto vacio, no null', async () => {
    // El backend genera SN-0001 cuando no recibe codigo, pero rechaza un cuerpo
    // que no sea JSON valido.
    await linkSensor('ct-1', {});

    expect(calledPath()).toMatch(/\/contenedores\/ct-1\/sensor$/);
    expect(calledOptions().body).toBe('{}');
  });

  it('los filtros vacios del mapa no ensucian el query string', async () => {
    await fetchMapContainers({ zonaId: 'zn-1', tipoResiduo: '', estado: undefined });

    expect(calledPath()).toMatch(/\/mapa\/contenedores\?zonaId=zn-1$/);
  });

  it('borrar una zona usa DELETE', async () => {
    await deleteZone('zn-1');

    expect(calledPath()).toMatch(/\/zonas\/zn-1$/);
    expect(calledOptions().method).toBe('DELETE');
  });

  it('manda el token en el header de autorizacion', async () => {
    await fetchMapContainers();

    expect(calledOptions().headers.Authorization).toBe('Bearer un-jwt');
  });

  /* --- CU-09 ------------------------------------------------------------ */

  /**
   * El selector se llena con los ACTIVOS, que es el default del endpoint: son
   * los unicos a los que se les puede asignar una ruta. Pedir los inactivos es
   * una decision explicita de una pantalla de administracion, no del selector.
   */
  it('el listado de choferes no pide los inactivos', async () => {
    await fetchDrivers();

    expect(calledPath()).toMatch(/\/choferes$/);
    expect(calledPath()).not.toContain('incluirInactivos');
  });

  /**
   * Lo que cambio en el Sprint 3 (ADR-009): `choferId` era un string libre que
   * el backend no validaba contra nada, y un identificador mal tipeado asignaba
   * la ruta CON EXITO dejando al chofer sin verla nunca. Ahora es el uuid de un
   * chofer de `GET /choferes`. El test fija que viaja tal cual, sin envolver.
   */
  it('asignar manda el uuid del chofer en el cuerpo', async () => {
    await assignRoute('rt-1', { choferId: '8f2c1d4e-6b3a-4f21-9c07-5d2e1a9b4c33' });

    expect(calledPath()).toMatch(/\/rutas\/rt-1\/asignar$/);
    expect(calledOptions().method).toBe('PATCH');
    expect(calledOptions().body).toBe('{"choferId":"8f2c1d4e-6b3a-4f21-9c07-5d2e1a9b4c33"}');
  });

  /* --- CU-10 ------------------------------------------------------------ */

  it('confirmar una parada manda exactamente lat y lng', async () => {
    await confirmStop('pd-02', { lat: -34.6, lng: -58.38 });

    expect(calledPath()).toMatch(/\/paradas\/pd-02\/confirmar$/);
    expect(calledOptions().method).toBe('PATCH');
    expect(calledOptions().body).toBe('{"lat":-34.6,"lng":-58.38}');
  });

  /**
   * El otro final de la parada. El motivo va en el CUERPO —no como query param
   * como el bloqueo de zonas o el fuera de servicio—, porque es texto libre de
   * hasta 200 caracteres escrito por una persona, no un booleano.
   *
   * Y no viaja ninguna posicion: omitir no valida el radio de 100 m.
   */
  it('omitir una parada manda el motivo en el cuerpo y nada mas', async () => {
    await skipStop('pd-02', 'Calle cortada');

    expect(calledPath()).toMatch(/\/paradas\/pd-02\/omitir$/);
    expect(calledOptions().method).toBe('PATCH');
    expect(calledOptions().body).toBe('{"motivo":"Calle cortada"}');
  });

  /**
   * La identidad del chofer sale del JWT. Este test existe para que agregarle
   * un `?choferId=` a la firma rompa algo: si el chofer viajara por query
   * string, cualquiera podria leer la ruta de otro cambiando un valor.
   */
  it('mi ruta no manda el chofer por query, ni cuando se lo pasan', async () => {
    await fetchMyRoute('ldap:mgomez');

    expect(calledPath()).toMatch(/\/rutas\/mias$/);
    expect(calledPath()).not.toContain('chofer');
  });

  /* --- CU-11 ------------------------------------------------------------ */

  it('los cercanos van al endpoint publico y sin Authorization', async () => {
    await fetchNearbyContainers({ lat: -34.6, lng: -58.38, radioMetros: 1000, tipoResiduo: '' });

    expect(calledPath()).toMatch(/\/publico\/contenedores\/cercanos\?/);
    expect(calledPath()).toContain('radioMetros=1000');
    // tipoResiduo vacio no ensucia el query string.
    expect(calledPath()).not.toContain('tipoResiduo');
    expect(calledOptions().headers.Authorization).toBeUndefined();
  });
});
