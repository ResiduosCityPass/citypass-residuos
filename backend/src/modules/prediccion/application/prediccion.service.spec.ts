import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { Lectura } from '../../lecturas/domain/lectura.entity';
import { LecturaRepository } from '../../lecturas/domain/lectura.repository';
import { ZonasService } from '../../zonas/application/zonas.service';
import { Zona } from '../../zonas/domain/zona.entity';
import { PrediccionService } from './prediccion.service';

const ZONA = { id: 'z-1', nombre: 'Centro', umbralCriticoPct: 70 } as Zona;
const INICIO = new Date('2026-09-02T00:00:00.000Z');

const contenedorDe = (nivelLlenadoPct: number): Contenedor =>
  ({ id: 'c-1', codigo: 'CT-0421', zonaId: 'z-1', nivelLlenadoPct }) as Contenedor;

/**
 * Devuelve las lecturas como las entrega el repositorio: de la mas nueva a la
 * mas vieja. Los niveles se pasan en orden cronologico, que es como se leen.
 */
const lecturasDesc = (niveles: number[], horasEntre = 1): Lectura[] =>
  niveles
    .map(
      (nivelLlenadoPct, i) =>
        ({
          nivelLlenadoPct,
          registradaEn: new Date(INICIO.getTime() + i * horasEntre * 3_600_000),
        }) as Lectura,
    )
    .reverse();

