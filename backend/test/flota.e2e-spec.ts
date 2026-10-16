import * as request from 'supertest';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/** CU-03 — Flota, contra PostgreSQL real. */
describe('Flota (e2e)', () => {
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

  it('rechaza una patente que no tiene forma de patente Mercosur', async () => {
    const respuesta = await http
      .post('/api/v1/camiones')
      .set(auth(admin))
      .send({
        patente: 'PATENTE1',
        capacidadLitros: 12000,
        tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
      })
      .expect(400);

    expect(respuesta.body.message.join(' ')).toMatch(/patente/);
  });

  it('acepta el formato Mercosur aunque venga en minusculas y con espacios', async () => {
    await http
      .post('/api/v1/camiones')
      .set(auth(admin))
      .send({
        patente: 'ab 123 cd',
        capacidadLitros: 12000,
        tipoResiduoHabilitado: TipoResiduo.RECICLABLE,
      })
      .expect(201)
      .expect((res) => {
        if (res.body.patente !== 'AB123CD') {
          throw new Error(`patente no normalizada: ${res.body.patente}`);
        }
      });
  });
});
