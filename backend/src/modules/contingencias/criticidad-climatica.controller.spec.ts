import { Request } from 'express';
import { CriticidadClimaticaController } from './criticidad-climatica.controller';
import { CriticidadClimaticaService } from './application/criticidad-climatica.service';
import { CRITICIDAD_CONFIRMADA } from './application/dto/criticidad-climatica.dto';
import { ROLES_KEY } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';
import { EdaClimaConsumer } from './infrastructure/eda-clima.consumer';

describe('CriticidadClimaticaController', () => {
  it('exige un rol operativo y toma el actor de la sesion autenticada', async () => {
    const service = { listar: jest.fn(), simular: jest.fn(), resolver: jest.fn() };
    const controller = new CriticidadClimaticaController(
      service as unknown as CriticidadClimaticaService,
      { estado: () => ({ estado: 'DESHABILITADO' }) } as EdaClimaConsumer,
    );
    expect(Reflect.getMetadata(ROLES_KEY, CriticidadClimaticaController)).toEqual([
      Rol.ADMINISTRADOR,
      Rol.OPERADOR,
    ]);
    await controller.listar();
    const event = { tipo: CRITICIDAD_CONFIRMADA, payload: { alertaId: 'externa' } };
    await controller.simular(event);
    const decision = { accion: 'SIN_AFECTACION' as const, motivo: 'No afecta la recoleccion' };
    await controller.resolver('externa', decision, {
      usuario: { sub: 'identidad-verificada' },
    } as Request);
    expect(service.listar).toHaveBeenCalled();
    expect(service.simular).toHaveBeenCalledWith(event);
    expect(service.resolver).toHaveBeenCalledWith('externa', decision, 'identidad-verificada');
  });
});
