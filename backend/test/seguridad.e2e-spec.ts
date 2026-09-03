import * as request from 'supertest';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * Verifica la politica del ADR-005 sobre la aplicacion armada de verdad: todo
 * endpoint nace protegido y abrir uno es una decision explicita.
 *
 * Es un test de integracion y no unitario a proposito: los guards globales se
 * registran como APP_GUARD, asi que solo se los puede comprobar con el
 * contenedor de inyeccion armado.
 */
describe('Seguridad (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;

  const PROTEGIDOS = [
    '/api/v1/zonas',
    '/api/v1/contenedores',
    '/api/v1/alertas',
    '/api/v1/camiones',
    '/api/v1/mapa/contenedores',
  ];

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
  });

  afterAll(async () => {
    await ctx.cerrar();
  });

  beforeEach(async () => {
    await ctx.limpiar();
  });

  it.each(PROTEGIDOS)('%s rechaza sin token', async (ruta) => {
    const respuesta = await http.get(ruta).expect(401);

    expect(respuesta.body.code).toBe('HTTP_401');
  });

  it.each(PROTEGIDOS)('%s rechaza un token con firma invalida', async (ruta) => {
    await http.get(ruta).set('Authorization', 'Bearer token.falso.inventado').expect(401);
  });

  it('el endpoint publico responde sin token', async () => {
    await http.get('/api/v1/publico/contenedores/cercanos?lat=-34.6&lng=-58.4').expect(200);
  });

  it('el health responde sin token', async () => {
    await http.get('/api/v1/health').expect(200);
  });

  it('un CHOFER no puede administrar zonas', async () => {
    const respuesta = await http
      .get('/api/v1/zonas')
      .set('Authorization', `Bearer ${ctx.token(Rol.CHOFER)}`)
      .expect(403);

    expect(respuesta.body.message).toContain('ADMINISTRADOR');
  });

  it('un OPERADOR puede leer zonas pero no crearlas', async () => {
    const operador = ctx.token(Rol.OPERADOR);

    await http.get('/api/v1/zonas').set('Authorization', `Bearer ${operador}`).expect(200);
    await http
      .post('/api/v1/zonas')
      .set('Authorization', `Bearer ${operador}`)
      .send({ nombre: 'X', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(403);
  });

  describe('un chofer no puede leer la ruta de otro', () => {
    /** Deja una ruta asignada a un chofer y devuelve su id. */
    const rutaDeOtroChofer = async () => {
      const admin = ctx.token(Rol.ADMINISTRADOR);
      const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

      const zona = await http
        .post('/api/v1/zonas')
        .set(auth(admin))
        .send({ nombre: `Zona ${Date.now()}`, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
        .expect(201);

      const contenedor = await http
        .post('/api/v1/contenedores')
        .set(auth(admin))
        .send({
          zonaId: zona.body.id,
          tipoResiduo: TipoResiduo.RECICLABLE,
          capacidadLitros: 1100,
          lat: -34.6057,
          lng: -58.3816,
        })
        .expect(201);

      const sensor = await http
        .post(`/api/v1/contenedores/${contenedor.body.id}/sensor`)
        .set(auth(admin))
        .send({})
        .expect(201);

      await http
        .post('/api/v1/lecturas')
        .set('X-Sensor-Key', sensor.body.apiKey)
        .send({ nivelLlenadoPct: 88, temperaturaC: 21, bateriaPct: 90 })
        .expect(202);

      const camion = await http
        .post('/api/v1/camiones')
        .set(auth(admin))
        .send({
          patente: `ZZ${Date.now().toString().slice(-5)}`,
          capacidadLitros: 12_000,
          tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
        })
        .expect(201);

      const ruta = await http
        .post('/api/v1/rutas/generar')
        .set(auth(admin))
        .send({ camionId: camion.body.id })
        .expect(201);

      await http
        .patch(`/api/v1/rutas/${ruta.body.id}/asignar`)
        .set(auth(admin))
        .send({ choferId: 'U000001' })
        .expect(200);

      return ruta.body.id;
    };

    it('GET /rutas/:id no acepta rol CHOFER', async () => {
      // El endpoint devuelve cualquier ruta por id y no verifica de quien es.
      // Con el rol habilitado, un chofer que conociera el id leia la ruta de
      // otro: camion, paradas y ubicaciones. El chofer tiene /rutas/mias, que
      // resuelve la identidad desde el token y no acepta id por parametro.
      const rutaAjena = await rutaDeOtroChofer();
      const otroChofer = ctx.token(Rol.CHOFER, 'U000999');

      await http
        .get(`/api/v1/rutas/${rutaAjena}`)
        .set('Authorization', `Bearer ${otroChofer}`)
        .expect(403);
    });

    it('el operador si puede ver el detalle de cualquier ruta', async () => {
      // La contracara: cerrar la puerta del chofer no puede romper la pantalla
      // de detalle del operador, que es la que usa este endpoint.
      const rutaAjena = await rutaDeOtroChofer();

      await http
        .get(`/api/v1/rutas/${rutaAjena}`)
        .set('Authorization', `Bearer ${ctx.token(Rol.OPERADOR)}`)
        .expect(200);
    });

    it('el chofer sigue viendo la suya por /rutas/mias', async () => {
      await rutaDeOtroChofer();
      const suDueno = ctx.token(Rol.CHOFER, 'U000001');

      const respuesta = await http
        .get('/api/v1/rutas/mias')
        .set('Authorization', `Bearer ${suDueno}`)
        .expect(200);

      expect(respuesta.body.choferId).toBe('U000001');
    });
  });

  it('la ingesta de lecturas no acepta un JWT de usuario', async () => {
    // Un sensor es un dispositivo, no una persona con sesion (ADR-005).
    const respuesta = await http
      .post('/api/v1/lecturas')
      .set('Authorization', `Bearer ${ctx.token(Rol.ADMINISTRADOR)}`)
      .send({ nivelLlenadoPct: 50, temperaturaC: 21, bateriaPct: 90 })
      .expect(401);

    expect(respuesta.body.code).toBe('SENSOR_KEY_AUSENTE');
  });
});
