import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel } from 'kafkajs';
import { EdaTokenService } from '../shared/events/eda/eda-token.service';
import { EdaGatewayClient } from '../shared/events/eda/eda-gateway.client';
import { CONTRATOS_EDA, registroEda } from '../shared/events/eda/eda-contracts';
import { canonicalJson } from '../shared/events/eda/canonical-json';

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
    EDA_CLIENT_ID: 'grupo6',
    EDA_NAMESPACE: namespace,
    EDA_GATEWAY_URL: 'https://test.citypass.mrfranco.net.ar/api/v1',
    EDA_AUTH_URL: 'https://api.citypass-login.pp.ua',
    EDA_KAFKA_BROKERS: 'test.citypass.mrfranco.net.ar:9092',
    EDA_KAFKA_SSL: 'true',
    ...process.env,
  });
  for (const name of ['EDA_GATEWAY_URL', 'EDA_AUTH_URL']) {
    const url = new URL(config.getOrThrow<string>(name));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search)
      throw new Error(`${name} debe ser HTTPS sin credenciales`);
  }
  if (config.get<string>('EDA_NAMESPACE') !== namespace)
    throw new Error('El namespace debe ser com.citypass.residuos');
  const tokens = new EdaTokenService(config);
  const gateway = new EdaGatewayClient(config, tokens);
  const types = await gateway.listarTipos();
  console.log('Identidad de servicio verificada; catalogo EDA accesible.');
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
        brokers: config.getOrThrow<string>('EDA_KAFKA_BROKERS').split(','),
        ssl: config.get<string>('EDA_KAFKA_SSL') === 'true',
        logLevel: logLevel.NOTHING,
        sasl: {
          mechanism: 'oauthbearer',
          oauthBearerProvider: async () => ({ value: await tokens.obtener() }),
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
