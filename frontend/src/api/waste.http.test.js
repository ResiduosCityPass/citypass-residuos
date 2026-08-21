import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setZoneBlocked, linkSensor, fetchMapContainers, deleteZone } from './waste.http.js';
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
});
