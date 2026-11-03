import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { GatewayTransporte } from '../shared/events/gateway/gateway.transporte';
import { canonicalJson } from '../shared/events/gateway/canonical-json';
import {
  crearFinSimulacro,
  crearInicioSimulacro,
  SIMULACROS_EDA,
  simulacroEdaHabilitado,
} from '../modules/contingencias/application/simulacro-eda';

async function main() {
  cargarEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });
  const command = process.argv[2] ?? 'plan';
  const proposals = SIMULACROS_EDA.map(({ name, fields }) => ({ name, fields }));
  if (command === 'plan') {
    console.log(JSON.stringify({ namespace: 'com.citypass.residuos', tipos: proposals }, null, 2));
    return;
  }
  const config = new ConfigService(process.env);
  if (!simulacroEdaHabilitado(config))
    throw new Error(
      'Habilita CLIMA_SIMULACRO_EDA_HABILITADO=true en desarrollo/test; no se permite en produccion',
    );
  if (!process.argv.includes('--apply')) throw new Error('La publicacion requiere --apply');
  if (config.get<string>('GATEWAY_NAMESPACE') !== 'com.citypass.residuos')
    throw new Error('Los simulacros solo se publican en com.citypass.residuos');
  for (const setting of ['GATEWAY_URL', 'GATEWAY_TOKEN_URL']) {
    const url = new URL(config.getOrThrow<string>(setting));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error(`${setting} debe usar HTTPS sin credenciales`);
  }
  const gateway = new GatewayTransporte(config);
  const types = await gateway.listarTipos();
  if (command === 'registrar') {
    for (const proposal of proposals) {
      const fqn = `com.citypass.residuos.${proposal.name}`;
      if (types.some((t) => t.fqn === fqn)) {
        const existing = await gateway.request<{
          fields: Array<{ name: string; type: { fields?: unknown } }>;
        }>(`/event-types/${encodeURIComponent(fqn)}`);
        if (
          canonicalJson(existing.fields.find((f) => f.name === 'data')?.type.fields) !==
          canonicalJson(proposal.fields)
        )
          throw new Error(`El schema de ${fqn} difiere; no se modifico`);
        console.log(`${fqn}: ya registrado`);
      } else {
        await gateway.request('/event-types', 'POST', proposal);
        console.log(`${fqn}: registrado`);
      }
    }
    return;
  }
  if (!['inicio', 'fin'].includes(command)) throw new Error('Usa plan, registrar, inicio o fin');
  const contract = SIMULACROS_EDA[command === 'inicio' ? 0 : 1];
  if (!types.some((t) => t.fqn === contract.fqn))
    throw new Error('Primero registra los tipos de simulacro');
  const index = process.argv.indexOf('--alerta');
  if (command === 'fin' && (index < 0 || !process.argv[index + 1]))
    throw new Error('El cierre requiere --alerta SIMULACRO-RES-<id> del inicio');
  const payload =
    command === 'inicio' ? crearInicioSimulacro() : crearFinSimulacro(process.argv[index + 1]);
  const result = await gateway.request<{ metadata?: { eventId?: string }; eventId?: string }>(
    `/event-types/${encodeURIComponent(contract.fqn)}/events`,
    'POST',
    payload,
  );
  console.log(
    JSON.stringify({
      tipo: contract.fqn,
      alertaId: payload.alertaId,
      payload,
      eventIdEda: result?.metadata?.eventId ?? result?.eventId ?? null,
    }).replace(/[\r\n]/g, ''),
  );
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Fallo del simulacro EDA');
  process.exitCode = 1;
});
