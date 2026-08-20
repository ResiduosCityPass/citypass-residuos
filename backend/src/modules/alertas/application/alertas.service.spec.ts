import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventTypes } from '../../../shared/domain/domain-event';
import { EstadoAlerta, Severidad, TipoAlerta } from '../../../shared/domain/enums';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { Zona } from '../../zonas/domain/zona.entity';
import { Alerta } from '../domain/alerta.entity';
import { AlertaRepository } from '../domain/alerta.repository';
import { AlertasService } from './alertas.service';

const ZONA = {
  id: 'z-1',
  nombre: 'Centro',
  umbralCriticoPct: 70,
  umbralTemperaturaC: 60,
} as Zona;

const CONTENEDOR = {
  id: 'c-1',
  codigo: 'CT-0421',
  zonaId: 'z-1',
  tipoResiduo: 'RECICLABLE',
  nivelLlenadoPct: 87.4,
  temperaturaC: 78.2,
  lat: -34.6118,
  lng: -58.396,
} as Contenedor;

describe('AlertasService (CU-05, CU-06)', () => {
  let repo: jest.Mocked<AlertaRepository>;
  let eventos: InMemoryEventPublisher;
  let service: AlertasService;

  beforeEach(() => {
    repo = {
      crear: jest.fn().mockImplementation(async (a) => ({ id: 'a-1', ...a }) as Alerta),
      guardar: jest.fn().mockImplementation(async (a) => a),
      buscarPorId: jest.fn(),
      buscarAbierta: jest.fn().mockResolvedValue(null),
      listar: jest.fn(),
      listarAbiertasPorContenedor: jest.fn().mockResolvedValue([]),
    };
    eventos = new InMemoryEventPublisher();
    jest.spyOn(eventos, 'publish');
    service = new AlertasService(repo, eventos);
  });

  describe('registrarSaturacion', () => {
    it('crea la alerta y publica residuos.contenedor.critico', async () => {
      await service.registrarSaturacion(CONTENEDOR, ZONA, Severidad.ALTA);

      const publicados = eventos.getPublished(EventTypes.CONTENEDOR_CRITICO);

      expect(publicados).toHaveLength(1);
      expect(publicados[0].payload).toMatchObject({
        contenedorId: 'CT-0421',
        nivelLlenado: 87.4,
        umbralConfigurado: 70,
      });
    });

    it('no duplica la alerta si ya hay una abierta del mismo tipo', async () => {
      repo.buscarAbierta.mockResolvedValue({ id: 'a-previa' } as Alerta);

      const resultado = await service.registrarSaturacion(CONTENEDOR, ZONA, Severidad.ALTA);

      expect(resultado).toBeNull();
      expect(repo.crear).not.toHaveBeenCalled();
      expect(eventos.publish).not.toHaveBeenCalled();
    });
  });

  describe('registrarIncendio', () => {
    it('publica residuos.incendio.detectado con severidad CRITICA', async () => {
      await service.registrarIncendio(CONTENEDOR, ZONA);

      const publicados = eventos.getPublished(EventTypes.INCENDIO_DETECTADO);

      expect(publicados).toHaveLength(1);
      expect(publicados[0].payload).toMatchObject({
        contenedorId: 'CT-0421',
        temperaturaCelsius: 78.2,
        severidad: Severidad.CRITICA,
      });
    });

    it('incluye la ubicacion, que es lo que Emergencias necesita para despachar', async () => {
      await service.registrarIncendio(CONTENEDOR, ZONA);

      expect(eventos.getPublished(EventTypes.INCENDIO_DETECTADO)[0].payload).toMatchObject({
        ubicacion: { lat: -34.6118, lng: -58.396 },
      });
    });

    it('no duplica si ya hay un incendio abierto para el contenedor', async () => {
      repo.buscarAbierta.mockResolvedValue({ id: 'a-previa' } as Alerta);

      await expect(service.registrarIncendio(CONTENEDOR, ZONA)).resolves.toBeNull();
    });
  });

  describe('registrarBateriaBaja', () => {
    it('crea la alerta pero no publica evento: es mantenimiento interno', async () => {
      await service.registrarBateriaBaja('c-1', 12);

      expect(repo.crear).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: TipoAlerta.BATERIA_BAJA }),
      );
      expect(eventos.publish).not.toHaveBeenCalled();
    });
  });

  describe('ciclo de vida', () => {
    it('atender pasa la alerta a EN_ATENCION', async () => {
      repo.buscarPorId.mockResolvedValue({ estado: EstadoAlerta.ABIERTA } as Alerta);

      const resultado = await service.atender('a-1');

      expect(resultado.estado).toBe(EstadoAlerta.EN_ATENCION);
    });

    it('no se puede atender una alerta ya resuelta', async () => {
      repo.buscarPorId.mockResolvedValue({ estado: EstadoAlerta.RESUELTA } as Alerta);

      await expect(service.atender('a-1')).rejects.toThrow(ConflictException);
    });

    it('resolver cierra la alerta y sella la fecha', async () => {
      repo.buscarPorId.mockResolvedValue({ estado: EstadoAlerta.EN_ATENCION } as Alerta);

      const resultado = await service.resolver('a-1');

      expect(resultado.estado).toBe(EstadoAlerta.RESUELTA);
      expect(resultado.resueltaEn).toBeInstanceOf(Date);
    });

    it('no se puede resolver dos veces', async () => {
      repo.buscarPorId.mockResolvedValue({ estado: EstadoAlerta.RESUELTA } as Alerta);

      await expect(service.resolver('a-1')).rejects.toThrow(ConflictException);
    });

    it('falla con 404 si la alerta no existe', async () => {
      repo.buscarPorId.mockResolvedValue(null);

      await expect(service.obtener('a-fantasma')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolverAbiertasPorTipo', () => {
    it('cierra todas las alertas abiertas del tipo indicado', async () => {
      repo.listarAbiertasPorContenedor.mockResolvedValue([
        { estado: EstadoAlerta.ABIERTA } as Alerta,
        { estado: EstadoAlerta.ABIERTA } as Alerta,
      ]);

      const cerradas = await service.resolverAbiertasPorTipo('c-1', TipoAlerta.SATURACION);

      expect(cerradas).toBe(2);
      expect(repo.guardar).toHaveBeenCalledTimes(2);
    });
  });
});
