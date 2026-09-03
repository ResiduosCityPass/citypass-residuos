import { ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoCamion, TipoResiduo } from '../../../shared/domain/enums';
import { Camion } from '../domain/camion.entity';
import { CamionRepository } from '../domain/camion.repository';
import { FlotaService } from './flota.service';

const alta = {
  patente: 'AB123CD',
  capacidadLitros: 12000,
  tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
};

const camionDe = (parcial: Partial<Camion> = {}): Camion =>
  ({
    id: 'cm-1',
    patente: 'AB123CD',
    capacidadLitros: 12000,
    tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
    estado: EstadoCamion.DISPONIBLE,
    ...parcial,
  }) as Camion;

describe('FlotaService (CU-03)', () => {
  let repo: jest.Mocked<CamionRepository>;
  let service: FlotaService;

  beforeEach(() => {
    repo = {
      crear: jest.fn().mockImplementation(async (c) => ({ id: 'cm-1', ...c }) as Camion),
      guardar: jest.fn().mockImplementation(async (c) => c),
      buscarPorId: jest.fn(),
      buscarPorPatente: jest.fn().mockResolvedValue(null),
      listar: jest.fn().mockResolvedValue([]),
    };
    service = new FlotaService(repo);
  });

  describe('crear', () => {
    it('da de alta el camion', async () => {
      const camion = await service.crear(alta);

      expect(camion.patente).toBe('AB123CD');
      expect(camion.capacidadLitros).toBe(12000);
    });

    it('todo camion nace DISPONIBLE', async () => {
      // No hay ninguna ruta a la que pertenezca todavia, asi que ningun otro
      // estado significaria nada.
      expect(repo.crear).not.toHaveBeenCalled();

      await service.crear(alta);

      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoCamion.DISPONIBLE }),
      );
    });

    it('normaliza la patente antes de guardarla', async () => {
      await service.crear({ ...alta, patente: '  ab 123 cd  ' });

      expect(repo.crear).toHaveBeenCalledWith(expect.objectContaining({ patente: 'AB123CD' }));
    });

    it('detecta la patente duplicada aunque venga escrita distinto', async () => {
      repo.buscarPorPatente.mockResolvedValue(camionDe());

      await expect(service.crear({ ...alta, patente: 'ab 123 cd' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.buscarPorPatente).toHaveBeenCalledWith('AB123CD');
    });

    it('no guarda nada si la patente ya existe', async () => {
      repo.buscarPorPatente.mockResolvedValue(camionDe());

      await expect(service.crear(alta)).rejects.toMatchObject({
        response: { code: 'CAMION_PATENTE_DUPLICADA' },
      });
      expect(repo.crear).not.toHaveBeenCalled();
    });
  });

  describe('listar', () => {
    it('propaga los filtros', async () => {
      await service.listar({
        estado: EstadoCamion.DISPONIBLE,
        tipoResiduoHabilitado: TipoResiduo.ORGANICO,
      });

      expect(repo.listar).toHaveBeenCalledWith({
        estado: EstadoCamion.DISPONIBLE,
        tipoResiduoHabilitado: TipoResiduo.ORGANICO,
      });
    });
  });

  describe('obtener', () => {
    it('falla con 404 si el camion no existe', async () => {
      repo.buscarPorId.mockResolvedValue(null);

      await expect(service.obtener('cm-fantasma')).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizar', () => {
    it('aplica los cambios', async () => {
      repo.buscarPorId.mockResolvedValue(camionDe());

      const camion = await service.actualizar('cm-1', { capacidadLitros: 20000 });

      expect(camion.capacidadLitros).toBe(20000);
    });

    it('manda el camion a mantenimiento', async () => {
      repo.buscarPorId.mockResolvedValue(camionDe());

      const camion = await service.actualizar('cm-1', { estado: EstadoCamion.MANTENIMIENTO });

      expect(camion.estado).toBe(EstadoCamion.MANTENIMIENTO);
    });

    it('normaliza la patente nueva', async () => {
      repo.buscarPorId.mockResolvedValue(camionDe());

      const camion = await service.actualizar('cm-1', { patente: 'xy 999 zz' });

      expect(camion.patente).toBe('XY999ZZ');
    });

    it('no considera duplicada la patente propia escrita distinto', async () => {
      repo.buscarPorId.mockResolvedValue(camionDe());

      await expect(service.actualizar('cm-1', { patente: 'ab 123 cd' })).resolves.toBeDefined();
      expect(repo.buscarPorPatente).not.toHaveBeenCalled();
    });

    it('rechaza mover la patente a una que ya usa otro camion', async () => {
      repo.buscarPorId.mockResolvedValue(camionDe());
      repo.buscarPorPatente.mockResolvedValue(camionDe({ id: 'cm-2', patente: 'XY999ZZ' }));

      await expect(service.actualizar('cm-1', { patente: 'XY999ZZ' })).rejects.toMatchObject({
        response: { code: 'CAMION_PATENTE_DUPLICADA' },
      });
    });

    describe('camion en ruta', () => {
      it('no deja cambiarle el estado a mano', async () => {
        // Quedaria una ruta viva apuntando a un camion que ya no circula.
        repo.buscarPorId.mockResolvedValue(camionDe({ estado: EstadoCamion.EN_RUTA }));

        await expect(
          service.actualizar('cm-1', { estado: EstadoCamion.MANTENIMIENTO }),
        ).rejects.toMatchObject({ response: { code: 'CAMION_EN_RUTA' } });
      });

      it('el mensaje nombra la patente, que es lo que el operador tiene a la vista', async () => {
        repo.buscarPorId.mockResolvedValue(camionDe({ estado: EstadoCamion.EN_RUTA }));

        await expect(
          service.actualizar('cm-1', { estado: EstadoCamion.DISPONIBLE }),
        ).rejects.toMatchObject({
          response: { message: expect.stringContaining('AB123CD') },
        });
      });

      it('si deja editar los datos que no son el estado', async () => {
        repo.buscarPorId.mockResolvedValue(camionDe({ estado: EstadoCamion.EN_RUTA }));

        await expect(service.actualizar('cm-1', { capacidadLitros: 15000 })).resolves.toMatchObject(
          { capacidadLitros: 15000 },
        );
      });

      it('conserva el estado en la respuesta al editar otro campo', async () => {
        // El DTO llega con `estado: undefined` porque la propiedad esta
        // declarada en el cuerpo de la clase. Con Object.assign eso pisaba el
        // valor real: la base quedaba bien pero el PATCH devolvia el camion sin
        // estado, y el cliente que usara esa respuesta perdia el dato.
        repo.buscarPorId.mockResolvedValue(camionDe({ estado: EstadoCamion.EN_RUTA }));

        const camion = await service.actualizar('cm-1', {
          capacidadLitros: 15000,
          estado: undefined,
        });

        expect(camion.estado).toBe(EstadoCamion.EN_RUTA);
      });
    });
  });
});
