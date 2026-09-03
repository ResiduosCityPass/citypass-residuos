import { Request } from 'express';
import { EstadoRuta, Rol } from '../../shared/domain/enums';
import { RutasService } from './application/rutas.service';
import { RutasController } from './rutas.controller';

describe('RutasController (CU-08, CU-09)', () => {
  let service: jest.Mocked<RutasService>;
  let controller: RutasController;

  const requestDe = (sub: string) =>
    ({ usuario: { sub, username: sub, rol: Rol.CHOFER } }) as Request;

  beforeEach(() => {
    service = {
      generar: jest.fn(),
      listar: jest.fn(),
      obtener: jest.fn(),
      asignar: jest.fn(),
      rutaActivaDe: jest.fn(),
    } as unknown as jest.Mocked<RutasService>;
    controller = new RutasController(service);
  });

  it('delega la generacion', async () => {
    await controller.generar({ camionId: 'cm-1' });

    expect(service.generar).toHaveBeenCalledWith({ camionId: 'cm-1' });
  });

  it('delega el listado con filtros', async () => {
    await controller.listar({ estado: EstadoRuta.PROPUESTA });

    expect(service.listar).toHaveBeenCalledWith({ estado: EstadoRuta.PROPUESTA });
  });

  it('delega el detalle', async () => {
    await controller.obtener('rt-1');

    expect(service.obtener).toHaveBeenCalledWith('rt-1');
  });

  it('delega la asignacion', async () => {
    await controller.asignar('rt-1', { choferId: 'U000042' });

    expect(service.asignar).toHaveBeenCalledWith('rt-1', { choferId: 'U000042' });
  });

  describe('ruta propia del chofer', () => {
    it('toma la identidad del token, no de la query', async () => {
      // Si el id del chofer viajara por query string, cualquiera podria leer la
      // ruta de otro cambiando un valor.
      await controller.rutaPropia(requestDe('U000042'));

      expect(service.rutaActivaDe).toHaveBeenCalledWith('U000042');
    });

    it('cada chofer recibe la suya', async () => {
      await controller.rutaPropia(requestDe('user:otro'));

      expect(service.rutaActivaDe).toHaveBeenCalledWith('user:otro');
    });
  });
});
