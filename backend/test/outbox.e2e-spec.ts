import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/shared/filters/http-exception.filter';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { DespachadorOutbox } from '../src/shared/events/outbox/despachador-outbox';
import {
  EstadoEventoPendiente,
  EventoPendiente,
} from '../src/shared/events/outbox/evento-pendiente.entity';
import { OUTBOX_REPOSITORY } from '../src/shared/events/outbox/outbox.repository';
import { TRANSPORTE_EVENTOS } from '../src/shared/events/transporte-eventos';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * Outbox transaccional contra PostgreSQL real (ADR-003).
 *
 * Es lo unico que puede demostrar la promesa del contrato de eventos: que el
 * evento no se pierde cuando el broker falla, y que no se publica si el cambio
 * de negocio no se guardo.
 */
describe('Outbox transaccional (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;

  const prepararSensor = async () => {
    const zona = await http
      .post('/api/v1/zonas')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: `Zona ${Date.now()}`, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const contenedor = await http
      .post('/api/v1/contenedores')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        zonaId: zona.body.id,
        tipoResiduo: TipoResiduo.COMUN,
        capacidadLitros: 1100,
        lat: -34.6037,
        lng: -58.3816,
      })
      .expect(201);

    const sensor = await http
      .post(`/api/v1/contenedores/${contenedor.body.id}/sensor`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);

    return { contenedor: contenedor.body, apiKey: sensor.body.apiKey };
  };

  const filasOutbox = () => ctx.dataSource.getRepository(EventoPendiente).find();

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = ctx.token(Rol.ADMINISTRADOR);
  });

  afterAll(async () => {
    await ctx.cerrar();
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  it('el evento se guarda en la tabla, no se publica en el acto', async () => {
    const { apiKey } = await prepararSensor();

    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', apiKey)
      .send({ nivelLlenadoPct: 85, temperaturaC: 21, bateriaPct: 90 })
      .expect(202);

    const filas = await filasOutbox();

    expect(filas).toHaveLength(1);
    expect(filas[0].eventType).toBe('residuos.contenedor.critico');
    expect(filas[0].estado).toBe(EstadoEventoPendiente.PENDIENTE);
    expect(filas[0].intentos).toBe(0);
  });

  it('guarda el sobre completo, con el eventId que el consumidor usa para deduplicar', async () => {
    const { apiKey } = await prepararSensor();

    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', apiKey)
      .send({ nivelLlenadoPct: 85, temperaturaC: 21, bateriaPct: 90 })
      .expect(202);

    const [fila] = await filasOutbox();

    expect(fila.sobre).toMatchObject({
      eventId: fila.eventId,
      eventType: 'residuos.contenedor.critico',
      source: 'residuos-service',
      version: 1,
    });
    expect((fila.sobre as { payload: Record<string, unknown> }).payload).toMatchObject({
      umbralConfigurado: 70,
    });
  });

  it('el despachador lo publica y lo marca', async () => {
    const { apiKey } = await prepararSensor();
    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', apiKey)
      .send({ nivelLlenadoPct: 85, temperaturaC: 21, bateriaPct: 90 })
      .expect(202);

    const publicados = await ctx.app.get(DespachadorOutbox).despachar();

    expect(publicados).toBe(1);

    const [fila] = await filasOutbox();
    expect(fila.estado).toBe(EstadoEventoPendiente.PUBLICADO);
    expect(fila.publicadoEn).not.toBeNull();
  });

  it('un incendio y una saturacion generan dos eventos en la misma transaccion', async () => {
    const { apiKey } = await prepararSensor();

    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', apiKey)
      .send({ nivelLlenadoPct: 85, temperaturaC: 88, bateriaPct: 90 })
      .expect(202);

    const tipos = (await filasOutbox()).map((f) => f.eventType).sort();

    expect(tipos).toEqual(['residuos.contenedor.critico', 'residuos.incendio.detectado']);
  });

  it('una lectura que no dispara nada no deja eventos', async () => {
    const { apiKey } = await prepararSensor();

    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', apiKey)
      .send({ nivelLlenadoPct: 30, temperaturaC: 21, bateriaPct: 90 })
      .expect(202);

    expect(await filasOutbox()).toHaveLength(0);
  });
});

/**
 * Rollback: si el evento no se puede registrar, el cambio de negocio tampoco
 * se guarda.
 *
 * Necesita una aplicacion aparte porque reemplaza un proveedor por uno que
 * falla, y eso no se puede hacer sobre la instancia compartida.
 */
describe('Outbox transaccional · rollback (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let http: ReturnType<typeof request>;
  let admin: string;
  let fallar = false;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TRANSPORTE_EVENTOS)
      .useValue({ publish: jest.fn() })
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    http = request(app.getHttpServer());

    // Se envuelve el repositorio real para poder hacerlo fallar a voluntad sin
    // perder su comportamiento cuando no se lo pide.
    const outbox = app.get(OUTBOX_REPOSITORY) as { encolar: (e: unknown) => Promise<void> };
    const encolarOriginal = outbox.encolar.bind(outbox);
    outbox.encolar = async (evento: unknown) => {
      if (fallar) {
        throw new Error('no se pudo registrar el evento');
      }
      return encolarOriginal(evento);
    };

    const { JwtService } = await import('@nestjs/jwt');
    admin = app
      .get(JwtService)
      .sign({ sub: 'test', username: 'test@test.local', rol: Rol.ADMINISTRADOR });
  });

  afterAll(async () => {
    await app.close();
  });

  it('si el evento no se puede registrar, no queda ni la lectura ni la alerta', async () => {
    await dataSource.query(
      'TRUNCATE TABLE "evento_pendiente", "alerta", "lectura", "sensor", "contenedor", "camion", "zona" RESTART IDENTITY CASCADE',
    );

    const zona = await http
      .post('/api/v1/zonas')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: `Zona ${Date.now()}`, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const contenedor = await http
      .post('/api/v1/contenedores')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        zonaId: zona.body.id,
        tipoResiduo: TipoResiduo.COMUN,
        capacidadLitros: 1100,
        lat: -34.6,
        lng: -58.4,
      })
      .expect(201);

    const sensor = await http
      .post(`/api/v1/contenedores/${contenedor.body.id}/sensor`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);

    fallar = true;
    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', sensor.body.apiKey)
      .send({ nivelLlenadoPct: 85, temperaturaC: 21, bateriaPct: 90 })
      .expect(500);
    fallar = false;

    // Sin transaccion, la lectura y el cambio de estado habrian quedado
    // guardados y solo se habria perdido el evento: un contenedor critico que
    // nadie anuncia.
    const lecturas = await dataSource.query('SELECT count(*)::int AS n FROM lectura');
    const alertas = await dataSource.query('SELECT count(*)::int AS n FROM alerta');
    const estado = await dataSource.query('SELECT estado FROM contenedor WHERE id = $1', [
      contenedor.body.id,
    ]);

    expect(lecturas[0].n).toBe(0);
    expect(alertas[0].n).toBe(0);
    expect(estado[0].estado).toBe('NORMAL');
    expect(await dataSource.getRepository(EventoPendiente).count()).toBe(0);
  });
});
