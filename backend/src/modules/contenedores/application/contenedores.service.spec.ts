import { ConflictException, NotFoundException } from '@nestjs/common';
import { TipoResiduo } from '../../../shared/domain/enums';
import { ZonasService } from '../../zonas/application/zonas.service';
import { Zona } from '../../zonas/domain/zona.entity';
import { hashearApiKey } from '../domain/api-key';
import { Contenedor } from '../domain/contenedor.entity';
import { ContenedorRepository } from '../domain/contenedor.repository';
import { Sensor } from '../domain/sensor.entity';
import { SensorRepository } from '../domain/sensor.repository';
import { ContenedoresService } from './contenedores.service';

const alta = {
  zonaId: 'z-1',
  tipoResiduo: TipoResiduo.RECICLABLE,
  capacidadLitros: 1100,
  lat: -34.61,
  lng: -58.39,
};

describe('ContenedoresService (CU-01)', () => {
  let contenedores: jest.Mocked<ContenedorRepository>;
  let sensores: jest.Mocked<SensorRepository>;
  let zonas: jest.Mocked<Pick<ZonasService, 'obtener'>>;
  let service: ContenedoresService;

  beforeEach(() => {
    contenedores = {
      crear: jest.fn().mockImplementation(async (c) => ({ id: 'c-1', ...c }) as Contenedor),
      guardar: jest.fn().mockImplementation(async (c) => c),
      buscarPorId: jest.fn(),
      buscarPorCodigo: jest.fn().mockResolvedValue(null),
      listar: jest.fn().mockResolvedValue([]),
      listarConZona: jest.fn().mockResolvedValue([]),
      contar: jest.fn().mockResolvedValue(0),
    };
    sensores = {
      crear: jest.fn().mockImplementation(async (s) => ({ id: 's-1', ...s }) as Sensor),
      guardar: jest.fn(),
      buscarPorContenedor: jest.fn().mockResolvedValue(null),
      buscarPorCodigo: jest.fn().mockResolvedValue(null),
      buscarPorApiKeyHash: jest.fn(),
      contar: jest.fn().mockResolvedValue(0),
    };
    zonas = { obtener: jest.fn().mockResolvedValue({ id: 'z-1' } as Zona) };

    service = new ContenedoresService(contenedores, sensores, zonas as unknown as ZonasService);
  });

  describe('crear', () => {
    it('valida que la zona exista antes de crear', async () => {
      await service.crear(alta);

      expect(zonas.obtener).toHaveBeenCalledWith('z-1');
    });

    it('propaga el 404 si la zona no existe', async () => {
      zonas.obtener.mockRejectedValue(new NotFoundException());

      await expect(service.crear(alta)).rejects.toThrow(NotFoundException);
      expect(contenedores.crear).not.toHaveBeenCalled();
    });

    it('genera un codigo correlativo cuando no se envia uno', async () => {
      contenedores.contar.mockResolvedValue(420);

      await service.crear(alta);

      expect(contenedores.crear).toHaveBeenCalledWith(
        expect.objectContaining({ codigo: 'CT-0421' }),
      );
    });

    it('respeta el codigo enviado por el administrador', async () => {
      await service.crear({ ...alta, codigo: 'CT-CENTRO-01' });

      expect(contenedores.crear).toHaveBeenCalledWith(
        expect.objectContaining({ codigo: 'CT-CENTRO-01' }),
      );
    });

    it('rechaza un codigo duplicado', async () => {
      contenedores.buscarPorCodigo.mockResolvedValue({ id: 'otro' } as Contenedor);

      await expect(service.crear({ ...alta, codigo: 'CT-0001' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('actualizar', () => {
    it('aplica los cambios sobre el contenedor existente', async () => {
      const contenedor = { id: 'c-1', zonaId: 'z-1', capacidadLitros: 1100 } as Contenedor;
      contenedores.buscarPorId.mockResolvedValue(contenedor);

      const resultado = await service.actualizar('c-1', { capacidadLitros: 2400 });

      expect(resultado.capacidadLitros).toBe(2400);
      expect(contenedores.guardar).toHaveBeenCalledWith(contenedor);
    });

    it('falla con 404 si el contenedor no existe', async () => {
      contenedores.buscarPorId.mockResolvedValue(null);

      await expect(service.actualizar('c-fantasma', { capacidadLitros: 2400 })).rejects.toThrow(
        NotFoundException,
      );
      expect(contenedores.guardar).not.toHaveBeenCalled();
    });

    it('valida que la zona nueva exista al mover el contenedor de zona', async () => {
      contenedores.buscarPorId.mockResolvedValue({ id: 'c-1', zonaId: 'z-1' } as Contenedor);

      await service.actualizar('c-1', { zonaId: 'z-2' });

      expect(zonas.obtener).toHaveBeenCalledWith('z-2');
    });

    it('propaga el 404 si la zona nueva no existe, sin guardar nada', async () => {
      contenedores.buscarPorId.mockResolvedValue({ id: 'c-1', zonaId: 'z-1' } as Contenedor);
      zonas.obtener.mockRejectedValue(new NotFoundException());

      await expect(service.actualizar('c-1', { zonaId: 'z-inexistente' })).rejects.toThrow(
        NotFoundException,
      );
      expect(contenedores.guardar).not.toHaveBeenCalled();
    });

    it('no revalida la zona si el zonaId enviado es el que ya tenia', async () => {
      contenedores.buscarPorId.mockResolvedValue({ id: 'c-1', zonaId: 'z-1' } as Contenedor);

      await service.actualizar('c-1', { zonaId: 'z-1' });

      expect(zonas.obtener).not.toHaveBeenCalled();
    });

    it('mover de zona cambia los umbrales que se le aplican en la proxima lectura', async () => {
      const contenedor = { id: 'c-1', zonaId: 'z-1' } as Contenedor;
      contenedores.buscarPorId.mockResolvedValue(contenedor);

      await service.actualizar('c-1', { zonaId: 'z-2' });

      expect(contenedor.zonaId).toBe('z-2');
    });
  });

  describe('darDeBaja', () => {
    it('es baja logica: marca inactivo pero conserva la fila', async () => {
      const contenedor = { id: 'c-1', activo: true } as Contenedor;
      contenedores.buscarPorId.mockResolvedValue(contenedor);

      await service.darDeBaja('c-1');

      expect(contenedor.activo).toBe(false);
      expect(contenedores.guardar).toHaveBeenCalledWith(contenedor);
    });
  });

  describe('vincularSensor', () => {
    beforeEach(() => {
      contenedores.buscarPorId.mockResolvedValue({ id: 'c-1' } as Contenedor);
    });

    it('devuelve la api key en claro una unica vez', async () => {
      const { apiKey } = await service.vincularSensor('c-1', {});

      expect(apiKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('persiste solo el hash, nunca la clave en claro', async () => {
      const { apiKey } = await service.vincularSensor('c-1', {});

      expect(sensores.crear).toHaveBeenCalledWith(
        expect.objectContaining({ apiKeyHash: hashearApiKey(apiKey) }),
      );
      expect(sensores.crear).not.toHaveBeenCalledWith(
        expect.objectContaining({ apiKeyHash: apiKey }),
      );
    });

    it('rechaza vincular un segundo sensor al mismo contenedor', async () => {
      sensores.buscarPorContenedor.mockResolvedValue({ codigo: 'SN-0001' } as Sensor);

      await expect(service.vincularSensor('c-1', {})).rejects.toThrow(ConflictException);
    });

    it('rechaza un codigo de sensor ya usado', async () => {
      sensores.buscarPorCodigo.mockResolvedValue({ id: 'otro' } as Sensor);

      await expect(service.vincularSensor('c-1', { codigo: 'SN-0001' })).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
