import { Request } from 'express';
import { SimulacionLecturasController } from './simulacion-lecturas.controller';
import { LecturasService } from './application/lecturas.service';

describe('SimulacionLecturasController', () => {
  it('usa el contenedor de la URL y la identidad humana autenticada', async () => {
    const resultado = { lecturaId: 'l-1' };
    const service = { simular: jest.fn().mockResolvedValue(resultado) };
    const controller = new SimulacionLecturasController(service as unknown as LecturasService);
    expect(
      await controller.simular('c-1', { nivelLlenadoPct: 90, confirmar: true }, {
        usuario: { sub: 'admin-1' },
      } as Request),
    ).toBe(resultado);
    expect(service.simular).toHaveBeenCalledWith('c-1', 90, 'admin-1');
  });
});
