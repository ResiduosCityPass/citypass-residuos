import { ConfigService } from '@nestjs/config';
import { EventTypes } from '../../../shared/domain/domain-event';
import { EventPublisher } from '../../../shared/events/event-publisher';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { ContenedorRepository } from '../../contenedores/domain/contenedor.repository';
import { IntegracionRepository } from '../domain/integracion.repository';
import { ActividadesMasivasService } from './actividades-masivas.service';

// Plaza Italia y un contenedor a ~100 m; otro en Caballito, a varios km.
const PLAZA_ITALIA = { lat: -34.5811, lng: -58.421 };
const contenedor = (id: string, lat: number, lng: number): Contenedor =>
  ({ id, codigo: id.toUpperCase(), zonaId: 'z-1', lat, lng, activo: true }) as Contenedor;
const CERCA = contenedor('c-cerca', -34.5815, -58.4202);
const LEJOS = contenedor('c-lejos', -34.6186, -58.4421);

// Campos tal como los publica Espacios en el bus (E1 del plan del squad).
const actividad = (cambios: Record<string, unknown> = {}) => ({
  correlationId: 'act-act-1',
  actividadId: 'act-1',
  titulo: 'Festival de Primavera',
  estado: 'PROGRAMADA',
  capacidad: 5000,
  fechaHoraInicio: Date.parse('2026-11-01T15:00:00.000Z'),
  fechaHoraFinalizacion: Date.parse('2026-11-01T20:00:00.000Z'),
  ubicacion: PLAZA_ITALIA,
  direccion: 'Av. Sarmiento 2601',
  espacioNombre: 'Plaza Italia',
  actorSub: null,
  ...cambios,
});

