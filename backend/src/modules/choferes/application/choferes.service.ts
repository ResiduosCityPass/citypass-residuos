import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { aplicarCambios } from '../../../shared/application/aplicar-cambios';
import {
  CREDENCIAL_CHOFER_EXPIRA_EN,
  generarCodigoChofer,
  subDeCodigoChofer,
} from '../../../shared/auth/credencial-chofer';
import { Chofer } from '../domain/chofer.entity';
import { RUTA_REPOSITORY, RutaRepository } from '../../rutas/domain/ruta.repository';
import { CHOFER_REPOSITORY, ChoferRepository } from '../domain/chofer.repository';
import { ActualizarChoferDto } from './dto/actualizar-chofer.dto';
import { CrearChoferDto } from './dto/crear-chofer.dto';

/** Credencial recien emitida. El token viaja una sola vez, como la API key del sensor. */
export interface CredencialEmitida {
  choferId: string;
  nombre: string;
  legajo: string;
  token: string;
  expiraEn: string;
}

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
    @Inject(RUTA_REPOSITORY)
    private readonly rutas: RutaRepository,
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
   * El chofer activo que corresponde a una sesion, o null. Lo usa CU-10 para
   * resolver de quien es la ruta y quien puede cerrar una parada.
   *
   * Devuelve null tambien para un chofer dado de baja, y eso es lo que hace que
   * la baja sirva como revocacion: sin login no hay sesion que cerrar, asi que
   * el unico modo de sacarle el acceso a alguien es que esta consulta deje de
   * encontrarlo. Un chofer dado de baja a mitad de turno deja de ver su ruta y
   * de poder confirmar paradas en el request siguiente.
   */
  buscarActivoPorUsuarioSub(sub: string): Promise<Chofer | null> {
    return this.choferes.buscarActivoPorUsuarioSub(sub);
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

  /** Emite un código corto; rotar su hash en usuarioSub revoca también los JWT
   * anteriores. Solo se devuelve una vez y vence a los 30 días.
   */
  async emitirCredencial(id: string): Promise<CredencialEmitida> {
    const chofer = await this.obtenerActivo(id);
    const token = generarCodigoChofer();
    chofer.usuarioSub = subDeCodigoChofer(token);
    await this.choferes.guardar(chofer);

    return {
      choferId: chofer.id,
      nombre: chofer.nombre,
      legajo: chofer.legajo,
      token,
      expiraEn: CREDENCIAL_CHOFER_EXPIRA_EN,
    };
  }

  /**
   * Baja logica. Nunca se borra: sus rutas historicas lo referencian, y son la
   * evidencia de quien ejecuto cada recoleccion.
   *
   * No se puede dar de baja a alguien con una ruta activa, y no es una
   * formalidad: la baja le saca el acceso, con lo cual deja de poder cerrar sus
   * paradas. Como la ruta solo se cierra cuando no le queda ninguna pendiente y
   * su camion solo se libera cuando la ruta cierra, dar de baja al chofer
   * equivocado dejaba el camion EN_RUTA para siempre. CU-03 tampoco deja
   * sacarlo de ese estado a mano.
   */
  async darDeBaja(id: string): Promise<void> {
    const chofer = await this.obtener(id);
    const ruta = await this.rutas.buscarActivaDeChofer(chofer.id);

    if (ruta) {
      throw new ConflictException({
        message:
          `${chofer.nombre} tiene una ruta ${ruta.estado.toLowerCase()}. ` +
          `Hay que cerrarla antes de darlo de baja`,
        code: 'CHOFER_CON_RUTA_ACTIVA',
      });
    }

    chofer.activo = false;

    await this.choferes.guardar(chofer);
  }

  /**
   * Deshace la baja. Sin esto un clic equivocado era permanente: el chofer no
   * volvia, y como el legajo es unico tampoco se lo podia dar de alta de nuevo.
   */
  async reactivar(id: string): Promise<Chofer> {
    const chofer = await this.obtener(id);
    chofer.activo = true;

    return this.choferes.guardar(chofer);
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
