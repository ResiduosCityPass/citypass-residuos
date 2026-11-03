import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainEvent } from '../../domain/domain-event';
import { EventPublisher } from '../event-publisher';
import { EdaGatewayClient } from './eda-gateway.client';
import { publicacionEda } from './eda-contracts';

@Injectable()
export class EdaEventPublisher implements EventPublisher {
  constructor(
    private readonly config: ConfigService,
    private readonly gateway: EdaGatewayClient,
  ) {}
  async publish(event: DomainEvent): Promise<void> {
    const { fqn, data } = publicacionEda(
      event,
      this.config.get<string>('EDA_NAMESPACE', 'com.citypass.residuos'),
    );
    await this.gateway.request(`/event-types/${encodeURIComponent(fqn)}/events`, 'POST', data);
  }
}
