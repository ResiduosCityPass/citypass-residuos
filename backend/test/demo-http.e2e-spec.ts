import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { AppDePrueba, crearAppDePrueba } from './helpers/app-de-prueba';
import { ClienteDemoHttp } from '../src/shared/demo/cliente-demo-http';
import { planDemoHttp, prepararDemoHttp, verificarDemoHttp } from '../src/shared/demo/demo-http';
import { RecepcionEdaService } from '../src/modules/contingencias/application/recepcion-eda.service';
import {
  CRITICIDAD_CONFIRMADA,
  CRITICIDAD_FINALIZADA,
} from '../src/modules/contingencias/application/dto/criticidad-climatica.dto';
import { Rol } from '../src/shared/domain/enums';
import { EventTypes } from '../src/shared/domain/domain-event';

describe('Ensayo operativo HTTP sobre PostgreSQL migrado (sin bus externo)', () => {
  let ctx: AppDePrueba;
  beforeAll(async () => {
    ctx = await crearAppDePrueba();
  });
  beforeEach(async () => ctx.limpiar());
  afterAll(async () => ctx.cerrar());

  it('prepara con las APIs reales y verifica suspensión, ambos vaciados y control intacto', async () => {
    const url = (await ctx.app.getUrl()) + '/api/v1';
    const admin = new ClienteDemoHttp(url, ctx.token());
    const operador = new ClienteDemoHttp(url, ctx.token(Rol.OPERADOR));
    const altas: { tipo: string; id: string }[] = [];
    const { escenario: e, tokenChofer } = await prepararDemoHttp(
      admin,
      planDemoHttp('HTTP01', 'QA123ZZ'),
      (tipo, id) => altas.push({ tipo, id }),
    );
    expect(altas.filter((a) => a.tipo === 'sensor')).toHaveLength(3);
    expect(JSON.stringify(e)).not.toMatch(/apiKey|usuarioSub|token/);
    const chofer = new ClienteDemoHttp(url, tokenChofer);
    await verificarDemoHttp(operador, e, 'preparada');
    // Repetir nunca rota la credencial existente ni repone llenados.
    await expect(
      prepararDemoHttp(admin, planDemoHttp('HTTP01', 'QA123ZZ'), jest.fn()),
    ).rejects.toThrow('ya existe');

    const alertaId = randomUUID();
    const inicio = {
      alertaId,
      nivelCriticidad: 'ALTA',
      fenomeno: 'LLUVIA_INTENSA',
      ubicaciones: [{ latitud: -34.6037, longitud: -58.3816 }],
      barrios: ['SAN NICOLAS'],
      vigenciaDesde: Date.now() - 1000,
      vigenciaHasta: Date.now() + 3600000,
      actorSub: 'actor-espacios',
      temperaturaMinC: null,
      temperaturaMaxC: null,
    };
    const recibir = (tipo: string, data: unknown) =>
      ctx.app.get(RecepcionEdaService).procesar(tipo, tipo, 28, {
        data,
        metadata: {
          eventId: randomUUID(),
          eventType: tipo,
          schemaId: 28,
          receivedAt: Date.now(),
          payloadHash: 'a'.repeat(64),
          source: 'espacios-service',
        },
      });
    await recibir(CRITICIDAD_CONFIRMADA, inicio);
    await verificarDemoHttp(operador, e, 'preparada'); // recibir no suspende por sí solo
    const decision = await operador.request<{ contingenciaId: string }>(
      'PATCH',
      `/contingencias/clima/${alertaId}/resolver`,
      {
        accion: 'SUSPENDER',
        zonaIds: [e.zonas.centro],
        motivo: 'SIMULACRO local: inundación que impide recolectar en la zona de ensayo.',
      },
    );
    await verificarDemoHttp(operador, e, 'suspendida', alertaId);
    const vaciar = (id: string, c: { lat: number; lng: number }) =>
      chofer.request('PATCH', `/paradas/${id}/confirmar`, { lat: c.lat, lng: c.lng });
    await expect(vaciar(e.paradaId, e.contenedores[0])).rejects.toThrow('HTTP 409');
    await expect(
      operador.request('PATCH', `/contingencias/${decision.contingenciaId}/recuperar`),
    ).rejects.toThrow('HTTP 409');
    await recibir(CRITICIDAD_FINALIZADA, {
      alertaId,
      actorSub: 'actor-espacios',
      finalizadaEn: Date.now(),
    });
    await verificarDemoHttp(operador, e, 'finalizada', alertaId);
    await expect(vaciar(e.paradaId, e.contenedores[0])).rejects.toThrow('HTTP 409');
    await operador.request('PATCH', `/contingencias/${decision.contingenciaId}/recuperar`);
    await verificarDemoHttp(operador, e, 'habilitada', alertaId);
    // El GPS de la API recibe coordenadas sintéticas de los propios fixtures.
    await expect(
      chofer.request('PATCH', `/paradas/${e.paradaId}/confirmar`, { lat: 0, lng: 0 }),
    ).rejects.toThrow('HTTP 403');
    await vaciar(e.paradaId, e.contenedores[0]);
    await verificarDemoHttp(operador, e, 'primer-vaciado', alertaId);
    const segunda = await operador.request<{
      id: string;
      paradas: { id: string; contenedorId: string }[];
    }>('POST', '/rutas/generar', { camionId: e.camionId, zonaId: e.zonas.centro });
    expect(segunda.paradas.map((p) => p.contenedorId)).toEqual([e.contenedores[1].id]);
    await operador.request('PATCH', `/rutas/${segunda.id}/asignar`, { choferId: e.choferId });
    await vaciar(segunda.paradas[0].id, e.contenedores[1]);
    await verificarDemoHttp(operador, e, 'recuperada', alertaId);
    const outbox = await ctx.dataSource.query(
      `SELECT "eventType" FROM evento_pendiente WHERE sobre->'payload'->>'alertaId' = $1`,
      [alertaId],
    );
    expect(outbox.map((r: { eventType: string }) => r.eventType).sort()).toEqual(
      [
        EventTypes.SERVICIO_AFECTADO,
        EventTypes.RECUPERACION_PENDIENTE,
        EventTypes.RECUPERACION_HABILITADA,
        EventTypes.SERVICIO_RESTABLECIDO,
      ].sort(),
    );
  });

  it('el CLI guarda archivos privados, no imprime tokens y no pisa un escenario anterior', async () => {
    const temporal = mkdtempSync(join(tmpdir(), 'residuos-http-test-'));
    const tokenFile = join(temporal, 'admin.jwt');
    const salida = join(temporal, '.demo', 'http', 'CLI01');
    const url = (await ctx.app.getUrl()) + '/api/v1';
    writeFileSync(tokenFile, ctx.token(), { mode: 0o600 });
    const preparar = [
      'preparar',
      '--escenario',
      'CLI01',
      '--patente',
      'QA124ZZ',
      '--api',
      url,
      '--apply',
    ];
    const ejecutar = (argumentos = preparar) =>
      promisify(execFile)(
        process.execPath,
        [
          '-r',
          require.resolve('ts-node/register'),
          resolve('src/scripts/demo-http.ts'),
          ...argumentos,
        ],
        {
          cwd: temporal,
          env: {
            ...process.env,
            TS_NODE_PROJECT: resolve('tsconfig.json'),
            DEMO_TOKEN_FILE: tokenFile,
            ENV_FILE: join(temporal, 'sin-configuracion.local'),
          },
        },
      );
    try {
      const { stdout, stderr } = await ejecutar();
      expect(stderr).toBe('');
      const token = readFileSync(join(salida, 'chofer.jwt'), 'utf8').trim();
      const manifiesto = JSON.parse(readFileSync(join(salida, 'escenario.json'), 'utf8'));
      expect(stdout).not.toContain(token);
      expect(stdout).not.toContain(readFileSync(tokenFile, 'utf8'));
      for (const archivo of ['chofer.jwt', 'escenario.json', 'registro.json'])
        expect(statSync(join(salida, archivo)).mode & 0o777).toBe(0o600);
      expect(statSync(salida).mode & 0o777).toBe(0o700);
      expect(readFileSync(join(salida, 'registro.json'), 'utf8')).not.toContain(token);
      await expect(ejecutar()).rejects.toThrow();
      expect(readFileSync(join(salida, 'chofer.jwt'), 'utf8').trim()).toBe(token);
      const api = new ClienteDemoHttp(url, ctx.token(Rol.OPERADOR));
      await verificarDemoHttp(api, manifiesto.escenario, 'preparada');
      const propia = await new ClienteDemoHttp(url, token).request<{ id: string }>(
        'GET',
        '/rutas/mias',
      );
      expect(propia.id).toBe(manifiesto.escenario.rutaId);
      const verificar = ['verificar', '--escenario', 'CLI01', '--api', url, '--etapa', 'preparada'];
      await expect(ejecutar(verificar)).resolves.toMatchObject({ stderr: '' });
      await expect(
        ejecutar(['verificar', '--escenario', '../CLI01', '--api', url, '--etapa', 'preparada']),
      ).rejects.toThrow('1 a 10 letras');
      const archivo = join(salida, 'escenario.json');
      renameSync(archivo, archivo + '.respaldo');
      symlinkSync(tokenFile, archivo);
      await expect(ejecutar(verificar)).rejects.toThrow('ELOOP');
      unlinkSync(archivo);
      renameSync(archivo + '.respaldo', archivo);
      renameSync(salida, salida + '.respaldo');
      symlinkSync(salida + '.respaldo', salida, 'dir');
      await expect(ejecutar(verificar)).rejects.toThrow('sin enlaces simbólicos');
    } finally {
      rmSync(temporal, { recursive: true, force: true });
    }
  });
});
