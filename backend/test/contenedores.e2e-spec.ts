import * as request from 'supertest';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * CU-01 — Contenedores, contra PostgreSQL real.
 *
 * Cubre lo que ningun otro e2e ejercita: cambiar la zona de un contenedor ya
 * existente. Los demas specs solo crean contenedores con zona, nunca la
 * reasignan.
 */
describe('Contenedores (e2e)', () => {
  let ctx: AppDePrueba;
  let http: ReturnType<typeof request>;
  let admin: string;

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    http = request(ctx.app.getHttpServer());
    admin = ctx.token(Rol.ADMINISTRADOR);
  });

  afterAll(() => ctx.cerrar());
  beforeEach(() => ctx.limpiar());

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('PATCH /contenedores/:id persiste el cambio de zona, columna y relacion', async () => {
    const zonaOrigen = await http
      .post('/api/v1/zonas')
      .set(auth(admin))
      .send({ nombre: 'Zona origen', umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const zonaDestino = await http
      .post('/api/v1/zonas')
      .set(auth(admin))
      .send({ nombre: 'Zona destino', umbralCriticoPct: 80, umbralTemperaturaC: 60 })
      .expect(201);

    const contenedor = await http
      .post('/api/v1/contenedores')
      .set(auth(admin))
      .send({
        zonaId: zonaOrigen.body.id,
        tipoResiduo: TipoResiduo.RECICLABLE,
        capacidadLitros: 1100,
        lat: -34.6037,
        lng: -58.3816,
      })
      .expect(201);

    const actualizado = await http
      .patch(`/api/v1/contenedores/${contenedor.body.id}`)
      .set(auth(admin))
      .send({ zonaId: zonaDestino.body.id })
      .expect(200);

    // La columna y la relacion cargada tienen que coincidir en la misma
    // respuesta: si TypeORM prioriza una relacion vieja sobre la columna al
    // guardar, quedan desincronizadas aunque el request de 200.
    expect(actualizado.body.zonaId).toBe(zonaDestino.body.id);
    expect(actualizado.body.zona.id).toBe(zonaDestino.body.id);

    const releido = await http
      .get(`/api/v1/contenedores/${contenedor.body.id}`)
      .set(auth(admin))
      .expect(200);

    expect(releido.body.zonaId).toBe(zonaDestino.body.id);
  });
});
