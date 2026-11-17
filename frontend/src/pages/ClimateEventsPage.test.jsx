import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ClimateEventsPage from './ClimateEventsPage.jsx';
import { fetchClimateAlerts, fetchZones, fetchNeighborhoods, resolveClimateAlert, simulateClimateEvent } from '../api/waste.js';
import { neighborhoods } from '../test/neighborhoods.js';
vi.mock('../api/waste.js', () => ({ fetchClimateAlerts: vi.fn(), fetchZones: vi.fn(), fetchNeighborhoods: vi.fn(), resolveClimateAlert: vi.fn(), simulateClimateEvent: vi.fn() }));
const alert = (patch = {}) => ({ alertaId: 'a1', decision: 'PENDIENTE_REVISION', origen: 'eda',
  confirmacion: { fenomeno: 'TORMENTA_FUERTE', nivelCriticidad: 'ALTA', ubicaciones: [{ latitud: -34.6, longitud: -58.38 }], vigenciaDesde: 1793311620000, vigenciaHasta: 1793333220000 }, ...patch });
const mount = (props = {}) => render(<MemoryRouter><ClimateEventsPage {...props} /></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  fetchNeighborhoods.mockResolvedValue(neighborhoods);
  fetchClimateAlerts.mockResolvedValue({ alertas: [alert()], simuladorHabilitado: true });
  fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'Centro' }, { id: 'z2', nombre: 'Norte' }]);
  resolveClimateAlert.mockResolvedValue({}); simulateClimateEvent.mockResolvedValue({});
});
describe('Eventos climaticos', () => {
  it.each([
    ['solo-cierre', null, { finalizadaEn: 1793333220000 }],
    ['texto', alert().confirmacion, null],
  ])('descarta %s desde una tarjeta compacta, exige motivo y la conserva en el historial', async (id, confirmacion, finalizacion) => {
    let row = alert({ alertaId: id, confirmacion, finalizacion });
    fetchClimateAlerts.mockImplementation(async () => ({ alertas: [row] }));
    resolveClimateAlert.mockImplementation(async (_id, decision) => { row = { ...row, decision: 'DESCARTADA', motivo: decision.motivo, revisadoPor: 'operador-res', revisadaEn: '2026-11-17T12:00:00Z' }; });
    const onAlertsChanged = vi.fn(); const user = userEvent.setup(); mount({ embedded: true, onAlertsChanged });
    await user.click(await screen.findByRole('button', { name: 'Descartar', exact: true }));
    const dialog = screen.getByRole('dialog', { name: 'Descartar alerta climática' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar descarte' });
    expect(confirm).toBeDisabled(); expect(resolveClimateAlert).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Motivo del descarte/), '   ');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Motivo del descarte/), 'Prueba concluida sin operación');
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(resolveClimateAlert).toHaveBeenCalledWith(id, { accion: 'DESCARTAR', motivo: 'Prueba concluida sin operación' });
    expect(onAlertsChanged).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Descartar', exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByText('Alertas climáticas revisadas (1)'));
    expect(screen.getByText('Descartada')).toBeVisible();
    await user.click(screen.getByText('Ver detalle y revisión'));
    expect(screen.getByText(/Revisión: Prueba concluida sin operación/)).toBeVisible();
    expect(screen.getByText('Revisada por: operador-res')).toBeVisible();
  });
  it('permite cancelar y conserva el motivo ante errores de descarte para reintentar', async () => {
    resolveClimateAlert.mockRejectedValueOnce(new Error('La alerta ya fue revisada'));
    const user = userEvent.setup(); mount({ embedded: true });
    await user.click(await screen.findByRole('button', { name: 'Descartar', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
    expect(resolveClimateAlert).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Descartar', exact: true }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Motivo del descarte/), 'Ensayo concluido en la revisión');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar descarte' }));
    expect(await within(dialog).findByText('La alerta ya fue revisada')).toBeVisible();
    expect(within(dialog).getByLabelText(/Motivo del descarte/)).toHaveValue('Ensayo concluido en la revisión');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar descarte' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(resolveClimateAlert).toHaveBeenCalledTimes(2);
  });
  it('en Alertas pliega detalles y pagina de a cinco sin perder una revisión al cambiar de página', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: Array.from({ length: 6 }, (_, i) => alert({ alertaId: `a${i}` })) });
    const user = userEvent.setup(); mount({ embedded: true });
    const first = await screen.findByRole('article', { name: 'Alerta a0', exact: true });
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(within(first).getByLabelText(/Fundamento/)).not.toBeVisible();
    await user.click(within(first).getByText('Ver detalle y revisión'));
    await user.click(within(first).getByLabelText('Centro'));
    await user.type(within(first).getByLabelText(/Fundamento/), 'Revisión manual en curso');
    await user.click(screen.getByRole('button', { name: 'Siguientes' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Alerta a5', exact: true })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Anteriores' }));
    expect(within(first).getByLabelText('Centro')).toBeChecked();
    expect(within(first).getByLabelText(/Fundamento/)).toHaveValue('Revisión manual en curso');
    expect(resolveClimateAlert).not.toHaveBeenCalled();
  });
  it('al descartar la última alerta de una página vuelve a una página existente', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => alert({ alertaId: `a${i}` }));
    fetchClimateAlerts.mockImplementation(async () => ({ alertas: rows.map(a => ({ ...a })) }));
    resolveClimateAlert.mockImplementation(async (id, decision) => { Object.assign(rows.find(a => a.alertaId === id), { decision: 'DESCARTADA', motivo: decision.motivo }); });
    const user = userEvent.setup(); mount({ embedded: true });
    await user.click(await screen.findByRole('button', { name: 'Siguientes' }));
    await user.click(screen.getByRole('button', { name: 'Descartar', exact: true }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Motivo del descarte/), 'Prueba concluida para esta alerta');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar descarte' }));
    expect(await screen.findByText('Alertas climáticas revisadas (1)')).toBeInTheDocument();
    for (let i = 0; i < 5; i++) expect(screen.getByLabelText(`Alerta a${i}`, { selector: 'article' })).toBeVisible();
    expect(screen.getByLabelText('Alerta a5', { selector: 'article' })).not.toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Páginas de alertas climáticas' })).not.toBeInTheDocument();
  });
  it('preselecciona las zonas vinculadas y mantiene la confirmación con fundamento', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ confirmacion: { ...alert().confirmacion, barrios: ['San Nicolás'] } })] });
    fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'Centro', barrioIds: ['AR-CABA-SAN-NICOLAS'] }, { id: 'z2', nombre: 'Norte', barrioIds: ['AR-CABA-NUNEZ'] }]);
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByLabelText('Centro')).toBeChecked());
    expect(screen.getByLabelText('Norte')).not.toBeChecked();
    expect(resolveClimateAlert).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmar suspensión del servicio' })).toBeDisabled();
    await user.type(screen.getByLabelText(/Fundamento/), 'Tormenta verificada en el barrio');
    await user.click(screen.getByRole('button', { name: 'Confirmar suspensión del servicio' }));
    expect(resolveClimateAlert).toHaveBeenCalledWith('a1', { accion: 'SUSPENDER', motivo: 'Tormenta verificada en el barrio', zonaIds: ['z1'] });
  });
  it('preserva cambios humanos al refrescar y permite volver a las sugerencias', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ confirmacion: { ...alert().confirmacion, barrios: ['SAN NICOLAS'] } })] });
    fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'Centro', barrioIds: ['AR-CABA-SAN-NICOLAS'] }, { id: 'z2', nombre: 'Norte' }]);
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByLabelText('Centro')).toBeChecked());
    await user.click(screen.getByLabelText('Centro')); await user.click(screen.getByLabelText('Norte'));
    await user.type(screen.getByLabelText(/Fundamento/), 'Se conserva la revisión manual');
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(fetchClimateAlerts).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Centro')).not.toBeChecked(); expect(screen.getByLabelText('Norte')).toBeChecked();
    expect(screen.getByLabelText(/Fundamento/)).toHaveValue('Se conserva la revisión manual');
    expect(resolveClimateAlert).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Usar zonas sugeridas' }));
    expect(screen.getByLabelText('Centro')).toBeChecked(); expect(screen.getByLabelText('Norte')).not.toBeChecked();
  });
  it('explica barrios desconocidos y barrios sin vínculo sin inferir zonas por su nombre', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ confirmacion: { ...alert().confirmacion, barrios: ['SAN NICOLAS', 'OTRA CIUDAD'] } })] });
    fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'SAN NICOLAS' }]);
    mount();
    expect(await screen.findByText(/Barrios sin zonas vinculadas: SAN NICOLAS/)).toBeInTheDocument();
    expect(screen.getByText(/Barrios fuera del catálogo común: OTRA CIUDAD/)).toBeInTheDocument();
    expect(screen.getByLabelText('SAN NICOLAS')).not.toBeChecked(); expect(resolveClimateAlert).not.toHaveBeenCalled();
  });
  it('si falla el catálogo permite seleccionar manualmente y reintentar su carga sin pisar la selección', async () => {
    fetchNeighborhoods.mockRejectedValueOnce(new Error('sin conexión')).mockResolvedValue(neighborhoods);
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ confirmacion: { ...alert().confirmacion, barrios: ['SAN NICOLAS'] } })] });
    fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'Centro', barrioIds: ['AR-CABA-SAN-NICOLAS'] }, { id: 'z2', nombre: 'Norte' }]);
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByLabelText('Norte'));
    expect(await screen.findByText(/No se pudo cargar el catálogo de barrios/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar barrios' }));
    await screen.findByText(/1 zona\(s\) sugerida/);
    expect(screen.getByLabelText('Centro')).not.toBeChecked(); expect(screen.getByLabelText('Norte')).toBeChecked();
  });
  it('aplica sugerencias cuando la confirmación llega después del cierre', async () => {
    fetchClimateAlerts.mockResolvedValueOnce({ alertas: [alert({ confirmacion: null, finalizacion: { finalizadaEn: 1793333220000 } })] });
    fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'Centro', barrioIds: ['AR-CABA-SAN-NICOLAS'] }]);
    const user = userEvent.setup(); mount(); await screen.findByText('Finalización recibida antes del inicio');
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ confirmacion: { ...alert().confirmacion, barrios: ['SAN NICOLAS'] }, finalizacion: { finalizadaEn: 1793333220000 } })] });
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(screen.getByLabelText('Centro')).toBeChecked()); expect(resolveClimateAlert).not.toHaveBeenCalled();
  });
  it('explica el registro pendiente de simulacros manteniendo visible la recepcion real conectada', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert()], simuladorHabilitado: false, integracion: { estado: 'CONECTADO', simulacroHabilitado: true, simulacrosPendientesRegistro: ['com.citypass.residuos.SimulacroClimaticoFinalizado'] } });
    mount();
    expect(await screen.findByText('Recepción EDA: Kafka conectado')).toBeInTheDocument();
    expect(screen.getByText('Simulacros de Residuos pendientes de registro')).toBeInTheDocument();
    expect(screen.getByText(/La recepción de alertas de Espacios Públicos sigue habilitada/)).toBeInTheDocument();
    expect(screen.queryByText('Simulacros de Residuos por EDA habilitados')).not.toBeInTheDocument();
  });
  it('distingue el simulacro que viajo por EDA de una alerta real de Espacios', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ origen: 'eda-simulacro' })], simuladorHabilitado: false, integracion: { estado: 'CONECTADO', simulacroHabilitado: true } });
    mount();
    expect(await screen.findByText(/SIMULACRO de Residuos recibido por EDA/)).toBeInTheDocument();
    expect(screen.getByText('Simulacros de Residuos por EDA habilitados')).toBeInTheDocument();
    expect(screen.getByText('Puntos del simulacro:')).toBeInTheDocument();
    expect(screen.queryByText('Probar el contrato de Espacios Públicos')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar suspensión del servicio' })).toBeDisabled();
  });
  it('informa el estado del consumidor real y los barrios del schema registrado', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ confirmacion: { ...alert().confirmacion, barrios: ['PALERMO'] } })], simuladorHabilitado: false, integracion: { estado: 'CONECTADO', ultimoError: null } });
    mount();
    expect(await screen.findByText('Recepción EDA: Kafka conectado')).toBeInTheDocument();
    expect(screen.getByText('Barrios informados: PALERMO')).toBeInTheDocument();
  });
  it('muestra puntos sin inventar un área ni suspender por recibir el mensaje', async () => {
    mount();
    expect(await screen.findByText('Latitud -34.6, longitud -58.38')).toBeInTheDocument();
    expect(screen.getByText(/Hasta confirmar, esta alerta no suspende/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar suspensión del servicio' })).toBeDisabled();
    expect(resolveClimateAlert).not.toHaveBeenCalled();
  });
  it('envía las zonas elegidas y el fundamento al confirmar', async () => {
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByLabelText('Centro'));
    await user.type(screen.getByLabelText(/Fundamento/), 'Inundación verificada en Centro');
    await user.click(screen.getByRole('button', { name: 'Confirmar suspensión del servicio' }));
    await waitFor(() => expect(resolveClimateAlert).toHaveBeenCalledWith('a1', { accion: 'SUSPENDER', motivo: 'Inundación verificada en Centro', zonaIds: ['z1'] }));
    expect(await screen.findByText('Suspensión registrada en las zonas seleccionadas.')).toBeInTheDocument();
  });
  it('registra sin afectación sin enviar zonas', async () => {
    const user = userEvent.setup(); mount();
    await user.type(await screen.findByLabelText(/Fundamento/), 'No afecta la recolección de residuos');
    await user.click(screen.getByRole('button', { name: /Registrar sin afectación/ }));
    expect(resolveClimateAlert).toHaveBeenCalledWith('a1', { accion: 'SIN_AFECTACION', motivo: 'No afecta la recolección de residuos' });
  });
  it('conserva el cierre anticipado sin ofrecer una selección de zonas', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ confirmacion: null, finalizacion: { finalizadaEn: 1793333220000 } })], simuladorHabilitado: false });
    mount();
    expect(await screen.findByText('Finalización recibida antes del inicio')).toBeInTheDocument();
    expect(screen.queryByLabelText('Centro')).not.toBeInTheDocument();
    expect(screen.queryByText('Probar el contrato de Espacios Públicos')).not.toBeInTheDocument();
  });
  it('muestra el resultado de una revisión y el acceso a la recuperación', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ decision: 'SUSPENDER', contingenciaId: 'f1', motivo: 'Verificado', revisadaEn: '2026-11-01T12:00:00Z' })], simuladorHabilitado: false });
    mount();
    expect(await screen.findByRole('link', { name: 'Ver suspensión y recuperación' })).toHaveAttribute('href', '/contingencias');
    expect(screen.queryByLabelText(/Fundamento/)).not.toBeInTheDocument();
  });
  it('permite probar el payload de finalización sin publicarlo en el bus', async () => {
    const user = userEvent.setup(); mount();
    const summary = await screen.findByText('Probar el contrato de Espacios Públicos');
    await user.click(summary);
    await user.selectOptions(screen.getByLabelText('Tipo de evento'), 'com.citypass.espacios.CriticidadClimaticaFinalizada');
    const json = '{"alertaId":"a1","finalizadaEn":1793333220000,"actorSub":"test"}';
    await user.click(screen.getByLabelText('Payload JSON de Espacios Públicos'));
    await user.paste(json);
    await user.click(screen.getByRole('button', { name: 'Procesar evento de prueba' }));
    expect(simulateClimateEvent).toHaveBeenCalledWith({ tipo: 'com.citypass.espacios.CriticidadClimaticaFinalizada', payload: JSON.parse(json) });
  });
  it('explica un JSON inválido y los errores de carga', async () => {
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByText('Probar el contrato de Espacios Públicos'));
    await user.type(screen.getByLabelText('Payload JSON de Espacios Públicos'), 'invalido');
    await user.click(screen.getByRole('button', { name: 'Procesar evento de prueba' }));
    expect(await screen.findByText('El payload debe ser un JSON válido.')).toBeInTheDocument();
    expect(simulateClimateEvent).not.toHaveBeenCalled();
    fetchClimateAlerts.mockRejectedValue(new Error('API no disponible'));
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('API no disponible')).toBeInTheDocument();
  });
  it('muestra alertas sin impacto ya revisadas', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ decision: 'SIN_AFECTACION' })], simuladorHabilitado: false });
    mount(); await userEvent.click(await screen.findByText(/Alertas climáticas revisadas/)); expect(await screen.findByText('Sin afectación')).toBeInTheDocument();
    expect(within(screen.getByRole('article')).queryByRole('button')).not.toBeInTheDocument();
  });
  it('mantiene el cierre pendiente de habilitación visible y archiva solo al recuperar', async () => {
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ decision: 'SUSPENDER', contingenciaId: 'f1', estadoContingencia: 'PENDIENTE_RECUPERACION', finalizacion: { finalizadaEn: 1793333220000 } })], simuladorHabilitado: false });
    mount();
    expect(await screen.findByRole('link', { name: 'Ver suspensión y recuperación' })).toBeVisible();
    expect(screen.getByText('Pendiente de habilitación')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Descartar', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/Alertas climáticas revisadas/)).not.toBeInTheDocument();
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ decision: 'SUSPENDER', contingenciaId: 'f1', estadoContingencia: 'RECUPERADA' })], simuladorHabilitado: false });
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText(/Alertas climáticas revisadas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver suspensión y recuperación', hidden: true })).not.toBeVisible();
  });

});
