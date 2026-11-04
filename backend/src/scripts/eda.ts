import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel } from 'kafkajs';
import { GatewayTransporte } from '../shared/events/gateway/gateway.transporte';
import { CONTRATOS_EDA, registroEda } from '../shared/events/gateway/contratos-climaticos';
import { canonicalJson } from '../shared/events/gateway/canonical-json';
import { EventoAuditable, verificarRespuestasEda } from '../shared/demo/respuestas-eda';

async function main() {
  cargarEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });
  const command = process.argv[2] ?? 'plan';
  const namespace = 'com.citypass.residuos';
  const proposals = Object.values(CONTRATOS_EDA).map(registroEda);
  if (command === 'plan') {
    console.log(JSON.stringify({ namespace, tipos: proposals }, null, 2));
    return;
  }
  const config = new ConfigService({
    GATEWAY_CLIENT_ID: 'grupo6',
    GATEWAY_NAMESPACE: namespace,
    GATEWAY_URL: 'https://test.citypass.mrfranco.net.ar',
    GATEWAY_TOKEN_URL: 'https://api.citypass-login.pp.ua/oauth/token',
    KAFKA_BROKERS: 'test.citypass.mrfranco.net.ar:9092',
    KAFKA_SSL: 'true',
    ...process.env,
  });
  for (const name of ['GATEWAY_URL', 'GATEWAY_TOKEN_URL']) {
    const url = new URL(config.getOrThrow<string>(name));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
      throw new Error(`${name} debe ser HTTPS sin credenciales`);
  }
  if (config.get<string>('GATEWAY_NAMESPACE') !== namespace)
    throw new Error('El namespace debe ser com.citypass.residuos');
  const gateway = new GatewayTransporte(config);
  if (command === 'auditar') {
    const parametro = (nombre: string) => {
      const index = process.argv.indexOf(nombre);
      const value = index < 0 ? undefined : process.argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Falta ${nombre}`);
      return value;
    };
    const esperado = {
      alertaId: parametro('--alerta'),
      inundacionId: parametro('--inundacion'),
      zonaId: parametro('--zona'),
      clientId: config.getOrThrow<string>('GATEWAY_CLIENT_ID'),
    };
    const recientes = await gateway.request<{ events: EventoAuditable[] }>('/events?limit=50');
    console.log(
      JSON.stringify(
        {
          verificado: true,
          ...esperado,
          respuestas: verificarRespuestasEda(recientes.events, esperado),
        },
        null,
        2,
      ),
    );
    return;
  }
  const types = await gateway.listarTipos();
  console.log('Token de servicio obtenido; catalogo EDA accesible.');
  if (command === 'verificar') {
    console.log(
      JSON.stringify(
        types.filter(
          (t) =>
            t.fqn.startsWith('com.citypass.espacios.CriticidadClimatica') ||
            t.fqn.startsWith(namespace),
        ),
      ),
    );
    if (process.argv.includes('--kafka')) {
      const kafka = new Kafka({
        clientId: 'residuos-diagnostico',
        brokers: config.getOrThrow<string>('KAFKA_BROKERS').split(','),
        ssl: config.get<string>('KAFKA_SSL') === 'true',
        logLevel: logLevel.NOTHING,
        sasl: {
          mechanism: 'oauthbearer',
          oauthBearerProvider: async () => ({ value: await gateway.obtenerToken() }),
        },
        connectionTimeout: 5000,
        requestTimeout: 10000,
        retry: { retries: 1 },
      });
      const admin = kafka.admin();
      try {
        await admin.connect();
        const result = await admin.fetchTopicMetadata({
          topics: types
            .filter((t) => t.fqn.startsWith('com.citypass.espacios.CriticidadClimatica'))
            .map((t) => t.topic),
        });
        console.log(JSON.stringify({ kafka: 'OK', topicos: result.topics.map((t) => t.name) }));
      } finally {
        await admin.disconnect();
      }
    }
    return;
  }
  if (command !== 'registrar' || !process.argv.includes('--apply'))
    throw new Error('Usa plan, verificar [--kafka], o registrar --apply');
  for (const proposal of proposals) {
    const fqn = `${namespace}.${proposal.name}`;
    if (types.some((t) => t.fqn === fqn)) {
      const existing = await gateway.request<{
        fields: Array<{ name: string; type: { fields?: unknown } }>;
      }>(`/event-types/${encodeURIComponent(fqn)}`);
      const fields = existing.fields.find((f) => f.name === 'data')?.type.fields;
      if (canonicalJson(fields) !== canonicalJson(proposal.fields))
        throw new Error(
          `El contrato existente de ${fqn} difiere. No se modifico; coordina la evolucion del schema.`,
        );
      console.log(`${fqn}: ya registrado`);
    } else {
      await gateway.request('/event-types', 'POST', proposal);
      console.log(`${fqn}: registrado`);
    }
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Fallo de integracion EDA');
  process.exitCode = 1;
});
