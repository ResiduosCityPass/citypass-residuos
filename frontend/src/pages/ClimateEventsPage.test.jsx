import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ClimateEventsPage from './ClimateEventsPage.jsx';
import { fetchClimateAlerts, fetchZones, resolveClimateAlert, simulateClimateEvent } from '../api/waste.js';
vi.mock('../api/waste.js', () => ({ fetchClimateAlerts: vi.fn(), fetchZones: vi.fn(), resolveClimateAlert: vi.fn(), simulateClimateEvent: vi.fn() }));
const alert = (patch = {}) => ({ alertaId: 'a1', decision: 'PENDIENTE_REVISION', origen: 'eda',
  confirmacion: { fenomeno: 'TORMENTA_FUERTE', nivelCriticidad: 'ALTA', ubicaciones: [{ latitud: -34.6, longitud: -58.38 }], vigenciaDesde: 1793311620000, vigenciaHasta: 1793333220000 }, ...patch });
const mount = () => render(<MemoryRouter><ClimateEventsPage /></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  fetchClimateAlerts.mockResolvedValue({ alertas: [alert()], simuladorHabilitado: true });
  fetchZones.mockResolvedValue([{ id: 'z1', nombre: 'Centro' }, { id: 'z2', nombre: 'Norte' }]);
  resolveClimateAlert.mockResolvedValue({}); simulateClimateEvent.mockResolvedValue({});
});
describe('Eventos climaticos', () => {
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
    expect(screen.queryByText(/Alertas climáticas revisadas/)).not.toBeInTheDocument();
    fetchClimateAlerts.mockResolvedValue({ alertas: [alert({ decision: 'SUSPENDER', contingenciaId: 'f1', estadoContingencia: 'RECUPERADA' })], simuladorHabilitado: false });
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText(/Alertas climáticas revisadas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver suspensión y recuperación', hidden: true })).not.toBeVisible();
  });

});
