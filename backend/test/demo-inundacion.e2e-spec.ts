import * as request from 'supertest';
import { crearAppDePrueba, AppDePrueba } from './helpers/app-de-prueba';
import {
  credencialChoferDemo,
  planEscenarioInundacion,
  prepararEscenarioInundacion,
} from '../src/shared/demo/escenario-inundacion';
import { Zona } from '../src/modules/zonas/domain/zona.entity';
import { Contenedor } from '../src/modules/contenedores/domain/contenedor.entity';
import { Camion } from '../src/modules/flota/domain/camion.entity';
import { Ruta } from '../src/modules/rutas/domain/ruta.entity';
import { Parada } from '../src/modules/rutas/domain/parada.entity';
import { Chofer } from '../src/modules/choferes/domain/chofer.entity';
import { randomUUID } from 'crypto';
import { RecepcionEdaService } from '../src/modules/contingencias/application/recepcion-eda.service';
import { CRITICIDAD_CONFIRMADA } from '../src/modules/contingencias/application/dto/criticidad-climatica.dto';
import {
  EstadoCamion,
  EstadoContenedor,
  EstadoParada,
  EstadoRuta,
  TipoResiduo,
} from '../src/shared/domain/enums';

describe('Preparacion de demo en PostgreSQL migrado (e2e)', () => {
  let ctx: AppDePrueba;
  beforeAll(async () => {
    ctx = await crearAppDePrueba();
  });
  beforeEach(async () => ctx.limpiar());
  afterAll(async () => ctx.cerrar());

  it('crea una ruta utilizable por el chofer sin inventar eventos de negocio', async () => {
    const resultado = await prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01');
    expect(resultado.creado).toBe(true);
    expect(resultado.contenedores.map((c) => c.nivelLlenadoPct)).toEqual([90, 30, 85]);
    expect(resultado.zonas).toHaveLength(2);
    expect(resultado.ruta).toMatchObject({ estado: 'ASIGNADA', estadoParada: 'PENDIENTE' });
    expect(resultado.camion.estado).toBe('EN_RUTA');
    expect(resultado.chofer).not.toHaveProperty('usuarioSub');
    const token = await credencialChoferDemo(ctx.dataSource, 'CLIMA01', process.env);
    const respuesta = await request(ctx.app.getHttpServer())
      .get('/api/v1/rutas/mias')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(respuesta.body.id).toBe(resultado.ruta.id);
    expect(respuesta.body.paradas).toHaveLength(1);
    expect(respuesta.body.paradas[0].contenedorId).toBe(resultado.contenedores[0].id);
    expect(
      await ctx.dataSource.query('SELECT count(*)::int AS cantidad FROM evento_pendiente'),
    ).toEqual([{ cantidad: 0 }]);
  });

  it('permite resolver una alerta EDA sobre la zona de demo y suspende su ruta', async () => {
    const escenario = await prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01');
    const alertaId = randomUUID();
    await ctx.app
      .get(RecepcionEdaService)
      .procesar(CRITICIDAD_CONFIRMADA, CRITICIDAD_CONFIRMADA, 28, {
        data: {
          alertaId,
          nivelCriticidad: 'ALTA',
          fenomeno: 'LLUVIA_INTENSA',
          ubicaciones: [{ latitud: -34.6037, longitud: -58.3816 }],
          barrios: ['SAN NICOLAS'],
          vigenciaDesde: Date.now(),
          vigenciaHasta: Date.now() + 3600000,
          actorSub: 'actor-espacios',
        },
        metadata: {
          eventId: randomUUID(),
          eventType: CRITICIDAD_CONFIRMADA,
          schemaId: 28,
          receivedAt: Date.now(),
          payloadHash: 'a'.repeat(64),
          source: 'espacios-service',
        },
      });
    const zonaId = escenario.zonas.find((z) => z.nombre.endsWith(' Centro'))!.id;
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/contingencias/clima/${alertaId}/resolver`)
      .set('Authorization', `Bearer ${ctx.token()}`)
      .send({
        accion: 'SUSPENDER',
        zonaIds: [zonaId],
        motivo: 'SIMULACRO: inundacion confirmada sobre la zona de demo.',
      })
      .expect(200);
    const token = await credencialChoferDemo(ctx.dataSource, 'CLIMA01', process.env);
    const ruta = await request(ctx.app.getHttpServer())
      .get('/api/v1/rutas/mias')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ruta.body.paradasSuspendidas).toBe(1);
    await request(ctx.app.getHttpServer())
      .patch(`/api/v1/paradas/${escenario.ruta.paradaId}/confirmar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: -34.6037, lng: -58.3816 })
      .expect(409);
    const repetido = await prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01');
    expect(repetido.creado).toBe(false);
    expect(repetido.contenedores.map((c) => c.nivelLlenadoPct)).toEqual([90, 30, 85]);
  });

  it('dos preparaciones concurrentes crean una sola copia del escenario', async () => {
    const resultados = await Promise.all([
      prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01'),
      prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01'),
    ]);
    expect(resultados.map((r) => r.creado).sort()).toEqual([false, true]);
    expect(resultados[0].ruta.id).toBe(resultados[1].ruta.id);
    expect(await ctx.dataSource.manager.count(Ruta)).toBe(1);
    expect(await ctx.dataSource.manager.count(Parada)).toBe(1);
    expect(await ctx.dataSource.manager.count(Contenedor)).toBe(3);
  });

  it('al repetir conserva vaciados, rutas completadas, sub y bloqueos; un nombre nuevo crea otro ensayo', async () => {
    const inicial = await prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01');
    const plan = planEscenarioInundacion('CLIMA01');
    const antes = await ctx.dataSource.manager.findOneByOrFail(Chofer, { id: plan.chofer.id });
    await ctx.dataSource.manager.update(Contenedor, plan.contenedores[0].id, {
      nivelLlenadoPct: 0,
      estado: EstadoContenedor.NORMAL,
    });
    await ctx.dataSource.manager.update(Ruta, plan.rutaId, {
      estado: EstadoRuta.COMPLETADA,
      completadaEn: new Date(),
    });
    await ctx.dataSource.manager.update(Parada, plan.paradaId, {
      estado: EstadoParada.CONFIRMADA,
      confirmadaEn: new Date(),
    });
    await ctx.dataSource.manager.update(Camion, plan.camion.id, {
      estado: EstadoCamion.DISPONIBLE,
    });
    const centroId = inicial.zonas.find((z) => z.nombre === plan.zonas.centro.nombre)!.id;
    await ctx.dataSource.manager.update(Zona, centroId, { bloqueada: true });
    const repetido = await prepararEscenarioInundacion(ctx.dataSource, 'clima01');
    expect(repetido.creado).toBe(false);
    expect(repetido.ruta.id).toBe(inicial.ruta.id);
    expect(repetido.ruta.estado).toBe('COMPLETADA');
    expect(repetido.ruta.estadoParada).toBe('CONFIRMADA');
    expect(repetido.contenedores[0].nivelLlenadoPct).toBe(0);
    expect(repetido.camion.estado).toBe('DISPONIBLE');
    expect(repetido.zonas.find((z) => z.id === centroId)!.bloqueada).toBe(true);
    expect(
      (await ctx.dataSource.manager.findOneByOrFail(Chofer, { id: plan.chofer.id })).usuarioSub,
    ).toBe(antes.usuarioSub);
    const nuevo = await prepararEscenarioInundacion(ctx.dataSource, 'CLIMA02');
    expect(nuevo.creado).toBe(true);
    expect(nuevo.contenedores[0].nivelLlenadoPct).toBe(90);
    expect(await ctx.dataSource.manager.count(Contenedor)).toBe(6);
  });

  it('revierte todo si hay una colision con un codigo ajeno', async () => {
    const zona = await ctx.dataSource.manager.save(Zona, {
      nombre: 'Zona ajena',
      umbralCriticoPct: 70,
      umbralTemperaturaC: 60,
    });
    const codigo = planEscenarioInundacion('CLIMA01').contenedores[0].codigo;
    const ajeno = await ctx.dataSource.manager.save(Contenedor, {
      codigo,
      zonaId: zona.id,
      tipoResiduo: TipoResiduo.COMUN,
      capacidadLitros: 1100,
      lat: -34.6,
      lng: -58.4,
      nivelLlenadoPct: 55,
    });
    await expect(prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01')).rejects.toThrow();
    expect(await ctx.dataSource.manager.count(Zona)).toBe(1);
    expect(await ctx.dataSource.manager.count(Ruta)).toBe(0);
    expect(
      (await ctx.dataSource.manager.findOneByOrFail(Contenedor, { id: ajeno.id })).nivelLlenadoPct,
    ).toBe(55);
  });

  it('no reconstruye un escenario parcialmente borrado ni acepta una parada reasignada', async () => {
    const plan = planEscenarioInundacion('CLIMA01');
    await prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01');
    await ctx.dataSource.manager.update(Parada, plan.paradaId, {
      contenedorId: plan.contenedores[1].id,
    });
    await expect(prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01')).rejects.toThrow(
      'reasignados',
    );
    await ctx.dataSource.manager.delete(Parada, plan.paradaId);
    await expect(prepararEscenarioInundacion(ctx.dataSource, 'CLIMA01')).rejects.toThrow(
      'incompleto',
    );
    expect(await ctx.dataSource.manager.count(Parada)).toBe(0);
  });
});
