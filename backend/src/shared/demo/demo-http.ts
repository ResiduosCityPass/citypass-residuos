import { strict as assert } from 'node:assert';
import { planEscenarioInundacion } from './escenario-inundacion';

/** Cliente de la API pública: el preparador no necesita PostgreSQL ni JWT_SECRET. */
export interface ApiDemo {
  request<T>(metodo: string, ruta: string, datos?: unknown, sensorKey?: string): Promise<T>;
}

type Zona = { id: string; nombre: string; restriccionesInundacion: { contingenciaId: string }[] };
type Contenedor = {
  id: string;
  codigo: string;
  zonaId: string;
  nivelLlenadoPct: number;
  estado: string;
  lat: number;
  lng: number;
};
type Ruta = {
  id: string;
  camionId: string;
  choferId: string;
  estado: string;
  paradasSuspendidas: number;
  paradas: { id: string; contenedorId: string; estado: string }[];
};

export function planDemoHttp(nombre: string, patente: string) {
  const plan = planEscenarioInundacion(nombre);
  const normalizada = patente.trim().toUpperCase();
  if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(normalizada))
    throw new Error('Elegí una patente de ensayo libre con formato Mercosur, por ejemplo QA123ZZ.');
  return {
    escenario: plan.escenario,
    zonas: plan.zonas,
    contenedores: plan.contenedores.map(({ id: _id, ...c }) => c),
    camion: { patente: normalizada },
    chofer: { nombre: plan.chofer.nombre, legajo: plan.chofer.legajo },
  };
}

export interface EscenarioHttp {
  escenario: string;
  zonas: { centro: string; norte: string };
  contenedores: Contenedor[];
  camionId: string;
  choferId: string;
  rutaId: string;
  paradaId: string;
}

/** Cada alta se registra sin tokens, claves de sensor ni identidades de sesión. */
export type RegistrarAlta = (tipo: string, id: string) => void;

export async function prepararDemoHttp(
  api: ApiDemo,
  plan: ReturnType<typeof planDemoHttp>,
  registrar: RegistrarAlta,
): Promise<{ escenario: EscenarioHttp; tokenChofer: string }> {
  const sesion = await api.request<{ rol: string }>('GET', '/auth/sesion');
  assert.equal(sesion.rol, 'ADMINISTRADOR', 'La preparación requiere una cuenta administradora.');

  // Nunca se reutiliza una credencial ni se reinicia un escenario ya utilizado.
  const zonas = await api.request<Zona[]>('GET', '/zonas');
  const contenedores = await api.request<Contenedor[]>('GET', '/contenedores');
  const camiones = await api.request<{ patente: string }[]>('GET', '/camiones');
  const choferes = await api.request<{ legajo: string }[]>(
    'GET',
    '/choferes?incluirInactivos=true',
  );
  assert(
    !zonas.some((z) => Object.values(plan.zonas).some((p) => p.nombre === z.nombre)),
    'El escenario ya existe o quedó parcialmente preparado. Usá otro nombre.',
  );
  assert(
    !contenedores.some((c) => plan.contenedores.some((p) => p.codigo === c.codigo)),
    'Un código de contenedor ya existe. Usá otro nombre.',
  );
  assert(!camiones.some((c) => c.patente === plan.camion.patente), 'La patente ya existe.');
  assert(!choferes.some((c) => c.legajo === plan.chofer.legajo), 'El legajo ya existe.');

  const ids = { centro: '', norte: '' };
  for (const clave of ['centro', 'norte'] as const) {
    const zona = await api.request<Zona>('POST', '/zonas', {
      ...plan.zonas[clave],
      umbralCriticoPct: 70,
      umbralTemperaturaC: 60,
    });
    ids[clave] = zona.id;
    registrar('zona', zona.id);
  }
  const creados: Contenedor[] = [];
  for (const p of plan.contenedores) {
    const c = await api.request<Contenedor>('POST', '/contenedores', {
      codigo: p.codigo,
      zonaId: ids[p.zona],
      tipoResiduo: 'COMUN',
      capacidadLitros: 1100,
      lat: p.lat,
      lng: p.lng,
    });
    registrar('contenedor', c.id);
    const sensor = await api.request<{ sensorId: string; apiKey: string }>(
      'POST',
      `/contenedores/${c.id}/sensor`,
      {},
    );
    registrar('sensor', sensor.sensorId);
    // Son lecturas sintéticas de sensores nuevos, no cambios directos de llenado.
    await api.request(
      'POST',
      '/lecturas',
      {
        nivelLlenadoPct: p.nivelLlenadoPct,
        temperaturaC: 20,
        bateriaPct: 100,
      },
      sensor.apiKey,
    );
    const leido = await api.request<Contenedor>('GET', `/contenedores/${c.id}`);
    assert.equal(leido.nivelLlenadoPct, p.nivelLlenadoPct, 'La lectura no se aplicó.');
    // Lista explícita: ni el manifiesto ni el registro guardan secretos del sensor.
    const { id, codigo, zonaId, lat, lng, nivelLlenadoPct, estado } = leido;
    creados.push({ id, codigo, zonaId, lat, lng, nivelLlenadoPct, estado });
  }
  const camion = await api.request<{ id: string }>('POST', '/camiones', {
    patente: plan.camion.patente,
    capacidadLitros: 10000,
    tipoResiduoHabilitado: 'COMUN',
  });
  registrar('camion', camion.id);
  const chofer = await api.request<{ id: string }>('POST', '/choferes', plan.chofer);
  registrar('chofer', chofer.id);
  const propuesta = await api.request<Ruta>('POST', '/rutas/generar', {
    camionId: camion.id,
    zonaId: ids.centro,
  });
  registrar('ruta', propuesta.id);
  assert.equal(
    propuesta.paradas.map((p) => p.contenedorId).join(','),
    creados[0].id,
    'La ruta inicial debe contener únicamente el crítico del escenario.',
  );
  await api.request('PATCH', `/rutas/${propuesta.id}/asignar`, { choferId: chofer.id });
  const credencial = await api.request<{ token: string }>(
    'POST',
    `/choferes/${chofer.id}/credencial`,
  );
  assert(credencial.token, 'No se recibió la credencial del chofer.');
  return {
    escenario: {
      escenario: plan.escenario,
      zonas: ids,
      contenedores: creados,
      camionId: camion.id,
      choferId: chofer.id,
      rutaId: propuesta.id,
      paradaId: propuesta.paradas[0].id,
    },
    tokenChofer: credencial.token,
  };
}

