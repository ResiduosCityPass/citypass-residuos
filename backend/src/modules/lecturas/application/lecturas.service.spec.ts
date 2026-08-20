import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoContenedor, EstadoSensor, TipoAlerta } from '../../../shared/domain/enums';
import { AlertasService } from '../../alertas/application/alertas.service';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { Sensor } from '../../contenedores/domain/sensor.entity';
import { SensorRepository } from '../../contenedores/domain/sensor.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import { Zona } from '../../zonas/domain/zona.entity';
import { Lectura } from '../domain/lectura.entity';
import { LecturaRepository } from '../domain/lectura.repository';
import { LecturasService } from './lecturas.service';

const ZONA_CENTRO = {
  id: 'z-1',
  nombre: 'Centro',
  umbralCriticoPct: 70,
  umbralTemperaturaC: 60,
  bloqueada: false,
} as Zona;

const contenedorDe = (parcial: Partial<Contenedor> = {}): Contenedor =>
  ({
    id: 'c-1',
    codigo: 'CT-0001',
    zonaId: 'z-1',
    lat: -34.61,
    lng: -58.39,
    estado: EstadoContenedor.NORMAL,
    nivelLlenadoPct: 20,
    temperaturaC: 22,
    ...parcial,
  }) as Contenedor;

const sensorDe = (): Sensor =>
  ({ id: 's-1', codigo: 'SN-0001', contenedorId: 'c-1', estado: EstadoSensor.ACTIVO }) as Sensor;

const lecturaNormal = { nivelLlenadoPct: 30, temperaturaC: 22, bateriaPct: 90 };

