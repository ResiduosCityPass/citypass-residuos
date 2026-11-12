import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EMISOR_CHOFERES_DEFAULT } from '../../config/env.validation';
import { Chofer } from '../../modules/choferes/domain/chofer.entity';
import {
  payloadDeCredencialChofer,
  subDeCodigoChofer,
  vencimientoCodigoChofer,
} from './credencial-chofer';
import { JwtPayload } from './jwt-payload';

@Injectable()
export class CodigoChoferService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async verificar(codigo: string): Promise<JwtPayload> {
    const exp = vencimientoCodigoChofer(codigo);
    if (!exp || exp <= Math.floor(Date.now() / 1000)) throw new Error('Código inválido o vencido');
    const sub = subDeCodigoChofer(codigo);
    // El índice de usuarioSub ya existe. La consulta exige que siga activo y
    // que no se haya emitido otra credencial; no se persiste el código en claro.
    const chofer = await this.db
      .getRepository(Chofer)
      .findOne({ where: { usuarioSub: sub, activo: true } });
    if (!chofer) throw new Error('Código inválido o revocado');
    return {
      ...payloadDeCredencialChofer(sub, chofer.legajo),
      iss: this.config.get<string>('JWT_ISSUER_CHOFERES', EMISOR_CHOFERES_DEFAULT),
      aud: [this.config.get<string>('JWT_AUDIENCE', 'citypass-residuos-api')],
      iat: exp - 30 * 24 * 60 * 60,
      exp,
    };
  }
}
