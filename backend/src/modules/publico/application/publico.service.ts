import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENEDOR_CERCANO_REPOSITORY,
  ContenedorCercano,
  ContenedorCercanoRepository,
} from '../domain/contenedor-cercano.repository';
import { BuscarCercanosDto, RADIO_DEFAULT_METROS } from './dto/buscar-cercanos.dto';

/**
 * CU-11 · Consultar contenedores cercanos.
 *
 * El unico caso de uso publico del modulo: sin login y sin token (ADR-005). Es
 * informacion de servicio publico y exigir sesion seria una barrera sin
 * justificacion.
 *
 * **Lo que no devuelve es tan parte del caso de uso como lo que devuelve.** Ni
 * nivel de llenado ni estado ni alertas: eso es informacion operativa interna
 * del municipio. Por eso la proyeccion es campo por campo y nunca un spread de
 * la entidad: el dia que se agregue una columna al contenedor, no puede
 * filtrarse sola a la vista anonima.
 */
@Injectable()
export class PublicoService {
  constructor(
    @Inject(CONTENEDOR_CERCANO_REPOSITORY)
    private readonly contenedores: ContenedorCercanoRepository,
  ) {}

  async buscarCercanos(filtro: BuscarCercanosDto): Promise<ContenedorCercano[]> {
    const cercanos = await this.contenedores.buscarCercanos({
      lat: filtro.lat,
      lng: filtro.lng,
      radioMetros: filtro.radioMetros ?? RADIO_DEFAULT_METROS,
      tipoResiduo: filtro.tipoResiduo,
    });

    return cercanos.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      lat: c.lat,
      lng: c.lng,
      tipoResiduo: c.tipoResiduo,
      distanciaMetros: c.distanciaMetros,
    }));
  }
}
