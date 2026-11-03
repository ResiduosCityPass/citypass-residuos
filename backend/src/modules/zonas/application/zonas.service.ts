import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { aplicarCambios } from '../../../shared/application/aplicar-cambios';
import { Zona } from '../domain/zona.entity';
import { ZONA_REPOSITORY, ZonaRepository } from '../domain/zona.repository';
import { ActualizarZonaDto } from './dto/actualizar-zona.dto';
import { CrearZonaDto } from './dto/crear-zona.dto';
import { ContingenciasService } from '../../contingencias/application/contingencias.service';

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
    private readonly contingencias: ContingenciasService,
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

  async listar(): Promise<Zona[]> {
    return this.contingencias.decorarZonas(await this.zonas.listar());
  }

  async obtener(id: string): Promise<Zona> {
    const zona = await this.zonas.buscarPorId(id);

    if (!zona) {
      throw new NotFoundException({
        message: `No existe la zona ${id}`,
        code: 'ZONA_NO_ENCONTRADA',
      });
    }

    return (await this.contingencias.decorarZonas([zona]))[0];
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
   * Marca o desmarca el bloqueo manual sin retirar restricciones climaticas.
   */
  async cambiarBloqueo(id: string, bloqueada: boolean): Promise<Zona> {
    const zona = await this.obtener(id);
    zona.bloqueada = bloqueada;

    return this.zonas.guardar(zona);
  }

  async eliminar(id: string): Promise<void> {
    await this.obtener(id);

    if (await this.contingencias.zonaTieneHistorial(id)) {
      throw new ConflictException({
        code: 'ZONA_CON_CONTINGENCIAS',
        message: 'La zona tiene historial de inundaciones y debe conservarse.',
      });
    }

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
