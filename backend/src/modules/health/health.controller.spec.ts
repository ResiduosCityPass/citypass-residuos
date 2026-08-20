import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reporta el servicio como disponible', () => {
    const respuesta = new HealthController().check();

    expect(respuesta.status).toBe('ok');
    expect(respuesta.service).toBe('residuos-service');
    expect(() => new Date(respuesta.timestamp).toISOString()).not.toThrow();
  });
});
