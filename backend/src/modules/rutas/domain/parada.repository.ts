import { Parada } from './parada.entity';

export interface ParadaRepository {
  crearVarias(paradas: Partial<Parada>[]): Promise<Parada[]>;
  guardar(parada: Parada): Promise<Parada>;
  /** Con la ruta y el contenedor cargados. */
  buscarPorId(id: string): Promise<Parada | null>;
  listarDeRuta(rutaId: string): Promise<Parada[]>;
}

export const PARADA_REPOSITORY = Symbol('PARADA_REPOSITORY');
