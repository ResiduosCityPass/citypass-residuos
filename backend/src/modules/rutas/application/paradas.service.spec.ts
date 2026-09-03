import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../../../shared/domain/domain-event';
import {
  EstadoCamion,
  EstadoContenedor,
  EstadoParada,
  EstadoRuta,
  TipoAlerta,
} from '../../../shared/domain/enums';
import { InMemoryEventPublisher } from '../../../shared/events/in-memory.event-publisher';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { AlertasService } from '../../alertas/application/alertas.service';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { Camion } from '../../flota/domain/camion.entity';
import { FlotaService } from '../../flota/application/flota.service';
import { Parada } from '../domain/parada.entity';
import { ParadaRepository } from '../domain/parada.repository';
import { Ruta } from '../domain/ruta.entity';
import { RutaRepository } from '../domain/ruta.repository';
import { ParadasService } from './paradas.service';

const CHOFER = 'U000042';
const EN_EL_CONTENEDOR = { lat: -34.6037, lng: -58.3816 };
const A_CINCO_KM = { lat: -34.65, lng: -58.3816 };

describe('ParadasService (CU-10)', () => {
  let paradas: jest.Mocked<ParadaRepository>;
  let rutas: jest.Mocked<RutaRepository>;
  let contenedores: jest.Mocked<ContenedorRepository>;
  let eventos: InMemoryEventPublisher;
  let alertas: jest.Mocked<Pick<AlertasService, 'resolverAbiertasPorTipo'>>;
  let flota: jest.Mocked<Pick<FlotaService, 'obtener' | 'guardarEstado'>>;
  let service: ParadasService;

  let parada: Parada;
  let contenedor: Contenedor;
  let ruta: Ruta;

  beforeEach(() => {
    parada = {
      id: 'pd-1',
      rutaId: 'rt-1',
      contenedorId: 'c-1',
      orden: 1,
      estado: EstadoParada.PENDIENTE,
      confirmadaEn: null,
      omitidaEn: null,
      motivo: null,
    } as Parada;

    contenedor = {
      id: 'c-1',
      codigo: 'CT-0421',
      lat: EN_EL_CONTENEDOR.lat,
      lng: EN_EL_CONTENEDOR.lng,
      nivelLlenadoPct: 94,
      estado: EstadoContenedor.CRITICO,
    } as Contenedor;

    ruta = {
      id: 'rt-1',
      camionId: 'cm-1',
      choferId: CHOFER,
      estado: EstadoRuta.ASIGNADA,
      camion: { patente: 'AB123CD' } as Camion,
    } as Ruta;

    paradas = {
      crearVarias: jest.fn(),
      guardar: jest.fn().mockImplementation(async (p) => p),
      buscarPorId: jest.fn().mockResolvedValue(parada),
      listarDeRuta: jest.fn().mockResolvedValue([parada]),
    };
    rutas = {
      crear: jest.fn(),
      guardar: jest.fn().mockImplementation(async (r) => r),
      buscarPorId: jest.fn().mockImplementation(async () => ruta),
      listar: jest.fn(),
      buscarActivaDeChofer: jest.fn(),
      contenedoresEnRutasVivas: jest.fn(),
      avanceDeParadas: jest.fn(),
    };
    contenedores = {
      crear: jest.fn(),
      guardar: jest.fn().mockImplementation(async (c) => c),
      buscarPorId: jest.fn().mockResolvedValue(contenedor),
      buscarPorCodigo: jest.fn(),
      listar: jest.fn(),
      listarConZona: jest.fn(),
      contar: jest.fn(),
    };
    eventos = new InMemoryEventPublisher();
    alertas = { resolverAbiertasPorTipo: jest.fn().mockResolvedValue(1) };
    flota = {
      obtener: jest.fn().mockResolvedValue({ id: 'cm-1', estado: EstadoCamion.EN_RUTA } as Camion),
      guardarEstado: jest.fn().mockImplementation(async (c) => c),
    };

    service = new ParadasService(
      paradas,
      rutas,
      contenedores,
      eventos,
      alertas as unknown as AlertasService,
      flota as unknown as FlotaService,
      { ejecutar: <T>(b: () => Promise<T>) => b() } as unknown as ContextoTransaccional,
      new ConfigService({}),
    );
  });

  describe('cierre del ciclo', () => {
    it('marca la parada como confirmada', async () => {
      const resultado = await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      expect(resultado.estado).toBe(EstadoParada.CONFIRMADA);
      expect(parada.confirmadaEn).toBeInstanceOf(Date);
    });

    it('devuelve el contenedor a NORMAL y a 0%', async () => {
      await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      expect(contenedor.nivelLlenadoPct).toBe(0);
      expect(contenedor.estado).toBe(EstadoContenedor.NORMAL);
    });

    it('cierra las alertas de saturacion abiertas', async () => {
      const resultado = await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      expect(alertas.resolverAbiertasPorTipo).toHaveBeenCalledWith('c-1', TipoAlerta.SATURACION);
      expect(resultado.alertasCerradas).toBe(1);
    });

    it('publica residuos.contenedor.vaciado con el nivel previo', async () => {
      await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      const publicados = eventos.getPublished(EventTypes.CONTENEDOR_VACIADO);
      expect(publicados).toHaveLength(1);
      expect(publicados[0].payload).toMatchObject({
        contenedorId: 'CT-0421',
        nivelPrevio: 94,
        choferId: CHOFER,
      });
    });

    it('no saca de FUERA_DE_SERVICIO a un contenedor por vaciarlo', async () => {
      // Lo que tiene roto es el sensor o la tapa, no el nivel.
      contenedor.estado = EstadoContenedor.FUERA_DE_SERVICIO;

      await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      expect(contenedor.estado).toBe(EstadoContenedor.FUERA_DE_SERVICIO);
      expect(contenedor.nivelLlenadoPct).toBe(0);
    });
  });

  describe('validacion por GPS', () => {
    it('rechaza confirmar desde lejos', async () => {
      await expect(service.confirmar('pd-1', CHOFER, A_CINCO_KM)).rejects.toMatchObject({
        response: { code: 'PARADA_FUERA_DE_RADIO' },
      });
    });

    it('el mensaje dice a cuantos metros esta, no solo que no se puede', async () => {
      await expect(service.confirmar('pd-1', CHOFER, A_CINCO_KM)).rejects.toMatchObject({
        response: { message: expect.stringMatching(/\d+ m del contenedor CT-0421/) },
      });
    });

    it('no toca nada si esta fuera de radio', async () => {
      await expect(service.confirmar('pd-1', CHOFER, A_CINCO_KM)).rejects.toThrow(
        ForbiddenException,
      );

      expect(parada.estado).toBe(EstadoParada.PENDIENTE);
      expect(contenedor.nivelLlenadoPct).toBe(94);
    });

    it('devuelve la distancia medida, para que la pantalla pueda mostrarla', async () => {
      const resultado = await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      expect(resultado.distanciaMetros).toBe(0);
    });

    it('respeta el radio configurado', async () => {
      const conRadioGrande = new ParadasService(
        paradas,
        rutas,
        contenedores,
        eventos,
        alertas as unknown as AlertasService,
        flota as unknown as FlotaService,
        { ejecutar: <T>(b: () => Promise<T>) => b() } as unknown as ContextoTransaccional,
        new ConfigService({ RADIO_CONFIRMACION_VACIADO_METROS: 20_000 }),
      );

      await expect(conRadioGrande.confirmar('pd-1', CHOFER, A_CINCO_KM)).resolves.toBeDefined();
    });
  });

  describe('quien puede confirmar', () => {
    it('un chofer no puede confirmar la parada de otro', async () => {
      await expect(service.confirmar('pd-1', 'user:otro', EN_EL_CONTENEDOR)).rejects.toMatchObject({
        response: { code: 'PARADA_DE_OTRA_RUTA' },
      });
    });

    it('falla con 404 si la parada no existe', async () => {
      paradas.buscarPorId.mockResolvedValue(null);

      await expect(service.confirmar('pd-x', CHOFER, EN_EL_CONTENEDOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('no se puede confirmar dos veces', async () => {
      parada.estado = EstadoParada.CONFIRMADA;

      await expect(service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR)).rejects.toMatchObject({
        response: { code: 'PARADA_YA_CONFIRMADA' },
      });
    });
  });

  describe('ciclo de vida de la ruta', () => {
    it('la primera confirmacion la pasa a EN_CURSO si quedan paradas', async () => {
      const otra = { ...parada, id: 'pd-2', estado: EstadoParada.PENDIENTE } as Parada;
      paradas.listarDeRuta.mockResolvedValue([parada, otra]);

      const resultado = await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      expect(resultado.rutaEstado).toBe(EstadoRuta.EN_CURSO);
      expect(flota.guardarEstado).not.toHaveBeenCalled();
    });

    it('la ultima la cierra y libera el camion', async () => {
      // Sin esto el camion quedaria EN_RUTA para siempre y no se podria volver
      // a usar: CU-03 bloquea justamente ese cambio a mano.
      const resultado = await service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR);

      expect(resultado.rutaEstado).toBe(EstadoRuta.COMPLETADA);
      expect(ruta.completadaEn).toBeInstanceOf(Date);
      expect(flota.guardarEstado).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoCamion.DISPONIBLE }),
      );
    });
  });

  describe('omitir · el chofer llego pero no pudo vaciar', () => {
    const MOTIVO = { motivo: 'Auto mal estacionado tapando el contenedor' };

    it('deja la parada OMITIDA con su motivo y la fecha', async () => {
      const resultado = await service.omitir('pd-1', CHOFER, MOTIVO);

      expect(parada.estado).toBe(EstadoParada.OMITIDA);
      expect(parada.motivo).toBe(MOTIVO.motivo);
      expect(parada.omitidaEn).toBeInstanceOf(Date);
      expect(resultado.estado).toBe(EstadoParada.OMITIDA);
    });

    it('NO toca el contenedor: sigue lleno y en CRITICO', async () => {
      // Es toda la diferencia con confirmar. Vaciar el contenedor porque el
      // chofer no pudo llegar seria mentirle al mapa.
      const resultado = await service.omitir('pd-1', CHOFER, MOTIVO);

      expect(contenedores.guardar).not.toHaveBeenCalled();
      expect(contenedor.nivelLlenadoPct).toBe(94);
      expect(resultado.estadoContenedor).toBe(EstadoContenedor.CRITICO);
      expect(resultado.nivelLlenadoPct).toBe(94);
    });

    it('NO cierra las alertas del contenedor', async () => {
      await service.omitir('pd-1', CHOFER, MOTIVO);

      expect(alertas.resolverAbiertasPorTipo).not.toHaveBeenCalled();
    });

    it('no exige estar dentro del radio: el caso tipico es no poder acercarse', async () => {
      // Una calle cortada deja al camion a cuadras del contenedor. Pedirle
      // estar a 100 m para declarar que no pudo llegar seria una contradiccion.
      await expect(service.omitir('pd-1', CHOFER, MOTIVO)).resolves.toBeDefined();
    });

    it('publica el evento con el motivo y el nivel en que quedo', async () => {
      await service.omitir('pd-1', CHOFER, MOTIVO);

      const [evento] = eventos.getPublished(EventTypes.PARADA_OMITIDA);

      expect(evento).toBeDefined();
      expect(evento.payload).toEqual(
        expect.objectContaining({
          contenedorId: 'CT-0421',
          motivo: MOTIVO.motivo,
          nivelLlenadoPct: 94,
          choferId: CHOFER,
        }),
      );
    });

    it('una parada omitida cierra la ruta y libera el camion como una confirmada', async () => {
      // Sin esto una calle cortada dejaba la ruta trabada en EN_CURSO para
      // siempre, y al camion tomado sin forma de recuperarlo.
      const resultado = await service.omitir('pd-1', CHOFER, MOTIVO);

      expect(resultado.rutaEstado).toBe(EstadoRuta.COMPLETADA);
      expect(flota.guardarEstado).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoCamion.DISPONIBLE }),
      );
    });

    it('rechaza omitir una parada de otro chofer', async () => {
      await expect(service.omitir('pd-1', 'user:otro', MOTIVO)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza omitir una parada que no existe', async () => {
      paradas.buscarPorId.mockResolvedValue(null);

      await expect(service.omitir('pd-1', CHOFER, MOTIVO)).rejects.toThrow(NotFoundException);
    });

    it('rechaza omitir una parada ya confirmada', async () => {
      parada.estado = EstadoParada.CONFIRMADA;

      await expect(service.omitir('pd-1', CHOFER, MOTIVO)).rejects.toThrow(ConflictException);
    });

    it('una parada omitida es final: no se vuelve a omitir', async () => {
      parada.estado = EstadoParada.OMITIDA;

      await expect(service.omitir('pd-1', CHOFER, MOTIVO)).rejects.toThrow(ConflictException);
    });

    it('una parada omitida tampoco se puede confirmar despues', async () => {
      // Reabrirla obligaria a revivir una ruta ya COMPLETADA y a volver a tomar
      // un camion que ya se libero. Si el contenedor se puede vaciar, se genera
      // una ruta nueva.
      parada.estado = EstadoParada.OMITIDA;

      await expect(service.confirmar('pd-1', CHOFER, EN_EL_CONTENEDOR)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
