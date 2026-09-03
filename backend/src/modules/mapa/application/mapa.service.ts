import { Inject, Injectable } from '@nestjs/common';
import {
  EstadoAlerta,
  EstadoContenedor,
  TipoAlerta,
  TipoResiduo,
} from '../../../shared/domain/enums';
import { AlertasService } from '../../alertas/application/alertas.service';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
  FiltroContenedores,
} from '../../contenedores/domain/contenedor.repository';

/** Un marcador del mapa (CU-07). */
export interface MarcadorMapa {
  id: string;
  codigo: string;
  lat: number;
  lng: number;
  estado: EstadoContenedor;
  tipoResiduo: TipoResiduo;
  nivelLlenadoPct: number;
  ultimaLecturaEn: Date | null;
  zonaNombre: string | null;
  umbralCriticoPct: number | null;
  incendioActivo: boolean;
}

/**
 * CU-07 · Composicion del mapa en tiempo real.
 *
 * El payload sigue siendo flaco —solo lo necesario para pintar un marcador— pero
 * ahora trae tres datos que el frontend estaba resolviendo por su cuenta:
 *
 * - `incendioActivo`: el estado del contenedor refleja el *llenado*, y el
 *   incendio se evalua contra la *temperatura*. Un contenedor verde al 8% puede
 *   estar prendido fuego. El cliente tenia que pedir /alertas en cada refresco
 *   solo para saberlo; ahora viene resuelto.
 * - `zonaNombre` y `umbralCriticoPct`: sin el umbral no se puede dibujar la marca
 *   de referencia sobre la barra de llenado, que es lo que le da sentido al
 *   numero. "94% sobre un umbral de 70" se entiende; "94%" solo, no.
 *
 * Son dos consultas en total, sin importar cuantos contenedores haya: una para
 * los contenedores y otra para todos los incendios abiertos.
 */
@Injectable()
export class MapaService {
  constructor(
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    private readonly alertas: AlertasService,
  ) {}

  async marcadores(filtro: FiltroContenedores): Promise<MarcadorMapa[]> {
    const [contenedores, incendios] = await Promise.all([
      this.contenedores.listarConZona({ ...filtro, soloActivos: true }),
      this.alertas.listar({ tipo: TipoAlerta.INCENDIO, estado: EstadoAlerta.ABIERTA }),
    ]);

    const conIncendio = new Set(incendios.map((a) => a.contenedorId));

    return contenedores.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      lat: c.lat,
      lng: c.lng,
      estado: c.estado,
      tipoResiduo: c.tipoResiduo,
      nivelLlenadoPct: c.nivelLlenadoPct,
      ultimaLecturaEn: c.ultimaLecturaEn,
      zonaNombre: c.zona?.nombre ?? null,
      umbralCriticoPct: c.zona?.umbralCriticoPct ?? null,
      incendioActivo: conIncendio.has(c.id),
    }));
  }
}
