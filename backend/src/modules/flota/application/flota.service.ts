import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { aplicarCambios } from '../../../shared/application/aplicar-cambios';
import { EstadoCamion } from '../../../shared/domain/enums';
import { Camion } from '../domain/camion.entity';
import { CAMION_REPOSITORY, CamionRepository, FiltroCamiones } from '../domain/camion.repository';
import { normalizarPatente } from '../domain/reglas/patente';
import { ActualizarCamionDto } from './dto/actualizar-camion.dto';
import { CrearCamionDto } from './dto/crear-camion.dto';

/**
 * CU-03 · Gestionar flota.
 *
 * ABM chico y a proposito: el caso de uso solo aporta valor junto con CU-08, que
 * es quien consume la capacidad y el tipo de residuo habilitado de cada camion.
 *
 * **No hay baja.** Un camion borrado seguiria colgando de las rutas historicas
 * que ejecuto. Para sacarlo de circulacion se lo pasa a MANTENIMIENTO.
 */
@Injectable()
export class FlotaService {
  constructor(
    @Inject(CAMION_REPOSITORY)
    private readonly camiones: CamionRepository,
  ) {}

  async crear(dto: CrearCamionDto): Promise<Camion> {
    const patente = normalizarPatente(dto.patente);
    await this.verificarPatenteLibre(patente);

    return this.camiones.crear({
      ...dto,
      patente,
      // Todo camion nace disponible: no hay ninguna ruta a la que pertenezca todavia.
      estado: EstadoCamion.DISPONIBLE,
    });
  }

  listar(filtro: FiltroCamiones): Promise<Camion[]> {
    return this.camiones.listar(filtro);
  }

  async obtener(id: string): Promise<Camion> {
    const camion = await this.camiones.buscarPorId(id);

    if (!camion) {
      throw new NotFoundException({
        message: `No existe el camion ${id}`,
        code: 'CAMION_NO_ENCONTRADO',
      });
    }

    return camion;
  }

  async actualizar(id: string, dto: ActualizarCamionDto): Promise<Camion> {
    const camion = await this.obtener(id);

    // Un camion en ruta no se manda a mantenimiento por el medio: quedaria una
    // ruta viva apuntando a un camion que ya no esta circulando. Primero se
    // cierra o cancela la ruta.
    if (camion.estado === EstadoCamion.EN_RUTA && dto.estado && dto.estado !== camion.estado) {
      throw new ConflictException({
        message:
          `El camion ${camion.patente} esta en ruta: cerra o cancela su ruta antes de ` +
          `cambiarle el estado.`,
        code: 'CAMION_EN_RUTA',
      });
    }

    if (dto.patente) {
      const patente = normalizarPatente(dto.patente);

      if (patente !== camion.patente) {
        await this.verificarPatenteLibre(patente);
      }

      camion.patente = patente;
    }

    const { patente: _ignorada, ...resto } = dto;
    aplicarCambios(camion, resto);

    return this.camiones.guardar(camion);
  }

  private async verificarPatenteLibre(patente: string): Promise<void> {
    const existente = await this.camiones.buscarPorPatente(patente);

    if (existente) {
      throw new ConflictException({
        message: `Ya existe un camion con la patente "${patente}"`,
        code: 'CAMION_PATENTE_DUPLICADA',
      });
    }
  }
}
