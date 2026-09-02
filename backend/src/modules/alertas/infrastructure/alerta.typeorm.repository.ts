import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { EstadoAlerta, TipoAlerta } from '../../../shared/domain/enums';
import { Alerta } from '../domain/alerta.entity';
import { AlertaRepository, FiltroAlertas } from '../domain/alerta.repository';

@Injectable()
export class AlertaTypeormRepository
  extends RepositorioTypeorm<Alerta>
  implements AlertaRepository
{
  constructor(
    @InjectRepository(Alerta)
    repositorio: Repository<Alerta>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, Alerta);
  }

  crear(alerta: Partial<Alerta>): Promise<Alerta> {
    return this.repo().save(this.repo().create(alerta));
  }

  guardar(alerta: Alerta): Promise<Alerta> {
    return this.repo().save(alerta);
  }

  buscarPorId(id: string): Promise<Alerta | null> {
    return this.repo().findOne({ where: { id } });
  }

  buscarAbierta(contenedorId: string, tipo: TipoAlerta): Promise<Alerta | null> {
    return this.repo().findOne({
      where: { contenedorId, tipo, estado: EstadoAlerta.ABIERTA },
    });
  }

  listar(filtro: FiltroAlertas): Promise<Alerta[]> {
    const where: FindOptionsWhere<Alerta> = {};

    if (filtro.contenedorId) where.contenedorId = filtro.contenedorId;
    if (filtro.tipo) where.tipo = filtro.tipo;
    if (filtro.severidad) where.severidad = filtro.severidad;
    if (filtro.estado) where.estado = filtro.estado;

    return this.repo().find({
      where,
      order: { detectadaEn: 'DESC' },
      // El listado expone el codigo del contenedor. Sin esto, el frontend
      // tenia que cruzarlo por su cuenta en cada fila de la tabla.
      relations: { contenedor: true },
    });
  }

  listarAbiertasPorContenedor(contenedorId: string, tipo: TipoAlerta): Promise<Alerta[]> {
    return this.repo().find({ where: { contenedorId, tipo, estado: EstadoAlerta.ABIERTA } });
  }
}
