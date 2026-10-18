import { Body, Controller, HttpCode, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { Public } from '../../shared/auth/public.decorator';
import { IntegracionService, SobreGateway } from './application/integracion.service';

/**
 * Receptor del webhook del bus de CityPass+ (CU-INT-01).
 *
 * Es publico para el guard JWT porque el dispatcher del Squad 1 no manda token:
 * se autentica con el secreto que viaja en la URL de la suscripcion (?token=...),
 * comparado en tiempo constante.
 */
@ApiTags('Integracion CityPass+')
@Controller('webhooks')
export class CitypassWebhookController {
  private readonly tokenEsperado: string;

  constructor(
    private readonly integracion: IntegracionService,
    config: ConfigService,
  ) {
    this.tokenEsperado = config.get<string>('GATEWAY_WEBHOOK_TOKEN', '');
  }

  @Public()
  @Post('citypass')
  @HttpCode(204)
  @ApiOperation({ summary: 'Recibe un evento del bus de CityPass+' })
  async recibir(
    @Query('token') token: string | undefined,
    @Body() sobre: Record<string, unknown>,
  ): Promise<void> {
    if (!this.tokenValido(token)) {
      throw new UnauthorizedException({
        message: 'Token invalido',
        code: 'WEBHOOK_TOKEN_INVALIDO',
      });
    }

    await this.integracion.procesar(sobre as SobreGateway);
  }

  private tokenValido(token: string | undefined): boolean {
    if (!this.tokenEsperado || !token) {
      return false;
    }

    const esperado = Buffer.from(this.tokenEsperado);
    const recibido = Buffer.from(token);

    return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
  }
}
