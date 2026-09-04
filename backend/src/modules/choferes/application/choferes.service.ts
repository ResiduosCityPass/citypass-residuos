import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { aplicarCambios } from '../../../shared/application/aplicar-cambios';
import { Chofer } from '../domain/chofer.entity';
import { CHOFER_REPOSITORY, ChoferRepository } from '../domain/chofer.repository';
import { ActualizarChoferDto } from './dto/actualizar-chofer.dto';
import { CrearChoferDto } from './dto/crear-chofer.dto';

/**
 * ABM de choferes (CU-09).
 *
 * Existe para que el operador elija de una lista en vez de escribir un
 * identificador a mano. Esa es toda la razon: un identificador tipeado a mano
 * que nadie valida asigna la ruta igual y el chofer no la ve nunca.
 */
@Injectable()
export class ChoferesService {
  constructor(
    @Inject(CHOFER_REPOSITORY)
    private readonly choferes: ChoferRepository,
  ) {}

  async crear(dto: CrearChoferDto): Promise<Chofer> {
    await this.verificarLegajoLibre(dto.legajo);

    return this.choferes.crear({ ...dto, activo: true });
  }

  listar(filtro: { incluirInactivos?: boolean }): Promise<Chofer[]> {
    return this.choferes.listar({ soloActivos: !filtro.incluirInactivos });
  }

  async obtener(id: string): Promise<Chofer> {
    const chofer = await this.choferes.buscarPorId(id);

    if (!chofer) {
      throw new NotFoundException({
        message: `No existe el chofer ${id}`,
        code: 'CHOFER_NO_ENCONTRADO',
      });
    }

    return chofer;
  }

  /**
   * El chofer que corresponde a una sesion, o null si esa sesion no es de
   * ningun chofer. Lo usa CU-10 para resolver de quien es la ruta.
   */
  buscarPorUsuarioSub(sub: string): Promise<Chofer | null> {
    return this.choferes.buscarPorUsuarioSub(sub);
  }

  /**
   * Un chofer inactivo no puede recibir rutas nuevas, pero sigue existiendo:
   * las rutas que ya ejecuto lo siguen referenciando.
   */
  async obtenerActivo(id: string): Promise<Chofer> {
    const chofer = await this.obtener(id);

    if (!chofer.activo) {
      throw new ConflictException({
        message: `El chofer ${chofer.nombre} esta dado de baja`,
        code: 'CHOFER_INACTIVO',
      });
    }

    return chofer;
  }

  async actualizar(id: string, dto: ActualizarChoferDto): Promise<Chofer> {
    const chofer = await this.obtener(id);

    if (dto.legajo && dto.legajo !== chofer.legajo) {
      await this.verificarLegajoLibre(dto.legajo);
    }

    aplicarCambios(chofer, dto);

    return this.choferes.guardar(chofer);
  }

  /**
   * Baja logica. Nunca se borra: sus rutas historicas lo referencian, y son la
   * evidencia de quien ejecuto cada recoleccion.
   */
  async darDeBaja(id: string): Promise<void> {
    const chofer = await this.obtener(id);
    chofer.activo = false;

    await this.choferes.guardar(chofer);
  }

  private async verificarLegajoLibre(legajo: string): Promise<void> {
    if (await this.choferes.buscarPorLegajo(legajo)) {
      throw new ConflictException({
        message: `Ya existe un chofer con el legajo "${legajo}"`,
        code: 'CHOFER_LEGAJO_DUPLICADO',
      });
    }
  }
}
