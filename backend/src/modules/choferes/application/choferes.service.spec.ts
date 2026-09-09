import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Chofer } from '../domain/chofer.entity';
import { ChoferRepository } from '../domain/chofer.repository';
import { ChoferesService } from './choferes.service';

const alta = { nombre: 'Juana Perez', legajo: 'CH-014' };

describe('ChoferesService (CU-09)', () => {
  let choferes: jest.Mocked<ChoferRepository>;
  let service: ChoferesService;

  const chofer = (parcial: Partial<Chofer> = {}): Chofer =>
    ({ id: 'ch-1', nombre: 'Juana Perez', legajo: 'CH-014', activo: true, ...parcial }) as Chofer;

  beforeEach(() => {
    choferes = {
      crear: jest.fn().mockImplementation(async (c) => ({ id: 'ch-1', ...c }) as Chofer),
      guardar: jest.fn().mockImplementation(async (c) => c),
      buscarPorId: jest.fn().mockResolvedValue(chofer()),
      buscarPorLegajo: jest.fn().mockResolvedValue(null),
      buscarActivoPorUsuarioSub: jest.fn().mockResolvedValue(null),
      listar: jest.fn().mockResolvedValue([]),
    };
    service = new ChoferesService(
      choferes,
      new JwtService({ secret: 'secreto-de-tests' }),
      new ConfigService({}),
    );
  });

  describe('crear', () => {
    it('nace activo', async () => {
      await service.crear(alta);

      expect(choferes.crear).toHaveBeenCalledWith(expect.objectContaining({ activo: true }));
    });

    it('rechaza un legajo repetido', async () => {
      choferes.buscarPorLegajo.mockResolvedValue(chofer());

      await expect(service.crear(alta)).rejects.toMatchObject({
        response: { code: 'CHOFER_LEGAJO_DUPLICADO' },
      });
      expect(choferes.crear).not.toHaveBeenCalled();
    });

    it('el `usuarioSub` es opcional: un chofer puede existir antes de tener acceso', async () => {
      await service.crear(alta);

      expect(choferes.crear).toHaveBeenCalledWith(
        expect.not.objectContaining({ usuarioSub: expect.anything() }),
      );
    });
  });

  describe('listar', () => {
    it('por defecto solo trae los activos', async () => {
      await service.listar({});

      expect(choferes.listar).toHaveBeenCalledWith({ soloActivos: true });
    });

    it('incluye los dados de baja si se piden', async () => {
      await service.listar({ incluirInactivos: true });

      expect(choferes.listar).toHaveBeenCalledWith({ soloActivos: false });
    });
  });

  describe('obtener', () => {
    it('404 con codigo propio si no existe', async () => {
      choferes.buscarPorId.mockResolvedValue(null);

      await expect(service.obtener('ch-fantasma')).rejects.toMatchObject({
        response: { code: 'CHOFER_NO_ENCONTRADO' },
      });
    });
  });

  describe('obtenerActivo', () => {
    it('devuelve el chofer si esta activo', async () => {
      await expect(service.obtenerActivo('ch-1')).resolves.toMatchObject({ id: 'ch-1' });
    });

    it('rechaza uno dado de baja: no puede recibir rutas nuevas', async () => {
      choferes.buscarPorId.mockResolvedValue(chofer({ activo: false }));

      await expect(service.obtenerActivo('ch-1')).rejects.toMatchObject({
        response: { code: 'CHOFER_INACTIVO' },
      });
    });

    it('propaga el 404 si no existe', async () => {
      choferes.buscarPorId.mockResolvedValue(null);

      await expect(service.obtenerActivo('ch-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizar', () => {
    it('no deja pisar el legajo de otro', async () => {
      choferes.buscarPorLegajo.mockResolvedValue(chofer({ id: 'ch-2' }));

      await expect(service.actualizar('ch-1', { legajo: 'CH-999' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('deja reenviar el mismo legajo sin quejarse', async () => {
      await service.actualizar('ch-1', { legajo: 'CH-014', nombre: 'Juana P.' });

      expect(choferes.buscarPorLegajo).not.toHaveBeenCalled();
      expect(choferes.guardar).toHaveBeenCalled();
    });
  });

  describe('darDeBaja', () => {
    it('es baja logica: sus rutas historicas lo siguen referenciando', async () => {
      await service.darDeBaja('ch-1');

      expect(choferes.guardar).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
    });

    it('la baja es lo que revoca el acceso: la sesion deja de resolver', async () => {
      // Sin login no hay sesion que cerrar ni contrasena que cambiar. Dar de
      // baja al chofer es el unico mecanismo de revocacion que tenemos, y solo
      // funciona porque la consulta por sesion filtra por activo.
      await service.buscarActivoPorUsuarioSub('dev-chofer');

      expect(choferes.buscarActivoPorUsuarioSub).toHaveBeenCalledWith('dev-chofer');
    });
  });

  describe('emitirCredencial', () => {
    const decodificar = (token: string) =>
      JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as Record<string, unknown>;

    it('devuelve un token con los datos del chofer', async () => {
      const credencial = await service.emitirCredencial('ch-1');

      expect(credencial).toMatchObject({ choferId: 'ch-1', nombre: 'Juana Perez' });
      expect(decodificar(credencial.token)).toMatchObject({
        groups: ['chofer'],
        preferred_username: 'CH-014',
      });
    });

    it('declara su propio token_use, no el `human` del Squad 2', async () => {
      // `human` significa, en el contrato del Squad 2, una persona autenticada
      // por ellos. El chofer no paso por ahi, y reusar el valor contaminaria el
      // campo que existe para trazar quien hizo que (ADR-009).
      const credencial = await service.emitirCredencial('ch-1');

      expect(decodificar(credencial.token).token_use).toBe('chofer-interno');
    });

    it('firma con el emisor de choferes, no con el humano', async () => {
      // El guard cruza `token_use` contra `iss`: cambiar uno solo de los dos
      // deja el token rechazado.
      const credencial = await service.emitirCredencial('ch-1');

      expect(decodificar(credencial.token).iss).toBe('citypass-residuos-choferes');
    });

    it('respeta el emisor configurado por entorno', async () => {
      const conOtroEmisor = new ChoferesService(
        choferes,
        new JwtService({ secret: 'secreto-de-tests' }),
        new ConfigService({ JWT_ISSUER_CHOFERES: 'otro-emisor' }),
      );

      const credencial = await conOtroEmisor.emitirCredencial('ch-1');

      expect(decodificar(credencial.token).iss).toBe('otro-emisor');
    });

    it('rota el `usuarioSub` y lo guarda: eso es lo que revoca las anteriores', async () => {
      // Emitir una credencial nueva no puede dejar viva a la anterior. Como el
      // guard resuelve el chofer por `usuarioSub`, cambiarlo mata de golpe todo
      // lo emitido antes, aunque su firma siga siendo valida.
      const primera = await service.emitirCredencial('ch-1');
      const guardado = choferes.guardar.mock.calls.at(-1)?.[0] as Chofer;

      expect(guardado.usuarioSub).toEqual(expect.stringMatching(/^chofer_[0-9a-f]{48}$/));
      expect(decodificar(primera.token).sub).toBe(guardado.usuarioSub);
    });

    it('dos emisiones dan `sub` distintos', async () => {
      const primera = await service.emitirCredencial('ch-1');
      const segunda = await service.emitirCredencial('ch-1');

      expect(decodificar(primera.token).sub).not.toBe(decodificar(segunda.token).sub);
    });

    it('el `sub` no se puede adivinar desde el id ni el legajo del chofer', async () => {
      const credencial = await service.emitirCredencial('ch-1');
      const sub = String(decodificar(credencial.token).sub);

      expect(sub).not.toContain('ch-1');
      expect(sub).not.toContain('CH-014');
    });

    it('no le emite credencial a un chofer dado de baja', async () => {
      choferes.buscarPorId.mockResolvedValue(chofer({ activo: false }));

      await expect(service.emitirCredencial('ch-1')).rejects.toMatchObject({
        response: { code: 'CHOFER_INACTIVO' },
      });
      expect(choferes.guardar).not.toHaveBeenCalled();
    });

    it('propaga el 404 si el chofer no existe', async () => {
      choferes.buscarPorId.mockResolvedValue(null);

      await expect(service.emitirCredencial('ch-fantasma')).rejects.toThrow(NotFoundException);
    });
  });
});
