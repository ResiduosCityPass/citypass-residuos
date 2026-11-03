import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import {
  AlertaClimaticaExterna,
  AlertaClimaticaRepository,
} from '../domain/alerta-climatica.entity';

@Injectable()
export class AlertaClimaticaTypeormRepository
  extends RepositorioTypeorm<AlertaClimaticaExterna>
  implements AlertaClimaticaRepository
{
  constructor(
    @InjectRepository(AlertaClimaticaExterna) repo: Repository<AlertaClimaticaExterna>,
    contexto: ContextoTransaccional,
  ) {
    super(repo, contexto, AlertaClimaticaExterna);
  }
  buscar(alertaId: string) {
    return this.repo().findOneBy({ alertaId });
  }
  listar() {
    return this.repo().find({ order: { recibidaEn: 'DESC', alertaId: 'ASC' } });
  }
  guardar(alerta: AlertaClimaticaExterna) {
    return this.repo().save(alerta);
  }
}
