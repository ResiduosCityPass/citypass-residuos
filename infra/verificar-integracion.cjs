// Verifica el Blueprint contra el validador real de la aplicación, sin red ni secretos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
const yaml = backendRequire('js-yaml');
require(backendRequire.resolve('reflect-metadata'));
const { validarEntorno } = require('../backend/dist/config/env.validation');
const blueprint = yaml.load(fs.readFileSync(path.join(root, 'render.yaml'), 'utf8'));
const api = blueprint.services.find(s => s.name === 'citypass-residuos-api');
const web = blueprint.services.find(s => s.name === 'citypass-residuos-frontend');
assert(api && web, 'Faltan servicios API/frontend');
const env = service => {
  const variables = Object.fromEntries(service.envVars.map(v => [v.key, v]));
  assert.equal(Object.keys(variables).length, service.envVars.length, 'Variables repetidas');
  return variables;
};
const apiVars = env(api), webVars = env(web);
const config = Object.fromEntries(Object.values(apiVars).map(v => [v.key,
  v.value ?? (v.fromDatabase ? 'postgresql://ci:ci@localhost:5432/residuos' :
    v.fromService ? `https://${v.fromService.name}.onrender.com` : 'solo-validacion-ci')
]));
const validated = validarEntorno(config);
assert.equal(validated.NODE_ENV, 'production');
assert.equal(validated.AUTH_MODE, 'federated');
assert.equal(validated.EVENT_BUS_DRIVER, 'platform');
assert.equal(validated.KAFKA_SSL, 'true');
assert.equal(validated.CLIMA_SIMULADOR_HABILITADO, 'false');
assert.equal(validated.CLIMA_SIMULACRO_EDA_HABILITADO, 'false');
assert.equal(validated.DB_SYNCHRONIZE, 'false');
assert.equal(validated.DB_MIGRATIONS_RUN, 'true');
assert.notEqual(validated.JWT_ISSUER, validated.JWT_ISSUER_CHOFERES);
assert(validated.JWT_OPERATOR_GROUPS.split(',').includes('delegados'));
assert(!validated.JWT_ADMIN_GROUPS.split(',').includes('delegados'));
for (const key of ['JWT_SECRET', 'GATEWAY_CLIENT_SECRET']) {
  assert.equal(apiVars[key]?.sync, false, `${key} debe cargarse fuera del repo`);
  assert(!('value' in apiVars[key]), `${key} no debe tener valor versionado`);
}
assert.equal(webVars.VITE_AUTH_MODE?.value, validated.AUTH_MODE);
assert.equal(webVars.VITE_IDP_CLIENT_ID?.value, 'citypass-residuos-web');
assert.equal(webVars.VITE_IDP_URL?.value + '/.well-known/jwks.json', validated.JWT_JWKS_URL);
assert.equal(webVars.VITE_API_ORIGIN?.fromService?.name, api.name);
assert.equal(webVars.VITE_API_PREFIX?.value, validated.API_PREFIX);
assert.equal(apiVars.CORS_ORIGIN?.fromService?.name, web.name);
for (const flag of ['VITE_USE_MOCKS', 'VITE_SIMULAR_GPS']) assert.equal(webVars[flag]?.value, 'false');
assert(!Object.keys(webVars).some(k => /SECRET|TOKEN|PASSWORD/.test(k)), 'El frontend no lleva secretos');
const local = backendRequire('dotenv').parse(fs.readFileSync(path.join(root, 'backend/.env.integration.example')));
assert.notEqual(local.KAFKA_GROUP_ID, validated.KAFKA_GROUP_ID, 'Local y cloud deben usar grupos Kafka distintos');
assert.equal(api.autoDeployTrigger, 'off');
assert.equal(web.autoDeployTrigger, 'off');
console.log('Blueprint válido para Login federado y EDA; secretos externos, simuladores apagados y grupo Kafka separado.');
