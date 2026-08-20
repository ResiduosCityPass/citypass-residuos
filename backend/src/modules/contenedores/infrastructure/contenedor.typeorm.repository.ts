import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Contenedor } from '../domain/contenedor.entity';
import { ContenedorRepository, FiltroContenedores } from '../domain/contenedor.repository';

@Injectable()
export class ContenedorTypeormRepository implements ContenedorRepository {
  constructor(
    @InjectRepository(Contenedor)
    private readonly repo: Repository<Contenedor>,
  ) {}

  crear(contenedor: Partial<Contenedor>): Promise<Contenedor> {
    return this.repo.save(this.repo.create(contenedor));
  }

  guardar(contenedor: Contenedor): Promise<Contenedor> {
    return this.repo.save(contenedor);
  }

  buscarPorId(id: string): Promise<Contenedor | null> {
    return this.repo.findOne({ where: { id }, relations: { zona: true, sensor: true } });
  }

  buscarPorCodigo(codigo: string): Promise<Contenedor | null> {
    return this.repo.findOne({ where: { codigo } });
  }

  listar(filtro: FiltroContenedores): Promise<Contenedor[]> {
    const where: FindOptionsWhere<Contenedor> = {};

    if (filtro.zonaId) where.zonaId = filtro.zonaId;
    if (filtro.tipoResiduo) where.tipoResiduo = filtro.tipoResiduo;
    if (filtro.estado) where.estado = filtro.estado;
    if (filtro.soloActivos) where.activo = true;

    return this.repo.find({ where, order: { codigo: 'ASC' } });
  }

  contar(): Promise<number> {
    return this.repo.count();
  }
}
