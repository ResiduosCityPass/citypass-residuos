import { ZonasService } from './application/zonas.service';
import { ZonasController } from './zonas.controller';

describe('ZonasController', () => {
  let service: jest.Mocked<ZonasService>;
  let controller: ZonasController;

  beforeEach(() => {
    service = {
      crear: jest.fn(),
      listar: jest.fn(),
      obtener: jest.fn(),
      actualizar: jest.fn(),
      cambiarBloqueo: jest.fn(),
      eliminar: jest.fn(),
    } as unknown as jest.Mocked<ZonasService>;
    controller = new ZonasController(service);
  });

  const alta = { nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 };

  it('delega el alta', async () => {
    await controller.crear(alta);
    expect(service.crear).toHaveBeenCalledWith(alta);
  });

  it('delega el listado', async () => {
    await controller.listar();
    expect(service.listar).toHaveBeenCalled();
  });

  it('delega el detalle', async () => {
    await controller.obtener('z-1');
    expect(service.obtener).toHaveBeenCalledWith('z-1');
  });

  it('delega la actualizacion', async () => {
    await controller.actualizar('z-1', { umbralCriticoPct: 85 });
    expect(service.actualizar).toHaveBeenCalledWith('z-1', { umbralCriticoPct: 85 });
  });

  it('delega el bloqueo de zona', async () => {
    await controller.cambiarBloqueo('z-1', true);
    expect(service.cambiarBloqueo).toHaveBeenCalledWith('z-1', true);
  });

  it('delega la baja', async () => {
    await controller.eliminar('z-1');
    expect(service.eliminar).toHaveBeenCalledWith('z-1');
  });
});
