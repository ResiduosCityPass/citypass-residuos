import { ConflictException, NotFoundException } from '@nestjs/common';
import { RutaRepository } from '../../rutas/domain/ruta.repository';
import { Chofer } from '../domain/chofer.entity';
import { ChoferRepository } from '../domain/chofer.repository';
import { ChoferesService } from './choferes.service';

const alta = { nombre: 'Juana Perez', legajo: 'CH-014' };

describe('ChoferesService (CU-09)', () => {
  let choferes: jest.Mocked<ChoferRepository>;
  let rutas: jest.Mocked<Pick<RutaRepository, 'buscarActivaDeChofer'>>;
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
    rutas = { buscarActivaDeChofer: jest.fn().mockResolvedValue(null) };
    service = new ChoferesService(choferes, rutas as unknown as RutaRepository);
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
    it('NO deja dar de baja a alguien con una ruta activa', async () => {
      // La baja le saca el acceso, con lo cual deja de poder cerrar sus paradas.
      // Como la ruta solo cierra cuando no le queda ninguna pendiente y el
      // camion solo se libera cuando la ruta cierra, esto dejaba el camion
      // EN_RUTA para siempre, y CU-03 no deja sacarlo de ahi a mano.
      rutas.buscarActivaDeChofer.mockResolvedValue({ estado: 'ASIGNADA' } as never);

      await expect(service.darDeBaja('ch-1')).rejects.toMatchObject({
        response: { code: 'CHOFER_CON_RUTA_ACTIVA' },
      });
      expect(choferes.guardar).not.toHaveBeenCalled();
    });

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
    it('emite un código de 32 caracteres sin guardar el secreto', async () => {
      const credencial = await service.emitirCredencial('ch-1');
      expect(credencial).toMatchObject({
        choferId: 'ch-1',
        nombre: 'Juana Perez',
        expiraEn: '30d',
      });
      expect(credencial.token).toHaveLength(32);
      expect(credencial.token).toMatch(/^CH-[A-Za-z0-9_-]{22}-[0-9a-z]{6}$/);
      const saved = choferes.guardar.mock.calls.at(-1)?.[0] as Chofer;
      expect(saved.usuarioSub).toMatch(/^chofer_codigo_[0-9a-f]{64}$/);
      expect(JSON.stringify(saved)).not.toContain(credencial.token);
    });

    it('dos emisiones rotan la identidad y revocan la anterior', async () => {
      const primera = await service.emitirCredencial('ch-1');
      const sub = (choferes.guardar.mock.calls.at(-1)?.[0] as Chofer).usuarioSub;
      const segunda = await service.emitirCredencial('ch-1');
      expect(primera.token).not.toBe(segunda.token);
      expect((choferes.guardar.mock.calls.at(-1)?.[0] as Chofer).usuarioSub).not.toBe(sub);
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

  describe('reactivar', () => {
    it('deshace la baja', async () => {
      // Sin esto un clic equivocado era permanente: el chofer no volvia, y como
      // el legajo es unico tampoco se lo podia dar de alta de nuevo.
      choferes.buscarPorId.mockResolvedValue(chofer({ activo: false }));

      await service.reactivar('ch-1');

      expect(choferes.guardar).toHaveBeenCalledWith(expect.objectContaining({ activo: true }));
    });

    it('propaga el 404 si no existe', async () => {
      choferes.buscarPorId.mockResolvedValue(null);

      await expect(service.reactivar('ch-1')).rejects.toThrow(NotFoundException);
    });
  });
});
