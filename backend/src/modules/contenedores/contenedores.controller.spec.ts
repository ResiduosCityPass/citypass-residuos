import { TipoResiduo } from '../../shared/domain/enums';
import { ContenedoresService } from './application/contenedores.service';
import { Sensor } from './domain/sensor.entity';
import { ContenedoresController } from './contenedores.controller';

describe('ContenedoresController (CU-01)', () => {
  let service: jest.Mocked<ContenedoresService>;
  let controller: ContenedoresController;

  beforeEach(() => {
    service = {
      crear: jest.fn(),
      listar: jest.fn(),
      obtener: jest.fn(),
      actualizar: jest.fn(),
      darDeBaja: jest.fn(),
      cambiarServicio: jest.fn(),
      vincularSensor: jest.fn(),
    } as unknown as jest.Mocked<ContenedoresService>;
    controller = new ContenedoresController(service);
  });

  const alta = {
    zonaId: 'z-1',
    tipoResiduo: TipoResiduo.COMUN,
    capacidadLitros: 1100,
    lat: -34.6,
    lng: -58.4,
  };

  it('delega el alta', async () => {
    await controller.crear(alta);
    expect(service.crear).toHaveBeenCalledWith(alta);
  });

  it('delega el listado con filtros', async () => {
    await controller.listar({ zonaId: 'z-1' });
    expect(service.listar).toHaveBeenCalledWith({ zonaId: 'z-1' });
  });

  it('delega el detalle', async () => {
    await controller.obtener('c-1');
    expect(service.obtener).toHaveBeenCalledWith('c-1');
  });

  it('delega la edicion', async () => {
    await controller.actualizar('c-1', { capacidadLitros: 2400 });
    expect(service.actualizar).toHaveBeenCalledWith('c-1', { capacidadLitros: 2400 });
  });

  it('delega la baja logica', async () => {
    await controller.darDeBaja('c-1');
    expect(service.darDeBaja).toHaveBeenCalledWith('c-1');
  });

  describe('vincularSensor', () => {
    beforeEach(() => {
      service.vincularSensor.mockResolvedValue({
        sensor: { id: 's-1', codigo: 'SN-0001', contenedorId: 'c-1' } as Sensor,
        apiKey: 'clave-en-claro',
      });
    });

    it('devuelve la api key junto con la advertencia de guardarla', async () => {
      const respuesta = await controller.vincularSensor('c-1', {});

      expect(respuesta.apiKey).toBe('clave-en-claro');
      expect(respuesta.advertencia).toContain('Guardala');
    });

    it('no filtra el hash de la credencial en la respuesta', async () => {
      const respuesta = await controller.vincularSensor('c-1', {});

      expect(respuesta).not.toHaveProperty('apiKeyHash');
    });
  });

  it('delega el cambio de servicio con el valor del query param', async () => {
    await controller.cambiarServicio('c-1', true);
    expect(service.cambiarServicio).toHaveBeenCalledWith('c-1', true);
  });

  it('el reintegro viaja como false, no como ausencia del parametro', async () => {
    await controller.cambiarServicio('c-1', false);
    expect(service.cambiarServicio).toHaveBeenCalledWith('c-1', false);
  });
});