describe('LecturasService (CU-04)', () => {
  let lecturas: jest.Mocked<LecturaRepository>;
  let contenedores: jest.Mocked<ContenedorRepository>;
  let sensores: jest.Mocked<SensorRepository>;
  let zonas: jest.Mocked<Pick<ZonasService, 'obtener'>>;
  let alertas: jest.Mocked<
    Pick<AlertasService, 'registrarSaturacion' | 'registrarIncendio' | 'registrarBateriaBaja'>
  >;
  let service: LecturasService;

  const construir = (contenedor: Contenedor) => {
    contenedores.buscarPorId.mockResolvedValue(contenedor);
    contenedores.guardar.mockImplementation(async (c) => c);
    lecturas.crear.mockImplementation(async (l) => ({ id: 'l-1', ...l }) as Lectura);
  };

  beforeEach(() => {
    lecturas = {
      crear: jest.fn(),
      ultimaDe: jest.fn().mockResolvedValue(null),
      ultimasDe: jest.fn(),
    };
    contenedores = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorCodigo: jest.fn(),
      listar: jest.fn(),
      contar: jest.fn(),
    };
    sensores = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorContenedor: jest.fn(),
      buscarPorCodigo: jest.fn(),
      buscarPorApiKeyHash: jest.fn(),
      contar: jest.fn(),
    };
    zonas = { obtener: jest.fn().mockResolvedValue(ZONA_CENTRO) };
    alertas = {
      registrarSaturacion: jest.fn().mockResolvedValue({ id: 'a-1' }),
      registrarIncendio: jest.fn().mockResolvedValue({ id: 'a-2' }),
      registrarBateriaBaja: jest.fn().mockResolvedValue({ id: 'a-3' }),
    };

    service = new LecturasService(
      lecturas,
      contenedores,
      sensores,
      zonas as unknown as ZonasService,
      alertas as unknown as AlertasService,
      new ConfigService({}),
    );
  });

  describe('persistencia y estado', () => {
    it('persiste la lectura contra el contenedor del sensor autenticado', async () => {
      construir(contenedorDe());

      await service.registrar(sensorDe(), lecturaNormal);

      expect(lecturas.crear).toHaveBeenCalledWith(
        expect.objectContaining({ contenedorId: 'c-1', nivelLlenadoPct: 30 }),
      );
    });

    it('desnormaliza la ultima lectura sobre el contenedor', async () => {
      const contenedor = contenedorDe();
      construir(contenedor);

      await service.registrar(sensorDe(), { ...lecturaNormal, nivelLlenadoPct: 45 });

      expect(contenedor.nivelLlenadoPct).toBe(45);
      expect(contenedor.ultimaLecturaEn).toBeInstanceOf(Date);
    });

    it('falla si el sensor apunta a un contenedor inexistente', async () => {
      contenedores.buscarPorId.mockResolvedValue(null);

      await expect(service.registrar(sensorDe(), lecturaNormal)).rejects.toThrow(NotFoundException);
    });
  });

  describe('orden cronologico', () => {
    it('rechaza una lectura anterior a la ultima registrada', async () => {
      construir(contenedorDe());
      lecturas.ultimaDe.mockResolvedValue({
        registradaEn: new Date('2026-09-15T14:00:00Z'),
      } as Lectura);

      await expect(
        service.registrar(sensorDe(), {
          ...lecturaNormal,
          registradaEn: new Date('2026-09-15T13:00:00Z'),
        }),
      ).rejects.toThrow(ConflictException);
      expect(lecturas.crear).not.toHaveBeenCalled();
    });

    it('acepta una lectura posterior', async () => {
      construir(contenedorDe());
      lecturas.ultimaDe.mockResolvedValue({
        registradaEn: new Date('2026-09-15T14:00:00Z'),
      } as Lectura);

      await expect(
        service.registrar(sensorDe(), {
          ...lecturaNormal,
          registradaEn: new Date('2026-09-15T14:15:00Z'),
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('CU-05 · deteccion de contenedor critico', () => {
    it('genera la alerta al cruzar el umbral de la zona', async () => {
      construir(contenedorDe({ estado: EstadoContenedor.NORMAL }));

      const resultado = await service.registrar(sensorDe(), {
        ...lecturaNormal,
        nivelLlenadoPct: 87,
      });

      expect(resultado.estadoNuevo).toBe(EstadoContenedor.CRITICO);
      expect(resultado.alertasGeneradas).toContain(TipoAlerta.SATURACION);
      expect(alertas.registrarSaturacion).toHaveBeenCalledTimes(1);
    });

    it('NO vuelve a alertar si el contenedor ya estaba critico', async () => {
      construir(contenedorDe({ estado: EstadoContenedor.CRITICO, nivelLlenadoPct: 88 }));

      const resultado = await service.registrar(sensorDe(), {
        ...lecturaNormal,
        nivelLlenadoPct: 92,
      });

      expect(resultado.estadoNuevo).toBe(EstadoContenedor.CRITICO);
      expect(alertas.registrarSaturacion).not.toHaveBeenCalled();
      expect(resultado.alertasGeneradas).not.toContain(TipoAlerta.SATURACION);
    });

    it('no alerta mientras el nivel se mantiene por debajo del umbral', async () => {
      construir(contenedorDe());

      const resultado = await service.registrar(sensorDe(), lecturaNormal);

      expect(resultado.estadoNuevo).toBe(EstadoContenedor.NORMAL);
      expect(alertas.registrarSaturacion).not.toHaveBeenCalled();
    });

    it('informa el estado anterior y el nuevo, para poder trazar la transicion', async () => {
      construir(contenedorDe({ estado: EstadoContenedor.ADVERTENCIA }));

      const resultado = await service.registrar(sensorDe(), {
        ...lecturaNormal,
        nivelLlenadoPct: 75,
      });

      expect(resultado.estadoAnterior).toBe(EstadoContenedor.ADVERTENCIA);
      expect(resultado.estadoNuevo).toBe(EstadoContenedor.CRITICO);
    });
  });

  describe('CU-06 · riesgo de incendio', () => {
    it('genera la alerta cuando la temperatura supera el umbral', async () => {
      construir(contenedorDe());

      const resultado = await service.registrar(sensorDe(), {
        ...lecturaNormal,
        temperaturaC: 78,
      });

      expect(resultado.alertasGeneradas).toContain(TipoAlerta.INCENDIO);
      expect(alertas.registrarIncendio).toHaveBeenCalledTimes(1);
    });

    it('dispara aunque el contenedor este casi vacio: no depende del llenado', async () => {
      construir(contenedorDe());

      const resultado = await service.registrar(sensorDe(), {
        nivelLlenadoPct: 5,
        temperaturaC: 90,
        bateriaPct: 90,
      });

      expect(resultado.estadoNuevo).toBe(EstadoContenedor.NORMAL);
      expect(resultado.alertasGeneradas).toContain(TipoAlerta.INCENDIO);
    });

    it('no dispara con temperatura ambiente', async () => {
      construir(contenedorDe());

      await service.registrar(sensorDe(), { ...lecturaNormal, temperaturaC: 35 });

      expect(alertas.registrarIncendio).not.toHaveBeenCalled();
    });
  });

  describe('estado del sensor', () => {
    it('actualiza bateria y ultimo reporte', async () => {
      construir(contenedorDe());
      const sensor = sensorDe();

      await service.registrar(sensor, { ...lecturaNormal, bateriaPct: 55 });

      expect(sensor.bateriaPct).toBe(55);
      expect(sensor.ultimoReporteEn).toBeInstanceOf(Date);
      expect(sensores.guardar).toHaveBeenCalledWith(sensor);
    });

    it('marca el sensor con bateria baja y genera su alerta', async () => {
      construir(contenedorDe());
      const sensor = sensorDe();

      const resultado = await service.registrar(sensor, { ...lecturaNormal, bateriaPct: 12 });

      expect(sensor.estado).toBe(EstadoSensor.BATERIA_BAJA);
      expect(resultado.alertasGeneradas).toContain(TipoAlerta.BATERIA_BAJA);
    });
  });
});
