import { IntervencionesService } from './application/intervenciones.service';
import { IntervencionesController } from './intervenciones.controller';

describe('IntervencionesController', () => {
  let service: jest.Mocked<IntervencionesService>;
  let controller: IntervencionesController;

  beforeEach(() => {
    service = {
      listar: jest.fn(),
      obtener: jest.fn(),
      completar: jest.fn(),
    } as unknown as jest.Mocked<IntervencionesService>;
    controller = new IntervencionesController(service);
  });

  it('delega el listado', async () => {
    await controller.listar();
    expect(service.listar).toHaveBeenCalled();
  });

  it('delega el detalle', async () => {
    await controller.obtener('in-1');
    expect(service.obtener).toHaveBeenCalledWith('in-1');
  });

  it('delega el cierre', async () => {
    await controller.completar('in-1');
    expect(service.completar).toHaveBeenCalledWith('in-1');
  });
});
