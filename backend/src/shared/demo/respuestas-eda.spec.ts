import { EventoAuditable, RESPUESTAS_CLIMA, verificarRespuestasEda } from './respuestas-eda';

describe('Auditoría correlacionada de respuestas EDA', () => {
  const esperado = {
    alertaId: 'alerta',
    inundacionId: 'contingencia',
    zonaId: 'centro',
    clientId: 'grupo6',
  };
  const eventos = (): EventoAuditable[] =>
    Object.entries(RESPUESTAS_CLIMA).map(([nombre, estado]) => ({
      metadata: {
        source: 'grupo6',
        eventType: `com.citypass.residuos.${nombre}`,
        eventId: 'eda-' + nombre,
      },
      data: {
        alertaId: 'alerta',
        correlationId: 'alerta',
        inundacionId: 'contingencia',
        zonaIds: ['centro'],
        estado,
        eventId: 'dominio-' + nombre,
        occurredAt: '2026-11-03T22:40:06.155Z',
      },
    }));
  it('verifica las cuatro respuestas e ignora otros casos', () => {
    const ajeno = eventos()[0];
    ajeno.data.alertaId = 'otra';
    expect(verificarRespuestasEda([...eventos(), ajeno], esperado)).toHaveLength(4);
  });
  it('no confunde la ausencia en la ventana reciente con una entrega confirmada', () => {
    expect(() => verificarRespuestasEda(eventos().slice(0, 3), esperado)).toThrow(
      'Falta ServicioRestablecido',
    );
  });
  it.each([
    'source',
    'correlationId',
    'inundacionId',
    'zonaIds',
    'estado',
    'eventId',
    'occurredAt',
  ])('rechaza una respuesta con %s incorrecto', (campo) => {
    const actual = eventos();
    if (campo === 'source') actual[0].metadata.source = 'otra-cuenta';
    else if (campo === 'zonaIds') actual[0].data.zonaIds = ['otra-zona'];
    else if (campo === 'eventId') actual[0].data.eventId = '';
    else
      actual[0].data[campo as 'estado' | 'correlationId' | 'inundacionId' | 'occurredAt'] =
        'incorrecto';
    expect(() => verificarRespuestasEda(actual, esperado)).toThrow();
  });
});
