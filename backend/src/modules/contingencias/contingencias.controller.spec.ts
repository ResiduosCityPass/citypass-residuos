import { Request } from 'express';
import { ContingenciasService } from './application/contingencias.service';
import { ContingenciasController } from './contingencias.controller';
import { ROLES_KEY } from '../../shared/auth/roles.decorator';
import { Rol } from '../../shared/domain/enums';

describe('ContingenciasController', () => {
  const service = {
    listar: jest.fn(),
    obtener: jest.fn(),
    simularInicio: jest.fn(),
    simularFinalizacion: jest.fn(),
    habilitarRecuperacion: jest.fn(),
  };
  const controller = new ContingenciasController(service as unknown as ContingenciasService);

  beforeEach(() => jest.clearAllMocks());

  it('protege todas las operaciones con roles de operador o administrador', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ContingenciasController)).toEqual([
      Rol.ADMINISTRADOR,
      Rol.OPERADOR,
    ]);
  });
  it('consulta el historial y el detalle', async () => {
    await controller.listar();
    await controller.obtener('f1');
    expect(service.listar).toHaveBeenCalled();
    expect(service.obtener).toHaveBeenCalledWith('f1');
  });
  it('separa los eventos simulados de la habilitacion operativa', async () => {
    const dto = { descripcion: 'Inundacion', zonaIds: ['z1'] };
    await controller.iniciar(dto);
    await controller.finalizar('f1');
    expect(service.simularInicio).toHaveBeenCalledWith(dto);
    expect(service.simularFinalizacion).toHaveBeenCalledWith('f1');
    expect(service.habilitarRecuperacion).not.toHaveBeenCalled();
    await controller.recuperar('f1', { usuario: { sub: 'op-1' } } as Request);
    expect(service.habilitarRecuperacion).toHaveBeenCalledWith('f1', 'op-1');
  });
});
