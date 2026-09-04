import { ConflictException, NotFoundException } from '@nestjs/common';
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
      buscarPorUsuarioSub: jest.fn().mockResolvedValue(null),
      listar: jest.fn().mockResolvedValue([]),
    };
    service = new ChoferesService(choferes);
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
  });
});
