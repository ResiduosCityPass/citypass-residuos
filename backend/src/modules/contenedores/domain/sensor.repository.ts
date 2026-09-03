import { Sensor } from './sensor.entity';

export interface SensorRepository {
  crear(sensor: Partial<Sensor>): Promise<Sensor>;
  guardar(sensor: Sensor): Promise<Sensor>;
  buscarPorContenedor(contenedorId: string): Promise<Sensor | null>;
  buscarPorCodigo(codigo: string): Promise<Sensor | null>;
  /** Lo usa SensorKeyGuard: la identidad del sensor sale de su credencial. */
  buscarPorApiKeyHash(apiKeyHash: string): Promise<Sensor | null>;
  contar(): Promise<number>;
}

export const SENSOR_REPOSITORY = Symbol('SENSOR_REPOSITORY');