describe('PrediccionService (CU-12)', () => {
  let contenedores: jest.Mocked<ContenedorRepository>;
  let lecturas: jest.Mocked<LecturaRepository>;
  let zonas: jest.Mocked<Pick<ZonasService, 'obtener'>>;
  let service: PrediccionService;

  beforeEach(() => {
    contenedores = {
      crear: jest.fn(),
      guardar: jest.fn(),
      buscarPorId: jest.fn().mockResolvedValue(contenedorDe(40)),
      buscarPorCodigo: jest.fn(),
      listar: jest.fn(),
      contar: jest.fn(),
    };
    lecturas = {
      crear: jest.fn(),
      ultimaDe: jest.fn(),
      ultimasDe: jest.fn().mockResolvedValue(lecturasDesc([10, 20, 30, 40])),
    };
    zonas = { obtener: jest.fn().mockResolvedValue(ZONA) };

    service = new PrediccionService(
      contenedores,
      lecturas,
      zonas as unknown as ZonasService,
      new ConfigService({}),
    );
  });

  describe('camino feliz', () => {
    it('estima la tasa de llenado a partir del historico', async () => {
      const prediccion = await service.predecir('c-1');

      // 10 puntos por hora sostenidos.
      expect(prediccion.tasaLlenadoPctPorHora).toBeCloseTo(10, 2);
    });

    it('calcula cuantas horas faltan para el umbral de la zona', async () => {
      const prediccion = await service.predecir('c-1');

      // Del 40% al 70% a 10 puntos por hora: 3 horas.
      expect(prediccion.horasHastaUmbral).toBeCloseTo(3, 2);
    });

    it('proyecta la fecha de saturacion coherente con las horas estimadas', async () => {
      const antes = Date.now();

      const prediccion = await service.predecir('c-1');

      const estimada = new Date(prediccion.saturacionEstimadaEn).getTime();
      expect(estimada - antes).toBeGreaterThanOrEqual(3 * 3_600_000 - 1000);
      expect(estimada - antes).toBeLessThanOrEqual(3 * 3_600_000 + 5000);
    });

    it('devuelve confianza alta ante una serie limpia', async () => {
      const prediccion = await service.predecir('c-1');

      expect(prediccion.confianza).toBeCloseTo(1, 2);
    });

    it('devuelve el contrato completo que consume la tarjeta del frontend', async () => {
      const prediccion = await service.predecir('c-1');

      expect(prediccion).toEqual({
        contenedorId: 'c-1',
        codigo: 'CT-0421',
        nivelActualPct: 40,
        umbralCriticoPct: 70,
        tasaLlenadoPctPorHora: expect.any(Number),
        horasHastaUmbral: expect.any(Number),
        saturacionEstimadaEn: expect.any(String),
        confianza: expect.any(Number),
        muestrasUsadas: 4,
      });
    });

    it('reporta baja confianza ante un llenado erratico, en vez de ocultarlo', async () => {
      // Ruidosa pero sin caidas de 20 puntos: es un solo ciclo de llenado, no
      // una serie con vaciados en el medio.
      lecturas.ultimasDe.mockResolvedValue(lecturasDesc([10, 28, 14, 33, 20, 38, 24]));
      contenedores.buscarPorId.mockResolvedValue(contenedorDe(24));

      const prediccion = await service.predecir('c-1');

      expect(prediccion.muestrasUsadas).toBe(7);
      expect(prediccion.tasaLlenadoPctPorHora).toBeGreaterThan(0);
      // Es el numero sobre el que la tarjeta muestra "no planifiques con esto".
      expect(prediccion.confianza).toBeLessThan(0.5);
    });
  });

  describe('orden y ventana de las lecturas', () => {
    it('ordena cronologicamente lo que el repositorio devuelve al reves', async () => {
      // Si no se invirtiera, la pendiente saldria negativa y el caso de uso
      // rechazaria un contenedor que en realidad se esta llenando.
      const prediccion = await service.predecir('c-1');

      expect(prediccion.tasaLlenadoPctPorHora).toBeGreaterThan(0);
    });

    it('descarta lo anterior al ultimo vaciado', async () => {
      lecturas.ultimasDe.mockResolvedValue(lecturasDesc([65, 80, 5, 15, 25, 35]));
      contenedores.buscarPorId.mockResolvedValue(contenedorDe(35));

      const prediccion = await service.predecir('c-1');

      // Solo las cuatro lecturas posteriores al vaciado.
      expect(prediccion.muestrasUsadas).toBe(4);
      expect(prediccion.tasaLlenadoPctPorHora).toBeGreaterThan(0);
    });

    it('pide una ventana acotada de lecturas, no la tabla entera', async () => {
      await service.predecir('c-1');

      expect(lecturas.ultimasDe).toHaveBeenCalledWith('c-1', 200);
    });

    it('respeta el tamanio de ventana configurado', async () => {
      const conConfig = new PrediccionService(
        contenedores,
        lecturas,
        zonas as unknown as ZonasService,
        new ConfigService({ PREDICCION_MAX_LECTURAS: 50 }),
      );

      await conConfig.predecir('c-1');

      expect(lecturas.ultimasDe).toHaveBeenCalledWith('c-1', 50);
    });
  });

  describe('umbral ya superado', () => {
    it('devuelve 0 horas en vez de un numero negativo', async () => {
      contenedores.buscarPorId.mockResolvedValue(contenedorDe(94));
      lecturas.ultimasDe.mockResolvedValue(lecturasDesc([70, 78, 86, 94]));

      const prediccion = await service.predecir('c-1');

      // La tarjeta del frontend usa `horasHastaUmbral <= 0` para mostrar
      // "Umbral superado": mandar un negativo funcionaria por accidente, un 0
      // lo dice explicitamente.
      expect(prediccion.horasHastaUmbral).toBe(0);
    });

    it('no depende de la tendencia: si ya lo cruzo, ya lo cruzo', async () => {
      contenedores.buscarPorId.mockResolvedValue(contenedorDe(94));
      lecturas.ultimasDe.mockResolvedValue(lecturasDesc([99, 97, 96, 94]));

      await expect(service.predecir('c-1')).resolves.toMatchObject({ horasHastaUmbral: 0 });
    });
  });

  describe('casos en que no se puede predecir', () => {
    it('falla con 404 si el contenedor no existe', async () => {
      contenedores.buscarPorId.mockResolvedValue(null);

      await expect(service.predecir('c-fantasma')).rejects.toThrow(NotFoundException);
    });

    it('falla con SIN_LECTURAS_SUFICIENTES si el contenedor nunca reporto', async () => {
      lecturas.ultimasDe.mockResolvedValue([]);

      await expect(service.predecir('c-1')).rejects.toMatchObject({
        response: { code: 'SIN_LECTURAS_SUFICIENTES' },
      });
    });

    it('falla con SIN_LECTURAS_SUFICIENTES con menos de tres lecturas', async () => {
      lecturas.ultimasDe.mockResolvedValue(lecturasDesc([10, 20]));

      await expect(service.predecir('c-1')).rejects.toThrow(ConflictException);
    });

    it('falla con TENDENCIA_NO_CRECIENTE si el contenedor no se esta llenando', async () => {
      contenedores.buscarPorId.mockResolvedValue(contenedorDe(30));
      lecturas.ultimasDe.mockResolvedValue(lecturasDesc([48, 42, 36, 30]));

      // Prometer una fecha de saturacion para algo que se vacia seria inventar
      // un futuro. Se devuelve un 409 con su codigo propio.
      await expect(service.predecir('c-1')).rejects.toMatchObject({
        response: { code: 'TENDENCIA_NO_CRECIENTE' },
      });
    });

    it('el mensaje de error nombra el contenedor, para que el operador sepa cual es', async () => {
      lecturas.ultimasDe.mockResolvedValue([]);

      await expect(service.predecir('c-1')).rejects.toMatchObject({
        response: { message: expect.stringContaining('CT-0421') },
      });
    });
  });
});
