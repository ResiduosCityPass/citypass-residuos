import {
  ApiDemo,
  EscenarioHttp,
  ETAPAS_DEMO,
  EtapaDemo,
  planDemoHttp,
  prepararDemoHttp,
  verificarDemoHttp,
} from './demo-http';

const escenario: EscenarioHttp = {
  escenario: 'HTTP01',
  zonas: { centro: 'centro', norte: 'norte' },
  contenedores: [90, 30, 85].map((nivelLlenadoPct, i) => ({
    id: `c${i}`,
    codigo: `DEMO-HTTP01-0${i + 1}`,
    zonaId: i === 2 ? 'norte' : 'centro',
    nivelLlenadoPct,
    lat: -34.6,
    lng: -58.4,
    estado: i === 1 ? 'NORMAL' : 'CRITICO',
  })),
  camionId: 'camion',
  choferId: 'chofer',
  rutaId: 'ruta1',
  paradaId: 'parada1',
};

function fixture(etapa: EtapaDemo) {
  const suspendida = ['suspendida', 'finalizada'].includes(etapa);
  const primerVaciado = ['primer-vaciado', 'recuperada'].includes(etapa);
  const datos: Record<string, unknown> = {
    '/zonas/centro': {
      restriccionesInundacion: suspendida ? [{ contingenciaId: 'inundacion' }] : [],
    },
    '/zonas/norte': { restriccionesInundacion: [] },
    '/rutas/ruta1': {
      id: 'ruta1',
      camionId: 'camion',
      choferId: 'chofer',
      estado: primerVaciado ? 'COMPLETADA' : 'ASIGNADA',
      paradasSuspendidas: suspendida ? 1 : 0,
      paradas: [
        { id: 'parada1', contenedorId: 'c0', estado: primerVaciado ? 'CONFIRMADA' : 'PENDIENTE' },
      ],
    },
    '/rutas': [
      { id: 'ruta1', camionId: 'camion' },
      { id: 'ruta2', camionId: 'camion' },
    ],
    '/rutas/ruta2': {
      choferId: 'chofer',
      estado: 'COMPLETADA',
      paradas: [{ contenedorId: 'c1', estado: 'CONFIRMADA' }],
    },
    '/contingencias/clima': {
      alertas: [
        {
          alertaId: 'alerta',
          origen: 'eda',
          decision: 'SUSPENDER',
          contingenciaId: 'inundacion',
          finalizacion: etapa === 'suspendida' ? null : {},
        },
      ],
    },
    '/contingencias/inundacion': {
      alertaId: 'alerta',
      estado:
        etapa === 'suspendida'
          ? 'ACTIVA'
          : etapa === 'finalizada'
            ? 'PENDIENTE_RECUPERACION'
            : etapa === 'recuperada'
              ? 'RECUPERADA'
              : 'EN_RECUPERACION',
      zonas: [{ zonaId: 'centro' }],
      contenedores: [0, 1].map((i) => ({
        contenedorId: `c${i}`,
        vaciadoEn: etapa === 'recuperada' || (primerVaciado && i === 0) ? 'fecha' : null,
      })),
    },
  };
  for (const [i, c] of escenario.contenedores.entries()) {
    const nivel =
      (i === 0 && primerVaciado) || (i === 1 && etapa === 'recuperada') ? 0 : c.nivelLlenadoPct;
    datos[`/contenedores/${c.id}`] = {
      ...c,
      nivelLlenadoPct: nivel,
      estado: nivel >= 70 ? 'CRITICO' : 'NORMAL',
    };
  }
  const request = jest.fn(async (_metodo: string, ruta: string) => {
    if (!(ruta in datos)) throw new Error('Ruta no prevista: ' + ruta);
    return datos[ruta];
  });
  return { datos, request, api: { request } as ApiDemo };
}

