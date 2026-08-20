import { EstadoAlerta, TipoAlerta } from '../../shared/domain/enums';
import { AlertasService } from './application/alertas.service';
import { AlertasController } from './alertas.controller';

describe('AlertasController', () => {
  let service: jest.Mocked<AlertasService>;
  let controller: AlertasController;

  beforeEach(() => {
    service = {
      listar: jest.fn(),
      obtener: jest.fn(),
      atender: jest.fn(),
      resolver: jest.fn(),
    } as unknown as jest.Mocked<AlertasService>;
    controller = new AlertasController(service);
  });

  it('delega el listado filtrado', async () => {
    await controller.listar({ tipo: TipoAlerta.INCENDIO, estado: EstadoAlerta.ABIERTA });

    expect(service.listar).toHaveBeenCalledWith({
      tipo: TipoAlerta.INCENDIO,
      estado: EstadoAlerta.ABIERTA,
    });
  });

  it('delega el detalle', async () => {
    await controller.obtener('a-1');
    expect(service.obtener).toHaveBeenCalledWith('a-1');
  });

  it('delega el atender', async () => {
    await controller.atender('a-1');
    expect(service.atender).toHaveBeenCalledWith('a-1');
  });

  it('delega el resolver', async () => {
    await controller.resolver('a-1');
    expect(service.resolver).toHaveBeenCalledWith('a-1');
  });
});
