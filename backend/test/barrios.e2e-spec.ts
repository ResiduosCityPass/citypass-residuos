import * as request from 'supertest';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';
import { Rol } from '../src/shared/domain/enums';

describe('Barrios de zonas persistidos (e2e)', () => {
  let ctx: AppDePrueba;
  beforeAll(async () => {
    ctx = await crearAppDePrueba();
  });
  afterAll(async () => {
    await ctx.cerrar();
  });
  beforeEach(async () => {
    await ctx.limpiar();
  });
  const values = { nombre: 'Zona de prueba', umbralCriticoPct: 70, umbralTemperaturaC: 60 };
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token()}` });
  it('mantiene compatibilidad con zonas sin vínculos y persiste su edición sin modificar restricciones', async () => {
    const created = await http().post('/api/v1/zonas').set(auth()).send(values).expect(201);
    expect(created.body.barrioIds).toEqual([]);
    const id = created.body.id;
    await http().patch(`/api/v1/zonas/${id}/bloqueo?bloqueada=true`).set(auth()).expect(200);
    await http()
      .patch(`/api/v1/zonas/${id}`)
      .set(auth())
      .send({ barrioIds: ['AR-CABA-SAN-NICOLAS', 'AR-CABA-RETIRO'] })
      .expect(200);
    await http()
      .patch(`/api/v1/zonas/${id}`)
      .set(auth())
      .send({ umbralCriticoPct: 85 })
      .expect(200);
    const read = await http().get(`/api/v1/zonas/${id}`).set(auth()).expect(200);
    expect(read.body).toMatchObject({
      id,
      nombre: values.nombre,
      umbralCriticoPct: 85,
      bloqueada: true,
      bloqueoManual: true,
      barrioIds: ['AR-CABA-SAN-NICOLAS', 'AR-CABA-RETIRO'],
    });
    await http().patch(`/api/v1/zonas/${id}`).set(auth()).send({ barrioIds: [] }).expect(200);
    const cleared = await http().get(`/api/v1/zonas/${id}`).set(auth()).expect(200);
    expect(cleared.body.barrioIds).toEqual([]);
  });
  it('protege catálogo y vínculos con los roles existentes y rechaza códigos no compartidos', async () => {
    await http().get('/api/v1/barrios').expect(401);
    await http()
      .get('/api/v1/barrios')
      .set('Authorization', `Bearer ${ctx.token(Rol.CHOFER)}`)
      .expect(403);
    for (const role of [Rol.OPERADOR, Rol.ADMINISTRADOR]) {
      const catalog = await http()
        .get('/api/v1/barrios')
        .set('Authorization', `Bearer ${ctx.token(role)}`)
        .expect(200);
      expect(catalog.body).toHaveLength(48);
    }
    await http()
      .post('/api/v1/zonas')
      .set('Authorization', `Bearer ${ctx.token(Rol.OPERADOR)}`)
      .send({ ...values, barrioIds: ['AR-CABA-PALERMO'] })
      .expect(403);
    await http()
      .post('/api/v1/zonas')
      .set(auth())
      .send({ ...values, barrioIds: ['PALERMO'] })
      .expect(400);
    const created = await http()
      .post('/api/v1/zonas')
      .set(auth())
      .send({ ...values, barrioIds: ['AR-CABA-PALERMO'] })
      .expect(201);
    await http()
      .patch(`/api/v1/zonas/${created.body.id}`)
      .set(auth())
      .send({ barrioIds: null })
      .expect(400);
    await http()
      .patch(`/api/v1/zonas/${created.body.id}`)
      .set(auth())
      .send({ barrioIds: ['AR-CABA-OTRO'] })
      .expect(400);
    await http()
      .patch(`/api/v1/zonas/${created.body.id}`)
      .set('Authorization', `Bearer ${ctx.token(Rol.OPERADOR)}`)
      .send({ barrioIds: [] })
      .expect(403);
    const [stored] = await ctx.dataSource.query('SELECT "barrioIds" FROM zona WHERE id = $1', [
      created.body.id,
    ]);
    expect(stored.barrioIds).toEqual(['AR-CABA-PALERMO']);
  });
});
