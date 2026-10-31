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
      'guardarActividad' | 'guardarRefuerzo' | 'actividadesQueTerminanDespuesDe'
    >
  >;
  let contenedores: jest.Mocked<Pick<ContenedorRepository, 'listar'>>;
  let eventos: jest.Mocked<EventPublisher>;
  let service: ActividadesMasivasService;

  beforeEach(() => {
    integracion = {
      guardarActividad: jest.fn().mockImplementation(async (a) => a),
      guardarRefuerzo: jest.fn().mockImplementation(async (r) => r),
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

  it('una actividad de menos de 1.000 personas no es masiva', async () => {
    await service.registrar(actividad({ capacidad: 300 }));

    expect(integracion.guardarActividad).not.toHaveBeenCalled();
    expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
    expect(eventos.publish).not.toHaveBeenCalled();
  });

  it('una actividad cancelada no se guarda', async () => {
    await service.registrar(actividad({ estado: 'CANCELADA' }));

    expect(integracion.guardarActividad).not.toHaveBeenCalled();
    expect(eventos.publish).not.toHaveBeenCalled();
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
    ])('%s', async (_caso, cambios) => {
      await expect(service.registrar(actividad(cambios))).resolves.toBeUndefined();

      expect(integracion.guardarActividad).not.toHaveBeenCalled();
      expect(integracion.guardarRefuerzo).not.toHaveBeenCalled();
      expect(eventos.publish).not.toHaveBeenCalled();
    });
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
