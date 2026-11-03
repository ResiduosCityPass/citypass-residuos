import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { credencialChoferDemo, planEscenarioInundacion } from './escenario-inundacion';

describe('Escenario de inundacion reproducible', () => {
  it('normaliza el escenario y mantiene identidades separadas entre ensayos', () => {
    const primero = planEscenarioInundacion(' clima01 ');
    expect(primero).toEqual(planEscenarioInundacion('CLIMA01'));
    expect(primero.chofer.id).not.toBe(planEscenarioInundacion('CLIMA02').chofer.id);
    expect(primero.zonas.centro.nombre).not.toBe(primero.zonas.norte.nombre);
    expect(primero).not.toHaveProperty('usuarioSub');
  });

  it.each(['', '../main', 'x;delete', 'MUYLARGO123', '123', 'DOS PALABRAS'])(
    'rechaza el nombre inseguro %s antes de abrir la base',
    (nombre) => {
      expect(() => planEscenarioInundacion(nombre)).toThrow('escenario');
    },
  );

  describe('Credencial interna del chofer de demo', () => {
    const buscar = jest.fn();
    const db = { manager: { findOneBy: buscar } } as unknown as DataSource;
    beforeEach(() => buscar.mockReset());

    it('firma solo para el chofer, con issuer propio y vencimiento de dos horas', async () => {
      buscar.mockResolvedValue({
        activo: true,
        usuarioSub: 'chofer_aleatorio',
        legajo: 'DEMO-CLIMA01',
      });
      const token = await credencialChoferDemo(db, 'CLIMA01', {
        JWT_SECRET: 'secreto-prueba',
        JWT_ISSUER_CHOFERES: 'issuer-chofer',
        JWT_AUDIENCE: 'api-prueba',
      });
      const claims = new JwtService().verify(token, {
        secret: 'secreto-prueba',
        issuer: 'issuer-chofer',
        audience: 'api-prueba',
        algorithms: ['HS256'],
      });
      expect(claims).toMatchObject({
        sub: 'chofer_aleatorio',
        token_use: 'chofer-interno',
        module: 'residuos',
        groups: ['chofer'],
      });
      expect(claims.exp - claims.iat).toBe(7200);
      expect(buscar.mock.calls[0][1]).toEqual({
        id: planEscenarioInundacion('CLIMA01').chofer.id,
        legajo: 'DEMO-CLIMA01',
      });
    });

    it('usa los defaults de issuer y audiencia de chofer, nunca el issuer humano', async () => {
      buscar.mockResolvedValue({
        activo: true,
        usuarioSub: 'chofer_aleatorio',
        legajo: 'DEMO-CLIMA01',
      });
      const token = await credencialChoferDemo(db, 'CLIMA01', {
        JWT_SECRET: 'secreto-prueba',
        JWT_ISSUER: 'issuer-humano',
      });
      expect(new JwtService().verify(token, { secret: 'secreto-prueba' })).toMatchObject({
        iss: 'citypass-residuos-choferes',
        aud: ['citypass-residuos-api'],
      });
    });

    it('no genera una credencial sin secreto ni consulta la base', async () => {
      await expect(credencialChoferDemo(db, 'CLIMA01', {})).rejects.toThrow('JWT_SECRET');
      expect(buscar).not.toHaveBeenCalled();
    });

    it.each([null, { activo: false, usuarioSub: 'revocado' }, { activo: true, usuarioSub: null }])(
      'rechaza un chofer inexistente o revocado: %j',
      async (chofer) => {
        buscar.mockResolvedValue(chofer);
        await expect(
          credencialChoferDemo(db, 'CLIMA01', { JWT_SECRET: 'secreto-prueba' }),
        ).rejects.toThrow('sesion activa');
      },
    );
  });
});
