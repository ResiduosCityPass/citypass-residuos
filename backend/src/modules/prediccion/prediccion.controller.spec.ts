import { PrediccionService } from './application/prediccion.service';
import { PrediccionController } from './prediccion.controller';

describe('PrediccionController (CU-12)', () => {
  let service: jest.Mocked<PrediccionService>;
  let controller: PrediccionController;

  beforeEach(() => {
    service = { predecir: jest.fn() } as unknown as jest.Mocked<PrediccionService>;
    controller = new PrediccionController(service);
  });

  it('delega en el caso de uso', async () => {
    await controller.predecir('c-1');

    expect(service.predecir).toHaveBeenCalledWith('c-1');
  });
});