export const ETAPAS_DEMO = [
  'preparada',
  'suspendida',
  'finalizada',
  'habilitada',
  'primer-vaciado',
  'recuperada',
] as const;
export type EtapaDemo = (typeof ETAPAS_DEMO)[number];

/** Solo GET. No dispara clima, no habilita recuperación ni confirma vaciados. */
export async function verificarDemoHttp(
  api: ApiDemo,
  e: EscenarioHttp,
  etapa: EtapaDemo,
  alertaId?: string,
) {
  assert(ETAPAS_DEMO.includes(etapa), 'Etapa no reconocida.');
  assert.equal(e.contenedores.length, 3, 'El manifiesto debe contener tres contenedores.');
  const niveles =
    etapa === 'recuperada' ? [0, 0, 85] : etapa === 'primer-vaciado' ? [0, 30, 85] : [90, 30, 85];
  for (const [i, original] of e.contenedores.entries()) {
    const c = await api.request<Contenedor>('GET', `/contenedores/${original.id}`);
    assert.equal(c.codigo, original.codigo, 'El contenedor fue reasignado.');
    assert.equal(c.zonaId, original.zonaId, 'El contenedor cambió de zona.');
    assert.equal(c.nivelLlenadoPct, niveles[i], `Llenado inesperado: ${c.codigo}`);
    assert.equal(
      c.estado,
      niveles[i] >= 70 ? 'CRITICO' : 'NORMAL',
      `Estado inesperado: ${c.codigo}`,
    );
  }
  const ruta = await api.request<Ruta>('GET', `/rutas/${e.rutaId}`);
  assert.equal(ruta.camionId, e.camionId, 'La ruta cambió de camión.');
  assert.equal(ruta.choferId, e.choferId, 'La ruta cambió de chofer.');
  assert.equal(ruta.paradas.length, 1, 'La ruta inicial cambió de paradas.');
  assert.equal(ruta.paradas[0].id, e.paradaId);
  assert.equal(ruta.paradas[0].contenedorId, e.contenedores[0].id);
  const vaciado = etapa === 'primer-vaciado' || etapa === 'recuperada';
  assert.equal(ruta.paradas[0].estado, vaciado ? 'CONFIRMADA' : 'PENDIENTE');
  assert.equal(ruta.estado, vaciado ? 'COMPLETADA' : 'ASIGNADA');
  const suspendida = etapa === 'suspendida' || etapa === 'finalizada';
  assert.equal(ruta.paradasSuspendidas, suspendida ? 1 : 0);
  const centro = await api.request<Zona>('GET', `/zonas/${e.zonas.centro}`);
  const norte = await api.request<Zona>('GET', `/zonas/${e.zonas.norte}`);
  assert.equal(norte.restriccionesInundacion.length, 0, 'El control recibió una restricción.');
  assert.equal(centro.restriccionesInundacion.length, suspendida ? 1 : 0);
  if (etapa === 'preparada') return { etapa, verificada: true, escenario: e.escenario };
  assert(alertaId, 'Indicá el alertaId real de Espacios Públicos.');
  const inbox = await api.request<{
    alertas: {
      alertaId: string;
      origen: string;
      decision: string;
      contingenciaId: string;
      finalizacion: unknown;
    }[];
  }>('GET', '/contingencias/clima');
  const alerta = inbox.alertas.find((a) => a.alertaId === alertaId);
  assert(alerta, 'La alerta no llegó a Residuos.');
  assert.equal(alerta.origen, 'eda', 'La alerta no provino del bus real de Espacios.');
  assert.equal(alerta.decision, 'SUSPENDER');
  assert.equal(!!alerta.finalizacion, etapa !== 'suspendida');
  const c = await api.request<{
    alertaId: string;
    estado: string;
    zonas: { zonaId: string }[];
    contenedores: { contenedorId: string; vaciadoEn: string | null }[];
  }>('GET', `/contingencias/${alerta.contingenciaId}`);
  assert.equal(c.alertaId, alertaId);
  assert.equal(c.zonas.map((z) => z.zonaId).join(','), e.zonas.centro);
  const esperado =
    etapa === 'suspendida'
      ? 'ACTIVA'
      : etapa === 'finalizada'
        ? 'PENDIENTE_RECUPERACION'
        : etapa === 'recuperada'
          ? 'RECUPERADA'
          : 'EN_RECUPERACION';
  assert.equal(c.estado, esperado, 'Estado de contingencia inesperado.');
  assert.equal(
    c.contenedores
      .map((p) => p.contenedorId)
      .sort((a, b) => a.localeCompare(b))
      .join(','),
    e.contenedores
      .slice(0, 2)
      .map((p) => p.id)
      .sort((a, b) => a.localeCompare(b))
      .join(','),
    'Debe incluir también el contenedor no crítico, sin incluir al control.',
  );
  for (const [i, cont] of e.contenedores.slice(0, 2).entries()) {
    const impacto = c.contenedores.find((p) => p.contenedorId === cont.id)!;
    assert.equal(
      !!impacto.vaciadoEn,
      etapa === 'recuperada' || (etapa === 'primer-vaciado' && i === 0),
      'Recuperación sin evidencia del vaciado esperado.',
    );
  }
  if (suspendida)
    assert.equal(centro.restriccionesInundacion[0].contingenciaId, alerta.contingenciaId);
  if (etapa === 'recuperada') {
    const rutas = await api.request<{ id: string; camionId: string }[]>('GET', '/rutas');
    let segundaConfirmada = false;
    for (const r of rutas.filter((r) => r.camionId === e.camionId && r.id !== e.rutaId)) {
      const detalle = await api.request<Ruta>('GET', `/rutas/${r.id}`);
      if (
        detalle.choferId === e.choferId &&
        detalle.estado === 'COMPLETADA' &&
        detalle.paradas.length === 1 &&
        detalle.paradas[0].contenedorId === e.contenedores[1].id &&
        detalle.paradas[0].estado === 'CONFIRMADA'
      )
        segundaConfirmada = true;
    }
    assert(segundaConfirmada, 'Falta la segunda ruta completada con vaciado confirmado del 30 %.');
  }
  return {
    etapa,
    verificada: true,
    escenario: e.escenario,
    alertaId,
    contingenciaId: alerta.contingenciaId,
  };
}
