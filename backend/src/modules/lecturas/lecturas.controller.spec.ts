import { Request } from 'express';
import { EstadoContenedor } from '../../shared/domain/enums';
import { LecturasService } from './application/lecturas.service';
import { Sensor } from '../contenedores/domain/sensor.entity';
import { LecturasController } from './lecturas.controller';

describe('LecturasController (CU-04)', () => {
  let service: jest.Mocked<LecturasService>;
  let controller: LecturasController;

  const sensor = { id: 's-1', codigo: 'SN-0001', contenedorId: 'c-1' } as Sensor;

  beforeEach(() => {
    service = {
      registrar: jest.fn().mockResolvedValue({
        lecturaId: 'l-1',
        contenedorId: 'c-1',
        estadoAnterior: EstadoContenedor.NORMAL,
        estadoNuevo: EstadoContenedor.CRITICO,
        alertasGeneradas: [],
      }),
    } as unknown as jest.Mocked<LecturasService>;
    controller = new LecturasController(service);
  });

  it('toma la identidad del sensor que adjunto el guard, no del body', async () => {
    const request = { sensor } as Request;

    await controller.registrar(request, {
      nivelLlenadoPct: 87.4,
      temperaturaC: 22.1,
      bateriaPct: 64,
    });

    expect(service.registrar).toHaveBeenCalledWith(
      sensor,
      expect.objectContaining({ nivelLlenadoPct: 87.4 }),
    );
  });

  it('devuelve la transicion de estado, que es lo que consume el simulador', async () => {
    const resultado = await controller.registrar({ sensor } as Request, {
      nivelLlenadoPct: 87.4,
      temperaturaC: 22.1,
      bateriaPct: 64,
    });

    expect(resultado.estadoAnterior).toBe(EstadoContenedor.NORMAL);
    expect(resultado.estadoNuevo).toBe(EstadoContenedor.CRITICO);
  });
});
