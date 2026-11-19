import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reporta el servicio como disponible', () => {
    const respuesta = new HealthController().check();

    expect(respuesta.status).toBe('ok');
    expect(respuesta.service).toBe('residuos-service');
    expect(() => new Date(respuesta.timestamp).toISOString()).not.toThrow();
  });

  it('informa el commit desplegado cuando Render lo inyecta, y null si no', () => {
    const anterior = process.env.RENDER_GIT_COMMIT;
    try {
      process.env.RENDER_GIT_COMMIT = 'abc123';
      expect(new HealthController().check().commit).toBe('abc123');

      delete process.env.RENDER_GIT_COMMIT;
      expect(new HealthController().check().commit).toBeNull();
    } finally {
      if (anterior === undefined) delete process.env.RENDER_GIT_COMMIT;
      else process.env.RENDER_GIT_COMMIT = anterior;
    }
  });
});
