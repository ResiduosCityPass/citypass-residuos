import * as request from 'supertest';
import { Rol } from '../src/shared/domain/enums';
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
