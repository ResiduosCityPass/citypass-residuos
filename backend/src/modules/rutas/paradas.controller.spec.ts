import { Request } from 'express';
import { Rol } from '../../shared/domain/enums';
import { ParadasService } from './application/paradas.service';
import { ParadasController } from './paradas.controller';

describe('ParadasController (CU-10)', () => {
  let service: jest.Mocked<ParadasService>;
  let controller: ParadasController;

  const request = { usuario: { sub: 'user:jperez', rol: Rol.CHOFER } } as Request;

  beforeEach(() => {
    service = { confirmar: jest.fn() } as unknown as jest.Mocked<ParadasService>;
    controller = new ParadasController(service);
  });

  it('confirma con la identidad del token y la posicion del cuerpo', async () => {
    await controller.confirmar('pd-1', request, { lat: -34.6, lng: -58.38 });

    expect(service.confirmar).toHaveBeenCalledWith('pd-1', 'user:jperez', {
      lat: -34.6,
      lng: -58.38,
    });
  });

  it('no acepta un choferId del cuerpo: la identidad sale del token', async () => {
    const conChoferAjeno = { lat: -34.6, lng: -58.38, choferId: 'user:otro' } as never;

    await controller.confirmar('pd-1', request, conChoferAjeno);

    expect(service.confirmar).toHaveBeenCalledWith('pd-1', 'user:jperez', expect.anything());
  });
});
