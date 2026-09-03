import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Contenedor } from '../domain/contenedor.entity';
import { ContenedorRepository, FiltroContenedores } from '../domain/contenedor.repository';

@Injectable()
export class ContenedorTypeormRepository
  extends RepositorioTypeorm<Contenedor>
  implements ContenedorRepository
{
  constructor(
    @InjectRepository(Contenedor)
    repositorio: Repository<Contenedor>,
    contexto: ContextoTransaccional,
  ) {
    super(repositorio, contexto, Contenedor);
  }

  crear(contenedor: Partial<Contenedor>): Promise<Contenedor> {
    return this.repo().save(this.repo().create(contenedor));
  }

  guardar(contenedor: Contenedor): Promise<Contenedor> {
    return this.repo().save(contenedor);
  }

  buscarPorId(id: string): Promise<Contenedor | null> {
    return this.repo().findOne({ where: { id }, relations: { zona: true, sensor: true } });
  }

  buscarPorCodigo(codigo: string): Promise<Contenedor | null> {
    return this.repo().findOne({ where: { codigo } });
  }

  /**
   * El sensor viene en el listado porque "sin sensor" y "sensor que nunca
   * reporto" se ven identicos sin el: los dos muestran 0% y sin fecha de
   * ultima lectura. Es un LEFT JOIN 1:1 sobre una FK unica, y `apiKeyHash`
   * esta declarado `select: false`, asi que la credencial no viaja.
   */
  listar(filtro: FiltroContenedores): Promise<Contenedor[]> {
    return this.repo().find({
      where: this.armarWhere(filtro),
      order: { codigo: 'ASC' },
      relations: { sensor: true },
    });
  }

  listarConZona(filtro: FiltroContenedores): Promise<Contenedor[]> {
    return this.repo().find({
      where: this.armarWhere(filtro),
      order: { codigo: 'ASC' },
      relations: { zona: true },
    });
  }

  private armarWhere(filtro: FiltroContenedores): FindOptionsWhere<Contenedor> {
    const where: FindOptionsWhere<Contenedor> = {};

    if (filtro.zonaId) where.zonaId = filtro.zonaId;
    if (filtro.tipoResiduo) where.tipoResiduo = filtro.tipoResiduo;
    if (filtro.estado) where.estado = filtro.estado;
    if (filtro.soloActivos) where.activo = true;

    return where;
  }

  contar(): Promise<number> {
    return this.repo().count();
  }
}