describe('Preparación HTTP sin permisos extra', () => {
  it('normaliza el nombre y exige una patente que acepte la API', () => {
    const p = planDemoHttp(' http01 ', ' qa123zz ');
    expect(p.escenario).toBe('HTTP01');
    expect(p.camion.patente).toBe('QA123ZZ');
    expect(p.contenedores.map((c) => c.nivelLlenadoPct)).toEqual([90, 30, 85]);
    expect(() => planDemoHttp('HTTP01', 'DEMO-HTTP01')).toThrow('Mercosur');
  });

  it('rechaza al operador antes de escribir o emitir credenciales', async () => {
    const request = jest.fn().mockResolvedValue({ rol: 'OPERADOR' });
    await expect(
      prepararDemoHttp({ request }, planDemoHttp('HTTP01', 'QA123ZZ'), jest.fn()),
    ).rejects.toThrow('administradora');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('GET', '/auth/sesion');
  });

  it.each(['zona', 'contenedor', 'camion', 'chofer'])(
    'una colisión de %s impide todas las escrituras',
    async (tipo) => {
      const p = planDemoHttp('HTTP01', 'QA123ZZ');
      const responses: Record<string, unknown> = {
        '/auth/sesion': { rol: 'ADMINISTRADOR' },
        '/zonas': tipo === 'zona' ? [{ nombre: p.zonas.centro.nombre }] : [],
        '/contenedores': tipo === 'contenedor' ? [{ codigo: p.contenedores[0].codigo }] : [],
        '/camiones': tipo === 'camion' ? [{ patente: p.camion.patente }] : [],
        '/choferes?incluirInactivos=true': tipo === 'chofer' ? [{ legajo: p.chofer.legajo }] : [],
      };
      const request = jest.fn(async (_m: string, path: string) => responses[path]);
      const registrar = jest.fn();
      await expect(prepararDemoHttp({ request } as ApiDemo, p, registrar)).rejects.toThrow();
      expect(request.mock.calls.every(([m]) => m === 'GET')).toBe(true);
      expect(registrar).not.toHaveBeenCalled();
    },
  );
});

describe('Verificación operativa por etapas', () => {
  it.each(ETAPAS_DEMO)('comprueba %s usando solo GET', async (etapa) => {
    const f = fixture(etapa);
    await expect(verificarDemoHttp(f.api, escenario, etapa, 'alerta')).resolves.toMatchObject({
      verificada: true,
    });
    expect(f.request.mock.calls.every(([m]) => m === 'GET')).toBe(true);
  });

  it('no considera completa una recuperación sin la ruta del no crítico', async () => {
    const f = fixture('recuperada');
    f.datos['/rutas'] = [{ id: 'ruta1', camionId: 'camion' }];
    await expect(verificarDemoHttp(f.api, escenario, 'recuperada', 'alerta')).rejects.toThrow(
      'segunda ruta',
    );
  });

  it('omitir el contenedor no cuenta como confirmar su vaciado', async () => {
    const f = fixture('recuperada');
    f.datos['/rutas/ruta2'] = {
      choferId: 'chofer',
      estado: 'COMPLETADA',
      paradas: [{ contenedorId: 'c1', estado: 'OMITIDA' }],
    };
    await expect(verificarDemoHttp(f.api, escenario, 'recuperada', 'alerta')).rejects.toThrow(
      'segunda ruta',
    );
  });

  it('detecta que se alteró el control fuera de la zona afectada', async () => {
    const f = fixture('primer-vaciado');
    f.datos['/contenedores/c2'] = { ...escenario.contenedores[2], nivelLlenadoPct: 0 };
    await expect(verificarDemoHttp(f.api, escenario, 'primer-vaciado', 'alerta')).rejects.toThrow(
      'Llenado inesperado',
    );
  });

  it('no acepta el simulador local como evidencia de entrega de Espacios', async () => {
    const f = fixture('suspendida');
    f.datos['/contingencias/clima'] = { alertas: [{ alertaId: 'alerta', origen: 'simulador' }] };
    await expect(verificarDemoHttp(f.api, escenario, 'suspendida', 'alerta')).rejects.toThrow(
      'bus real',
    );
  });

  it('rechaza la recuperación anticipada y la falta de evidencia de vaciado', async () => {
    const f = fixture('habilitada');
    f.datos['/contingencias/inundacion'] = {
      alertaId: 'alerta',
      zonas: [{ zonaId: 'centro' }],
      estado: 'RECUPERADA',
    };
    await expect(verificarDemoHttp(f.api, escenario, 'habilitada', 'alerta')).rejects.toThrow(
      'Estado de contingencia',
    );
    const g = fixture('recuperada');
    g.datos['/contingencias/inundacion'] = {
      alertaId: 'alerta',
      zonas: [{ zonaId: 'centro' }],
      estado: 'RECUPERADA',
      contenedores: [
        { contenedorId: 'c0', vaciadoEn: null },
        { contenedorId: 'c1', vaciadoEn: 'fecha' },
      ],
    };
    await expect(verificarDemoHttp(g.api, escenario, 'recuperada', 'alerta')).rejects.toThrow(
      'evidencia',
    );
  });

  it('falla si nunca llegó el alertaId solicitado', async () => {
    const f = fixture('suspendida');
    await expect(verificarDemoHttp(f.api, escenario, 'suspendida', 'otra-alerta')).rejects.toThrow(
      'no llegó',
    );
    await expect(verificarDemoHttp(f.api, escenario, 'suspendida')).rejects.toThrow('alertaId');
  });
});
