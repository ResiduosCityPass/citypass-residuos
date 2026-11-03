import {
  OBSTRUCCION_REPOSITORY,
  ObstruccionRepository,
} from '../src/modules/integracion/domain/integracion.repository';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { ContingenciasService } from '../src/modules/contingencias/application/contingencias.service';
import {
  EVENTO_FIN,
  EVENTO_INICIO,
} from '../src/modules/contingencias/application/dto/evento-inundacion.dto';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

describe('Suspension y recuperacion por inundacion (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;
  const posicion = { lat: -34.6037, lng: -58.3816 };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = ctx.token();
  });
  afterAll(async () => {
    await ctx?.cerrar();
  });
  beforeEach(async () => {
    await ctx.limpiar();
  });

  const escenario = async () => {
    const zona = (
      await http
        .post('/api/v1/zonas')
        .set(auth(admin))
        .send({ nombre: 'Centro', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
        .expect(201)
    ).body;
    const contenedor = (
      await http
        .post('/api/v1/contenedores')
        .set(auth(admin))
        .send({
          zonaId: zona.id,
          tipoResiduo: TipoResiduo.COMUN,
          capacidadLitros: 1100,
          ...posicion,
        })
        .expect(201)
    ).body;
    const sensor = (
      await http
        .post(`/api/v1/contenedores/${contenedor.id}/sensor`)
        .set(auth(admin))
        .send({})
        .expect(201)
    ).body;
    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', sensor.apiKey)
      .send({ nivelLlenadoPct: 90, temperaturaC: 20, bateriaPct: 90 })
      .expect(202);
    const camion = (
      await http
        .post('/api/v1/camiones')
        .set(auth(admin))
        .send({
          patente: 'AB123CD',
          capacidadLitros: 10000,
          tipoResiduoHabilitado: TipoResiduo.COMUN,
        })
        .expect(201)
    ).body;
    const chofer = (
      await http
        .post('/api/v1/choferes')
        .set(auth(admin))
        .send({ nombre: 'Juana Perez', legajo: 'CH-001', usuarioSub: 'test-CHOFER' })
        .expect(201)
    ).body;
    return { zona, contenedor, sensor, camion, chofer };
  };
  const iniciar = async (zonaId: string) =>
    (
      await http
        .post('/api/v1/contingencias/simulador/inicio')
        .set(auth(admin))
        .send({ descripcion: 'Inundacion Centro', zonaIds: [zonaId] })
        .expect(201)
    ).body.contingencia;
  const finalizar = async (id: string) =>
    http.post(`/api/v1/contingencias/simulador/${id}/finalizacion`).set(auth(admin)).expect(201);
  const recuperar = async (id: string) =>
    http.patch(`/api/v1/contingencias/${id}/recuperar`).set(auth(admin)).expect(200);

  it('suspende una ruta ya asignada y retoma el mismo trabajo hasta restablecer el servicio', async () => {
    const { zona, camion, chofer, contenedor } = await escenario();
    const ruta = (
      await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201)
    ).body;
    await http
      .patch(`/api/v1/rutas/${ruta.id}/asignar`)
      .set(auth(admin))
      .send({ choferId: chofer.id })
      .expect(200);
    const inundacion = await iniciar(zona.id);
    const choferAuth = auth(ctx.token(Rol.CHOFER));
    const mia = (await http.get('/api/v1/rutas/mias').set(choferAuth).expect(200)).body;
    expect(mia.paradasSuspendidas).toBe(1);
    expect(mia.paradas[0].estado).toBe('PENDIENTE');
    expect(mia.paradas[0].restriccionesInundacion[0].contingenciaId).toBe(inundacion.id);
    const confirmar = () =>
      http.patch(`/api/v1/paradas/${mia.paradas[0].id}/confirmar`).set(choferAuth).send(posicion);
    expect((await confirmar().expect(409)).body.code).toBe('PARADA_SUSPENDIDA_INUNDACION');
    await http
      .patch(`/api/v1/paradas/${mia.paradas[0].id}/omitir`)
      .set(choferAuth)
      .send({ motivo: 'Inundacion' })
      .expect(409);
    expect(
      (await http.get(`/api/v1/contenedores/${contenedor.id}`).set(auth(admin))).body
        .nivelLlenadoPct,
    ).toBe(90);
    expect(
      (await http.get(`/api/v1/alertas?contenedorId=${contenedor.id}`).set(auth(admin))).body[0]
        .estado,
    ).toBe('ABIERTA');
    await finalizar(inundacion.id);
    await confirmar().expect(409);
    const habilitada = await recuperar(inundacion.id);
    expect(habilitada.body.estado).toBe('EN_RECUPERACION');
    // La ruta viva sigue reservando su contenedor: no se duplica en otra propuesta.
    await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.id })
      .expect(409);
    await confirmar().expect(200);
    const completa = (
      await http.get(`/api/v1/contingencias/${inundacion.id}`).set(auth(admin)).expect(200)
    ).body;
    expect(completa.estado).toBe('RECUPERADA');
    expect(completa.contenedores[0].vaciadoEn).not.toBeNull();
    const eventos = await ctx.dataSource.query('SELECT "eventType" FROM evento_pendiente');
    expect(
      eventos.filter(
        (e: { eventType: string }) => e.eventType === 'residuos.servicio.restablecido',
      ),
    ).toHaveLength(1);
    expect(eventos.map((e: { eventType: string }) => e.eventType)).toEqual(
      expect.arrayContaining([
        'residuos.servicio.afectado',
        'residuos.recuperacion.pendiente',
        'residuos.recuperacion.habilitada',
        'residuos.servicio.restablecido',
      ]),
    );
  });

  it('incluye acumulacion no critica posterior al inicio y no borra el snapshot al habilitar', async () => {
    const { zona, camion, contenedor, chofer } = await escenario();
    const inundacion = await iniciar(zona.id);
    const segundo = (
      await http
        .post('/api/v1/contenedores')
        .set(auth(admin))
        .send({
          zonaId: zona.id,
          tipoResiduo: TipoResiduo.COMUN,
          capacidadLitros: 1100,
          ...posicion,
        })
        .expect(201)
    ).body;
    const sensor = (
      await http
        .post(`/api/v1/contenedores/${segundo.id}/sensor`)
        .set(auth(admin))
        .send({})
        .expect(201)
    ).body;
    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', sensor.apiKey)
      .send({ nivelLlenadoPct: 25, temperaturaC: 20, bateriaPct: 90 })
      .expect(202);
    await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.id })
      .expect(409);
    await finalizar(inundacion.id);
    const habilitada = await recuperar(inundacion.id);
    expect(habilitada.body.contenedores).toHaveLength(2);
    const ruta = (
      await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201)
    ).body;
    expect(ruta.paradas.map((p: { contenedorId: string }) => p.contenedorId)).toEqual(
      expect.arrayContaining([contenedor.id, segundo.id]),
    );
    await http
      .patch(`/api/v1/rutas/${ruta.id}/asignar`)
      .set(auth(admin))
      .send({ choferId: chofer.id })
      .expect(200);
    const choferAuth = auth(ctx.token(Rol.CHOFER));
    await http
      .patch(`/api/v1/paradas/${ruta.paradas[0].id}/confirmar`)
      .set(choferAuth)
      .send(posicion)
      .expect(200);
    expect(
      (await http.get(`/api/v1/contingencias/${inundacion.id}`).set(auth(admin))).body.estado,
    ).toBe('EN_RECUPERACION');
    await http
      .patch(`/api/v1/paradas/${ruta.paradas[1].id}/confirmar`)
      .set(choferAuth)
      .send(posicion)
      .expect(200);
    expect(
      (await http.get(`/api/v1/contingencias/${inundacion.id}`).set(auth(admin))).body.estado,
    ).toBe('RECUPERADA');
  });

  it('no asigna una propuesta que quedo suspendida despues de generarla', async () => {
    const { zona, camion, chofer } = await escenario();
    const ruta = (
      await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201)
    ).body;
    await iniciar(zona.id);
    expect(
      (
        await http
          .patch(`/api/v1/rutas/${ruta.id}/asignar`)
          .set(auth(admin))
          .send({ choferId: chofer.id })
          .expect(409)
      ).body.code,
    ).toBe('RUTA_CON_PARADAS_SUSPENDIDAS');
    await http.patch(`/api/v1/rutas/${ruta.id}/descartar`).set(auth(admin)).expect(200);
  });

  it('preserva otra inundacion y el bloqueo manual al habilitar una recuperacion', async () => {
    const { zona, camion } = await escenario();
    const una = await iniciar(zona.id);
    const otra = await iniciar(zona.id);
    await http
      .patch(`/api/v1/zonas/${zona.id}/bloqueo?bloqueada=true`)
      .set(auth(admin))
      .expect(200);
    await finalizar(una.id);
    await recuperar(una.id);
    const z = (await http.get(`/api/v1/zonas/${zona.id}`).set(auth(admin)).expect(200)).body;
    expect(z.bloqueada).toBe(true);
    expect(
      z.restriccionesInundacion.map((r: { contingenciaId: string }) => r.contingenciaId),
    ).toEqual([otra.id]);
    await finalizar(otra.id);
    await recuperar(otra.id);
    await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.id })
      .expect(409);
    await http
      .patch(`/api/v1/zonas/${zona.id}/bloqueo?bloqueada=false`)
      .set(auth(admin))
      .expect(200);
    await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.id })
      .expect(201);
  });

  it('el mapa muestra la suspension sin cambiar estado ni llenado y el operador no recupera durante la inundacion', async () => {
    const { zona } = await escenario();
    const c = await iniciar(zona.id);
    const mapa = (await http.get('/api/v1/mapa/contenedores').set(auth(admin)).expect(200)).body;
    expect(mapa[0]).toMatchObject({
      estado: 'CRITICO',
      nivelLlenadoPct: 90,
      recoleccionSuspendida: true,
    });
    expect(
      (await http.patch(`/api/v1/contingencias/${c.id}/recuperar`).set(auth(admin)).expect(409))
        .body.code,
    ).toBe('INUNDACION_ACTIVA');
  });

  it('deduplica en la base y una revision vieja no reactiva la inundacion', async () => {
    const { zona } = await escenario();
    const id = randomUUID();
    const evento = {
      eventId: randomUUID(),
      eventType: EVENTO_INICIO,
      source: 'espaciospublicos-service',
      version: 1,
      occurredAt: new Date().toISOString(),
      correlationId: id,
      payload: { inundacionId: id, revision: 1, zonaIds: [zona.id], descripcion: 'Inundacion' },
    };
    const service = ctx.app.get(ContingenciasService);
    await service.procesarEvento(evento);
    expect((await service.procesarEvento(evento)).duplicado).toBe(true);
    await service.procesarEvento({
      ...evento,
      eventId: randomUUID(),
      eventType: EVENTO_FIN,
      payload: { ...evento.payload, revision: 2 },
    });
    expect((await service.procesarEvento({ ...evento, eventId: randomUUID() })).ignorado).toBe(
      true,
    );
    const total = await ctx.dataSource.query('SELECT count(*) FROM contingencia');
    expect(total[0].count).toBe('1');
  });

  it('dos entregas concurrentes producen una sola restriccion y una sola salida', async () => {
    const { zona } = await escenario();
    const id = randomUUID();
    const evento = {
      eventId: randomUUID(),
      eventType: EVENTO_INICIO,
      source: 'espaciospublicos-service',
      version: 1,
      occurredAt: new Date().toISOString(),
      correlationId: id,
      payload: { inundacionId: id, revision: 1, zonaIds: [zona.id], descripcion: 'Inundacion' },
    };
    const service = ctx.app.get(ContingenciasService);
    const resultados = await Promise.all([
      service.procesarEvento(evento),
      service.procesarEvento(evento),
    ]);
    expect(resultados.filter((r) => r.duplicado)).toHaveLength(1);
    expect(await service.restricciones()).toHaveLength(1);
    const salidas = await ctx.dataSource.query(
      'SELECT * FROM evento_pendiente WHERE "eventType" = $1',
      ['residuos.servicio.afectado'],
    );
    expect(salidas).toHaveLength(1);
  });

  it('inicio y finalizacion concurrentes terminan en pendiente de habilitacion', async () => {
    const { zona } = await escenario();
    const id = randomUUID();
    const evento = {
      eventId: randomUUID(),
      eventType: EVENTO_INICIO,
      source: 'espaciospublicos-service',
      version: 1,
      occurredAt: new Date().toISOString(),
      correlationId: id,
      payload: { inundacionId: id, revision: 1, zonaIds: [zona.id], descripcion: 'Inundacion' },
    };
    const service = ctx.app.get(ContingenciasService);
    await Promise.all([
      service.procesarEvento({
        ...evento,
        eventId: randomUUID(),
        eventType: EVENTO_FIN,
        payload: { ...evento.payload, revision: 2 },
      }),
      service.procesarEvento(evento),
    ]);
    expect((await service.obtener(id)).estado).toBe('PENDIENTE_RECUPERACION');
  });

  it('revierte la restriccion y el inbox si falla escribir la outbox', async () => {
    const { zona } = await escenario();
    const service = ctx.app.get(ContingenciasService);
    // La prueba de atomicidad usa un trigger temporal, sin sustituir los repositorios reales.
    await ctx.dataSource.query(
      `CREATE FUNCTION rechazar_outbox_clima() RETURNS trigger AS $$ BEGIN IF NEW."eventType" = 'residuos.servicio.afectado' THEN RAISE EXCEPTION 'fallo de outbox'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
    );
    await ctx.dataSource.query(
      `CREATE TRIGGER fallo_clima BEFORE INSERT ON evento_pendiente FOR EACH ROW EXECUTE FUNCTION rechazar_outbox_clima()`,
    );
    try {
      await expect(
        service.simularInicio({ descripcion: 'Inundacion', zonaIds: [zona.id] }),
      ).rejects.toThrow('fallo de outbox');
      expect((await service.listar()).contingencias).toHaveLength(0);
      expect(await ctx.dataSource.query('SELECT * FROM evento_climatico_recibido')).toHaveLength(0);
    } finally {
      await ctx.dataSource.query('DROP TRIGGER fallo_clima ON evento_pendiente');
      await ctx.dataSource.query('DROP FUNCTION rechazar_outbox_clima()');
    }
  });

  it('valida datos y exige rol de operador o administrador', async () => {
    await http.get('/api/v1/contingencias').expect(401);
    await http
      .get('/api/v1/contingencias')
      .set(auth(ctx.token(Rol.CHOFER)))
      .expect(403);
    await http
      .post('/api/v1/contingencias/simulador/inicio')
      .set(auth(admin))
      .send({ descripcion: 'x', zonaIds: [] })
      .expect(400);
    await http.get('/api/v1/contingencias/no-uuid').set(auth(admin)).expect(400);
    await http
      .get('/api/v1/contingencias')
      .set(auth(ctx.token(Rol.OPERADOR)))
      .expect(200);
  });
  it('el fin climatico no libera una emergencia activa y los dos usan la misma integracion', async () => {
    const { zona, camion } = await escenario();
    const inundacion = await iniciar(zona.id);
    const enviar = (eventType: string, data: Record<string, unknown>) =>
      http
        .post(`/api/v1/webhooks/citypass?token=${process.env.GATEWAY_WEBHOOK_TOKEN}`)
        .send({ metadata: { eventId: randomUUID(), eventType }, data })
        .expect(204);
    await enviar('com.citypass.emergencias.EmergenciaCreada', {
      emergenciaId: 'EM-CLIMA',
      afectaCirculacion: true,
      ubicacion: posicion,
    });
    await finalizar(inundacion.id);
    await recuperar(inundacion.id);
    const z = (await http.get(`/api/v1/zonas/${zona.id}`).set(auth(admin)).expect(200)).body;
    expect(z.bloqueada).toBe(true);
    expect(z.bloqueoManual).toBe(false);
    expect(z.restriccionesInundacion).toEqual([]);
    await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.id })
      .expect(409);
    await enviar('com.citypass.emergencias.EmergenciaCerrada', { emergenciaId: 'EM-CLIMA' });
    await http
      .post('/api/v1/rutas/generar')
      .set(auth(admin))
      .send({ camionId: camion.id })
      .expect(201);
  });

  it('la recuperacion incluye un contenedor no critico y respeta obstrucciones de Reclamos', async () => {
    const { zona, camion, contenedor } = await escenario();
    const normal = (
      await http
        .post('/api/v1/contenedores')
        .set(auth(admin))
        .send({
          zonaId: zona.id,
          tipoResiduo: TipoResiduo.COMUN,
          capacidadLitros: 1100,
          ...posicion,
        })
        .expect(201)
    ).body;
    const sensor = (
      await http
        .post(`/api/v1/contenedores/${normal.id}/sensor`)
        .set(auth(admin))
        .send({})
        .expect(201)
    ).body;
    await http
      .post('/api/v1/lecturas')
      .set('X-Sensor-Key', sensor.apiKey)
      .send({ nivelLlenadoPct: 30, temperaturaC: 20, bateriaPct: 90 })
      .expect(202);
    const inundacion = await iniciar(zona.id);
    await finalizar(inundacion.id);
    await recuperar(inundacion.id);
    const obstrucciones = ctx.app.get<ObstruccionRepository>(OBSTRUCCION_REPOSITORY);
    await obstrucciones.guardarObstrucciones([
      {
        reclamoId: 'RC-CLIMA',
        contenedorId: contenedor.id,
        distanciaMetros: 5,
        venceEn: new Date(Date.now() + 3600000),
      },
    ]);
    const ruta = (
      await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201)
    ).body;
    expect(ruta.paradas.map((p: { contenedorId: string }) => p.contenedorId)).toEqual([normal.id]);
    await http.patch(`/api/v1/rutas/${ruta.id}/descartar`).set(auth(admin)).expect(200);
    await obstrucciones.resolverReclamo('RC-CLIMA', new Date());
    const liberada = (
      await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.id })
        .expect(201)
    ).body;
    expect(liberada.paradas.map((p: { contenedorId: string }) => p.contenedorId).sort()).toEqual(
      [contenedor.id, normal.id].sort(),
    );
  });
});
