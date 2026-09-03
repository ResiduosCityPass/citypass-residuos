import { EstadoContenedor } from '../../shared/domain/enums';
import { MapaService } from './application/mapa.service';
import { MapaController } from './mapa.controller';

describe('MapaController (CU-07)', () => {
  let service: jest.Mocked<MapaService>;
  let controller: MapaController;

  beforeEach(() => {
    service = {
      marcadores: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MapaService>;
    controller = new MapaController(service);
  });

  it('delega en el caso de uso con los filtros recibidos', async () => {
    await controller.contenedoresParaMapa({ zonaId: 'z-1', estado: EstadoContenedor.CRITICO });

    expect(service.marcadores).toHaveBeenCalledWith({
      zonaId: 'z-1',
      estado: EstadoContenedor.CRITICO,
    });
  });
});
