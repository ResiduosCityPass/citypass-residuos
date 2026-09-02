import { TipoResiduo } from '../../shared/domain/enums';
import { PublicoService } from './application/publico.service';
import { PublicoController } from './publico.controller';

describe('PublicoController (CU-11)', () => {
  let service: jest.Mocked<PublicoService>;
  let controller: PublicoController;

  beforeEach(() => {
    service = {
      buscarCercanos: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PublicoService>;
    controller = new PublicoController(service);
  });

  it('delega en el caso de uso con los filtros recibidos', async () => {
    const filtro = {
      lat: -34.6037,
      lng: -58.3816,
      radioMetros: 500,
      tipoResiduo: TipoResiduo.RECICLABLE,
    };

    await controller.buscarCercanos(filtro);

    expect(service.buscarCercanos).toHaveBeenCalledWith(filtro);
  });
});