describe('ActividadesMasivasService (squad 3)', () => {
  let integracion: jest.Mocked<
    Pick<
      IntegracionRepository,
      | 'guardarActividad'
      | 'guardarRefuerzo'
      | 'borrarActividad'
      | 'borrarRefuerzo'
      | 'registrarCancelacion'
      | 'estaCancelada'
      | 'actividadesQueTerminanDespuesDe'
    >
  >;
  let contenedores: jest.Mocked<Pick<ContenedorRepository, 'listar'>>;
  let eventos: jest.Mocked<EventPublisher>;
  let service: ActividadesMasivasService;

  beforeEach(() => {
    integracion = {
      guardarActividad: jest.fn().mockImplementation(async (a) => a),
      guardarRefuerzo: jest.fn().mockImplementation(async (r) => r),
      borrarActividad: jest.fn().mockResolvedValue(undefined),
      borrarRefuerzo: jest.fn().mockResolvedValue(undefined),
      registrarCancelacion: jest.fn().mockResolvedValue(undefined),
      estaCancelada: jest.fn().mockResolvedValue(false),
      actividadesQueTerminanDespuesDe: jest.fn().mockResolvedValue([]),
    };
    contenedores = { listar: jest.fn().mockResolvedValue([CERCA, LEJOS]) };
    eventos = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new ActividadesMasivasService(
      integracion as unknown as IntegracionRepository,
      contenedores as unknown as ContenedorRepository,
      eventos,
      new ConfigService({}),
    );
  });

  it('guarda la actividad con los contenedores cercanos', async () => {
    await service.registrar(actividad());

    expect(integracion.guardarActividad).toHaveBeenCalledWith({
      actividadId: 'act-1',
      titulo: 'Festival de Primavera',
      capacidad: 5000,
      lat: PLAZA_ITALIA.lat,
      lng: PLAZA_ITALIA.lng,
      inicio: new Date('2026-11-01T15:00:00.000Z'),
      fin: new Date('2026-11-01T20:00:00.000Z'),
      contenedorIds: ['c-cerca'],
    });
  });

  it('agenda la escuadrilla: los contenedores entran al ruteo desde el fin y por 6 h', async () => {
    await service.registrar(actividad());

    expect(integracion.guardarRefuerzo).toHaveBeenCalledWith({
      eventoId: 'act-act-1',
      zona: null,
      contenedorIds: ['c-cerca'],
      desde: new Date('2026-11-01T20:00:00.000Z'),
      hasta: new Date('2026-11-02T02:00:00.000Z'),
    });
  });

  it('publica RefuerzoProgramado para la metrica de Analitica', async () => {
    await service.registrar(actividad());

    expect(eventos.publish).toHaveBeenCalledTimes(1);
    expect(eventos.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: EventTypes.REFUERZO_PROGRAMADO,
        payload: {
          refuerzoId: 'refuerzo-act-act-1',
          eventoId: 'act-act-1',
          zona: '',
          contenedores: 1,
          programadoPara: '2026-11-01T20:00:00.000Z',
        },
      }),
    );
  });

  it('sin contenedores cerca guarda la actividad pero no agenda escuadrilla', async () => {
    contenedores.listar.mockResolvedValue([LEJOS]);

    await service.registrar(actividad());

    expect(integracion.guardarActividad).toHaveBeenCalledWith(
      expect.objectContaining({ contenedorIds: [] }),
    );
    expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
    expect(eventos.publish).not.toHaveBeenCalled();
  });

  describe('reserva de un evento comunitario chico (squad 6)', () => {
    it('de 100 a 999 personas agenda la escuadrilla pero no marca zona en el mapa', async () => {
      await service.registrar(actividad({ capacidad: 300 }));

      expect(integracion.guardarActividad).not.toHaveBeenCalled();
      expect(integracion.guardarRefuerzo).toHaveBeenCalledWith({
        eventoId: 'res-act-1',
        zona: null,
        contenedorIds: ['c-cerca'],
        desde: new Date('2026-11-01T20:00:00.000Z'),
        hasta: new Date('2026-11-02T02:00:00.000Z'),
      });
      expect(eventos.publish).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: EventTypes.REFUERZO_PROGRAMADO }),
      );
    });

    it('desde 1.000 personas el refuerzo sigue siendo de actividad masiva', async () => {
      await service.registrar(actividad({ capacidad: 1000 }));

      expect(integracion.guardarRefuerzo).toHaveBeenCalledWith(
        expect.objectContaining({ eventoId: 'act-act-1' }),
      );
    });

    it('el cupo minimo de 100 personas ya tiene refuerzo', async () => {
      await service.registrar(actividad({ capacidad: 100 }));

      expect(integracion.guardarRefuerzo).toHaveBeenCalledTimes(1);
    });

    it('con menos de 100 personas no hace nada', async () => {
      await service.registrar(actividad({ capacidad: 99 }));

      expect(contenedores.listar).not.toHaveBeenCalled();
      expect(integracion.guardarActividad).not.toHaveBeenCalled();
      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
      expect(eventos.publish).not.toHaveBeenCalled();
    });

    it('el cupo minimo se configura con INTEGRACION_CUPO_MINIMO_REFUERZO', async () => {
      const conCupo = new ActividadesMasivasService(
        integracion as unknown as IntegracionRepository,
        contenedores as unknown as ContenedorRepository,
        eventos,
        new ConfigService({ INTEGRACION_CUPO_MINIMO_REFUERZO: '500' }),
      );

      await conCupo.registrar(actividad({ capacidad: 300 }));

      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
    });

    it('sin contenedores cerca no guarda nada ni publica', async () => {
      contenedores.listar.mockResolvedValue([LEJOS]);

      await service.registrar(actividad({ capacidad: 300 }));

      expect(integracion.guardarActividad).not.toHaveBeenCalled();
      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
      expect(eventos.publish).not.toHaveBeenCalled();
    });
  });

  describe('cancelacion (squad 6)', () => {
    const retiroTodo = (id: string) => {
      expect(integracion.registrarCancelacion).toHaveBeenCalledWith(id);
      expect(integracion.borrarRefuerzo.mock.calls.flat()).toEqual([id, `act-${id}`, `res-${id}`]);
      expect(integracion.borrarActividad).toHaveBeenCalledWith(id);
    };

    it.each(['CANCELADA', 'CANCELLED', 'cancelled'])(
      'una actividad con estado %s retira todo, sin guardar nada',
      async (estado) => {
        await service.registrar(actividad({ estado }));

        retiroTodo('act-1');
        expect(integracion.guardarActividad).not.toHaveBeenCalled();
        expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
        expect(eventos.publish).not.toHaveBeenCalled();
      },
    );

    it('una actividad cancelada se retira aunque le falten campos', async () => {
      await service.registrar({ actividadId: 'act-1', estado: 'CANCELLED' });

      retiroTodo('act-1');
    });

    it.each([
      ['eventoId, como en EventoCancelado', { eventoId: 'evt-1' }],
      ['actividadId', { actividadId: 'evt-1' }],
      ['reservaId', { reservaId: 'evt-1' }],
    ])('un evento de cancelacion con %s retira todo', async (_caso, data) => {
      await service.cancelar(data);

      retiroTodo('evt-1');
    });

    it('si la cancelacion llego antes, la actividad no se agenda', async () => {
      integracion.estaCancelada.mockResolvedValue(true);

      await service.registrar(actividad());

      expect(integracion.estaCancelada).toHaveBeenCalledWith('act-1');
      expect(integracion.guardarActividad).not.toHaveBeenCalled();
      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
      expect(eventos.publish).not.toHaveBeenCalled();
    });

    it.each(['CANCELADA', 'CANCELLED'])(
      'ActividadModificada con estadoNuevo %s cancela',
      async (estadoNuevo) => {
        await service.modificar({ actividadId: 'act-1', estadoNuevo });

        retiroTodo('act-1');
      },
    );

    it('ActividadModificada con otro estado no toca nada', async () => {
      await service.modificar({ actividadId: 'act-1', estadoNuevo: 'ACTIVE_FULL' });

      expect(integracion.registrarCancelacion).not.toHaveBeenCalled();
      expect(integracion.borrarRefuerzo).not.toHaveBeenCalled();
    });

    it.each([
      ['sin id', {}],
      ['con un id vacio', { actividadId: '' }],
      ['con un id que no es texto', { actividadId: 42 }],
      ['con un id demasiado largo', { actividadId: 'x'.repeat(61) }],
    ])('un evento de cancelacion %s se ignora sin error', async (_caso, data) => {
      await expect(service.cancelar(data)).resolves.toBeUndefined();

      expect(integracion.registrarCancelacion).not.toHaveBeenCalled();
      expect(integracion.borrarRefuerzo).not.toHaveBeenCalled();
      expect(integracion.borrarActividad).not.toHaveBeenCalled();
    });

    it('dice si una actividad esta cancelada', async () => {
      integracion.estaCancelada.mockResolvedValue(true);

      await expect(service.estaCancelada('act-1')).resolves.toBe(true);
    });
  });

  describe('un evento mal formado se ignora sin error, para que el bus no lo reintente', () => {
    it.each([
      ['sin ubicacion', { ubicacion: undefined }],
      ['sin longitud', { ubicacion: { lat: PLAZA_ITALIA.lat } }],
      ['sin id', { actividadId: undefined }],
      [
        'con la fecha de fin en ISO en vez de milisegundos',
        { fechaHoraFinalizacion: '2026-11-01T20:00:00Z' },
      ],
      ['sin fecha de inicio', { fechaHoraInicio: undefined }],
      ['con una fecha fuera de rango', { fechaHoraFinalizacion: 1e20 }],
      ['con un id que no entra en el refuerzo', { actividadId: 'x'.repeat(61) }],
      ['con una capacidad que no es un numero', { capacidad: 'muchos' }],
      ['con una capacidad con decimales', { capacidad: 1000.5 }],
      ['con una capacidad que no entra en la columna', { capacidad: 3_000_000_000 }],
    ])('%s', async (_caso, cambios) => {
      await expect(service.registrar(actividad(cambios))).resolves.toBeUndefined();

      expect(integracion.guardarActividad).not.toHaveBeenCalled();
      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
      expect(eventos.publish).not.toHaveBeenCalled();
    });
  });

  it('acepta el id mas largo que entra en el refuerzo', async () => {
    const actividadId = 'x'.repeat(60);

    await service.registrar(actividad({ actividadId }));

    expect(integracion.guardarRefuerzo).toHaveBeenCalledWith(
      expect.objectContaining({ eventoId: `act-${actividadId}` }),
    );
  });

  it('recorta un titulo que no entra en la columna, sin perder la actividad', async () => {
    await service.registrar(actividad({ titulo: 'x'.repeat(250) }));

    expect(integracion.guardarActividad).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'x'.repeat(200) }),
    );
  });

  it('para el mapa trae las que terminaron hace menos de 6 h, con su radio', async () => {
    integracion.actividadesQueTerminanDespuesDe.mockResolvedValue([
      {
        actividadId: 'act-1',
        titulo: 'Festival de Primavera',
        capacidad: 5000,
        lat: PLAZA_ITALIA.lat,
        lng: PLAZA_ITALIA.lng,
        inicio: new Date('2026-11-01T15:00:00.000Z'),
        fin: new Date('2026-11-01T20:00:00.000Z'),
        contenedorIds: ['c-cerca'],
        creadaEn: new Date(),
      },
    ]);

    const zonas = await service.paraMapa(new Date('2026-11-01T22:00:00.000Z'));

    expect(integracion.actividadesQueTerminanDespuesDe).toHaveBeenCalledWith(
      new Date('2026-11-01T16:00:00.000Z'),
    );
    expect(zonas).toEqual([
      {
        actividadId: 'act-1',
        titulo: 'Festival de Primavera',
        capacidad: 5000,
        lat: PLAZA_ITALIA.lat,
        lng: PLAZA_ITALIA.lng,
        radioMetros: 300,
        inicio: '2026-11-01T15:00:00.000Z',
        fin: '2026-11-01T20:00:00.000Z',
        contenedores: 1,
      },
    ]);
  });
});
