import { Module } from '@nestjs/common';
import { EdaTokenService } from './eda-token.service';
import { EdaGatewayClient } from './eda-gateway.client';
import { EdaEventPublisher } from './eda-event.publisher';

@Module({
  providers: [EdaTokenService, EdaGatewayClient, EdaEventPublisher],
  exports: [EdaTokenService, EdaGatewayClient, EdaEventPublisher],
})
export class EdaTransportModule {}
