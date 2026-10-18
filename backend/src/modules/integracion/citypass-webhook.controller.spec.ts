import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegracionService } from './application/integracion.service';
import { CitypassWebhookController } from './citypass-webhook.controller';

describe('CitypassWebhookController (CU-INT-01)', () => {
  const sobre = { metadata: { eventId: 'e-1', eventType: 'x' }, data: {} };
  let integracion: jest.Mocked<Pick<IntegracionService, 'procesar'>>;

  const controller = (token?: string) =>
    new CitypassWebhookController(
      integracion as unknown as IntegracionService,
      new ConfigService(token ? { GATEWAY_WEBHOOK_TOKEN: token } : {}),
    );

  beforeEach(() => {
    integracion = { procesar: jest.fn().mockResolvedValue('procesado') };
  });

  it('con el token correcto procesa el evento', async () => {
    await controller('secreto').recibir('secreto', sobre);

    expect(integracion.procesar).toHaveBeenCalledWith(sobre);
  });

  it('con un token equivocado responde 401 sin procesar', async () => {
    await expect(controller('secreto').recibir('otro', sobre)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(integracion.procesar).not.toHaveBeenCalled();
  });

  it('sin token configurado rechaza todo', async () => {
    await expect(controller().recibir('', sobre)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
