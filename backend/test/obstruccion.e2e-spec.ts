import * as request from 'supertest';
import {
  OBSTRUCCION_REPOSITORY,
  ObstruccionRepository,
} from '../src/modules/integracion/domain/integracion.repository';
import { Rol, TipoResiduo } from '../src/shared/domain/enums';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';

/**
 * CU-INT-02 — Persistencia de las obstrucciones por reclamo, contra PostgreSQL real.
 *
 * La vigencia (sin resolver y sin vencer) y el ON CONFLICT viven en SQL: un
 * doble en memoria no probaria nada de eso.
 */
describe('Obstrucciones por reclamo (e2e)', () => {
  let ctx: AppDePrueba;
  let obstrucciones: ObstruccionRepository;

  const HORA = 3_600_000;
  const ahora = new Date();
  const enUnaHora = new Date(ahora.getTime() + HORA);
  const haceUnaHora = new Date(ahora.getTime() - HORA);

  beforeAll(async () => {
    ctx = await crearAppDePrueba();
    obstrucciones = ctx.app.get(OBSTRUCCION_REPOSITORY);
  });

  afterAll(() => ctx.cerrar());
  beforeEach(() => ctx.limpiar());

  async function contenedor(): Promise<string> {
    const http = request(ctx.app.getHttpServer());
    const auth = { Authorization: `Bearer ${ctx.token(Rol.ADMINISTRADOR)}` };

    const zona = await http
      .post('/api/v1/zonas')
      .set(auth)
      .send({ nombre: `Palermo ${Date.now()}`, umbralCriticoPct: 70, umbralTemperaturaC: 60 })
      .expect(201);

    const creado = await http
      .post('/api/v1/contenedores')
      .set(auth)
      .send({
        zonaId: zona.body.id,
        tipoResiduo: TipoResiduo.COMUN,
        capacidadLitros: 1100,
        lat: -34.5811,
        lng: -58.421,
      })
      .expect(201);

    return creado.body.id;
  }

  const tapar = (reclamoId: string, contenedorId: string, venceEn = enUnaHora) =>
    obstrucciones.guardarObstrucciones([
      { reclamoId, contenedorId, distanciaMetros: 8.4, venceEn },
    ]);

  it('un contenedor tapado y sin vencer queda obstruido', async () => {
    const id = await contenedor();
    await tapar('RC-1', id);

    expect(await obstrucciones.contenedoresObstruidos(ahora)).toEqual([id]);
  });

  it('vencida, deja de contar aunque nadie la haya resuelto', async () => {
    const id = await contenedor();
    await tapar('RC-1', id, haceUnaHora);

    expect(await obstrucciones.contenedoresObstruidos(ahora)).toEqual([]);
  });

  it('resolver el reclamo lo destapa y no vuelve a cerrar lo ya cerrado', async () => {
    const id = await contenedor();
    await tapar('RC-1', id);

    expect(await obstrucciones.resolverReclamo('RC-1', ahora)).toBe(1);
    expect(await obstrucciones.contenedoresObstruidos(ahora)).toEqual([]);
    expect(await obstrucciones.resolverReclamo('RC-1', ahora)).toBe(0);
  });

  it('el mismo reclamo dos veces no duplica ni rompe la transaccion', async () => {
    const id = await contenedor();
    await tapar('RC-1', id);
    await tapar('RC-1', id);

    const filas = await ctx.dataSource.query('SELECT 1 FROM "obstruccion_por_reclamo"');
    expect(filas).toHaveLength(1);
  });

  it('un reclamo que no tapa ningun contenedor no inserta nada', async () => {
    await obstrucciones.guardarObstrucciones([]);

    expect(await obstrucciones.contenedoresObstruidos(ahora)).toEqual([]);
  });

  describe('metrica: reclamos evaluados que tapan un contenedor', () => {
    const evaluado = (reclamoId: string, afectaRecoleccion: boolean, creadoEn = ahora) =>
      ctx.dataSource.query(
        `INSERT INTO "evento_pendiente" ("eventId", "eventType", "sobre", "proximoIntentoEn", "creadoEn")
         VALUES (gen_random_uuid(), 'residuos.reclamo.evaluado', $1, now(), $2)`,
        [{ payload: { reclamoId, afectaRecoleccion } }, creadoEn],
      );

    it('cuenta reclamos distintos; si uno tiene dos decisiones, vale la primera', async () => {
      await evaluado('RC-1', true);
      await evaluado('RC-2', false);
      await evaluado('RC-3', false, haceUnaHora);
      await evaluado('RC-3', true);

      expect(await obstrucciones.resumenEvaluaciones(null)).toEqual({ evaluados: 3, afectan: 1 });
    });

    it('con desde, solo cuenta lo evaluado despues', async () => {
      await evaluado('RC-viejo', true, new Date(ahora.getTime() - 24 * HORA));
      await evaluado('RC-1', false);

      expect(await obstrucciones.resumenEvaluaciones(haceUnaHora)).toEqual({
        evaluados: 1,
        afectan: 0,
      });
    });

    it('el endpoint devuelve el porcentaje, y sin evaluaciones no inventa un 0 %', async () => {
      const http = request(ctx.app.getHttpServer());
      const auth = { Authorization: `Bearer ${ctx.token(Rol.OPERADOR)}` };

      const vacia = await http.get('/api/v1/reclamos/metrica').set(auth).expect(200);
      expect(vacia.body).toMatchObject({ evaluados: 0, porcentaje: null });

      await evaluado('RC-1', true);
      await evaluado('RC-2', false);
      const res = await http.get('/api/v1/reclamos/metrica').set(auth).expect(200);
      expect(res.body).toEqual({ desde: null, evaluados: 2, afectan: 1, porcentaje: 50 });

      await http.get('/api/v1/reclamos/metrica?desde=ayer').set(auth).expect(400);
    });
  });

  it('dos reclamos sobre el mismo contenedor: resolver uno no lo destapa', async () => {
    const id = await contenedor();
    await tapar('RC-1', id);
    await tapar('RC-2', id);

    await obstrucciones.resolverReclamo('RC-1', ahora);

    expect(await obstrucciones.contenedoresObstruidos(ahora)).toEqual([id]);
  });
});
