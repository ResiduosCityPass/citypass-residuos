import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contenedor } from '../../contenedores/domain/contenedor.entity';
import { Zona } from '../domain/zona.entity';
import { ZonaRepository } from '../domain/zona.repository';

/** Adaptador TypeORM del puerto ZonaRepository. Es el unico archivo que sabe SQL. */
@Injectable()
export class ZonaTypeormRepository implements ZonaRepository {
  constructor(
    @InjectRepository(Zona)
    private readonly repo: Repository<Zona>,
    @InjectRepository(Contenedor)
    private readonly contenedores: Repository<Contenedor>,
  ) {}

  crear(zona: Partial<Zona>): Promise<Zona> {
    return this.repo.save(this.repo.create(zona));
  }

  guardar(zona: Zona): Promise<Zona> {
    return this.repo.save(zona);
  }

  buscarPorId(id: string): Promise<Zona | null> {
    return this.repo.findOne({ where: { id } });
  }

  buscarPorNombre(nombre: string): Promise<Zona | null> {
    return this.repo.findOne({ where: { nombre } });
  }

  listar(): Promise<Zona[]> {
    return this.repo.find({ order: { nombre: 'ASC' } });
  }

  contarContenedores(zonaId: string): Promise<number> {
    return this.contenedores.count({ where: { zonaId } });
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
