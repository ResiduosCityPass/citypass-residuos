import { EstadoCamion, TipoResiduo } from '../../shared/domain/enums';
import { FlotaService } from './application/flota.service';
import { FlotaController } from './flota.controller';

describe('FlotaController (CU-03)', () => {
  let service: jest.Mocked<FlotaService>;
  let controller: FlotaController;

  beforeEach(() => {
    service = {
      crear: jest.fn(),
      listar: jest.fn(),
      obtener: jest.fn(),
      actualizar: jest.fn(),
    } as unknown as jest.Mocked<FlotaService>;
    controller = new FlotaController(service);
  });

  const alta = {
    patente: 'AB123CD',
    capacidadLitros: 12000,
    tipoResiduoHabilitado: TipoResiduo.COMUN,
  };

  it('delega el alta', async () => {
    await controller.crear(alta);
    expect(service.crear).toHaveBeenCalledWith(alta);
  });

  it('delega el listado con filtros', async () => {
    await controller.listar({ estado: EstadoCamion.DISPONIBLE });
    expect(service.listar).toHaveBeenCalledWith({ estado: EstadoCamion.DISPONIBLE });
  });

  it('delega la edicion', async () => {
    await controller.actualizar('cm-1', { capacidadLitros: 20000 });
    expect(service.actualizar).toHaveBeenCalledWith('cm-1', { capacidadLitros: 20000 });
  });

  it('no expone baja: un camion borrado colgaria de sus rutas historicas', () => {
    expect(controller).not.toHaveProperty('eliminar');
    expect(controller).not.toHaveProperty('darDeBaja');
  });
});
