import { ChoferesService } from './application/choferes.service';
import { ChoferesController } from './choferes.controller';

describe('ChoferesController (CU-09)', () => {
  let service: jest.Mocked<ChoferesService>;
  let controller: ChoferesController;

  beforeEach(() => {
    service = {
      crear: jest.fn(),
      listar: jest.fn(),
      obtener: jest.fn(),
      actualizar: jest.fn(),
      darDeBaja: jest.fn(),
    } as unknown as jest.Mocked<ChoferesService>;
    controller = new ChoferesController(service);
  });

  it('delega el alta', async () => {
    await controller.crear({ nombre: 'Juana Perez', legajo: 'CH-014' });

    expect(service.crear).toHaveBeenCalledWith({ nombre: 'Juana Perez', legajo: 'CH-014' });
  });

  it('delega el listado con el filtro', async () => {
    await controller.listar({ incluirInactivos: true });

    expect(service.listar).toHaveBeenCalledWith({ incluirInactivos: true });
  });

  it('delega el detalle', async () => {
    await controller.obtener('ch-1');

    expect(service.obtener).toHaveBeenCalledWith('ch-1');
  });

  it('delega la edicion', async () => {
    await controller.actualizar('ch-1', { nombre: 'Juana P.' });

    expect(service.actualizar).toHaveBeenCalledWith('ch-1', { nombre: 'Juana P.' });
  });

  it('delega la baja', async () => {
    await controller.darDeBaja('ch-1');

    expect(service.darDeBaja).toHaveBeenCalledWith('ch-1');
  });
});
