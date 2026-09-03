import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { aplicarCambios } from '../../../shared/application/aplicar-cambios';
import { Zona } from '../domain/zona.entity';
import { ZONA_REPOSITORY, ZonaRepository } from '../domain/zona.repository';
import { ActualizarZonaDto } from './dto/actualizar-zona.dto';
import { CrearZonaDto } from './dto/crear-zona.dto';

/**
 * Casos de uso de Zona (CU-02).
 *
 * No conoce HTTP ni SQL: recibe datos ya validados y habla contra el puerto
 * ZonaRepository.
 */
@Injectable()
export class ZonasService {
  constructor(
    @Inject(ZONA_REPOSITORY)
    private readonly zonas: ZonaRepository,
  ) {}

  async crear(dto: CrearZonaDto): Promise<Zona> {
    const existente = await this.zonas.buscarPorNombre(dto.nombre);

    if (existente) {
      throw new ConflictException({
        message: `Ya existe una zona con el nombre "${dto.nombre}"`,
        code: 'ZONA_NOMBRE_DUPLICADO',
      });
    }

    return this.zonas.crear({ ...dto, bloqueada: false });
  }

  listar(): Promise<Zona[]> {
    return this.zonas.listar();
  }

  async obtener(id: string): Promise<Zona> {
    const zona = await this.zonas.buscarPorId(id);

    if (!zona) {
      throw new NotFoundException({
        message: `No existe la zona ${id}`,
        code: 'ZONA_NO_ENCONTRADA',
      });
    }

    return zona;
  }

  async actualizar(id: string, dto: ActualizarZonaDto): Promise<Zona> {
    const zona = await this.obtener(id);

    if (dto.nombre && dto.nombre !== zona.nombre) {
      const otra = await this.zonas.buscarPorNombre(dto.nombre);

      if (otra) {
        throw new ConflictException({
          message: `Ya existe una zona con el nombre "${dto.nombre}"`,
          code: 'ZONA_NOMBRE_DUPLICADO',
        });
      }
    }

    aplicarCambios(zona, dto);

    return this.zonas.guardar(zona);
  }

  /**
   * Marca o desmarca la zona como bloqueada. Lo dispara el consumo de
   * `emergencias.incidente.creado` a partir del Sprint 4; por ahora se expone
   * para poder probarlo a mano.
   */
  async cambiarBloqueo(id: string, bloqueada: boolean): Promise<Zona> {
    const zona = await this.obtener(id);
    zona.bloqueada = bloqueada;

    return this.zonas.guardar(zona);
  }

  async eliminar(id: string): Promise<void> {
    await this.obtener(id);

    const contenedores = await this.zonas.contarContenedores(id);

    if (contenedores > 0) {
      throw new ConflictException({
        message: `La zona tiene ${contenedores} contenedor(es) asociado(s). Reasignalos antes de eliminarla.`,
        code: 'ZONA_CON_CONTENEDORES',
      });
    }

    await this.zonas.eliminar(id);
  }
}
