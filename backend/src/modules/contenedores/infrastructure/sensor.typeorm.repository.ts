import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '../domain/sensor.entity';
import { SensorRepository } from '../domain/sensor.repository';

@Injectable()
export class SensorTypeormRepository implements SensorRepository {
  constructor(
    @InjectRepository(Sensor)
    private readonly repo: Repository<Sensor>,
  ) {}

  crear(sensor: Partial<Sensor>): Promise<Sensor> {
    return this.repo.save(this.repo.create(sensor));
  }

  guardar(sensor: Sensor): Promise<Sensor> {
    return this.repo.save(sensor);
  }

  buscarPorContenedor(contenedorId: string): Promise<Sensor | null> {
    return this.repo.findOne({ where: { contenedorId } });
  }

  buscarPorCodigo(codigo: string): Promise<Sensor | null> {
    return this.repo.findOne({ where: { codigo } });
  }

  /**
   * `apiKeyHash` esta marcado como `select: false` en la entidad para que no se
   * filtre en ninguna respuesta por accidente; aca se compara en el WHERE, que no
   * lo expone. El indice unico sobre la columna hace que esta consulta sea O(log n)
   * aunque corra en cada `POST /lecturas`.
   */
  buscarPorApiKeyHash(apiKeyHash: string): Promise<Sensor | null> {
    return this.repo
      .createQueryBuilder('sensor')
      .where('sensor.apiKeyHash = :apiKeyHash', { apiKeyHash })
      .getOne();
  }

  contar(): Promise<number> {
    return this.repo.count();
  }
}
