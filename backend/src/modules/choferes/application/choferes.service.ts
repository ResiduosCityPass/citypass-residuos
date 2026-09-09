import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { aplicarCambios } from '../../../shared/application/aplicar-cambios';
import { EMISOR_CHOFERES_DEFAULT } from '../../../config/env.validation';
import {
  CREDENCIAL_CHOFER_EXPIRA_EN,
  generarSubDeChofer,
  payloadDeCredencialChofer,
} from '../../../shared/auth/credencial-chofer';
import { Chofer } from '../domain/chofer.entity';
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
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  /**
   * Emite la credencial con la que el chofer entra a la pantalla de CU-10.
   *
   * Mismo trato que la API key del sensor: se muestra una sola vez y no se
   * puede volver a consultar. La diferencia es que no hace falta guardarla, ni
   * siquiera hasheada — un JWT se valida con su firma, asi que el backend no
   * necesita recordar nada.
   *
   * Lo que se guarda es el `usuarioSub`, y ROTARLO ES LO QUE REVOCA. Emitir una
   * credencial nueva genera un `sub` nuevo, y las credenciales anteriores de ese
   * chofer dejan de resolver contra nadie: quedan muertas en el acto, aunque su
   * firma siga siendo valida y falte un mes para que venzan.
   *
   * Eso da dos niveles de revocacion, que es justo lo que faltaba: perder el
   * celular se resuelve emitiendo otra credencial, sin sacar al chofer de
   * circulacion; que la persona deje de trabajar se resuelve dandola de baja.
   *
   * El precio: emitir dos veces por error deja al chofer afuera hasta que le
   * pasen la nueva. Es el mismo precio que revincular un sensor, y se paga por
   * la misma razon.
   */
  async emitirCredencial(id: string): Promise<CredencialEmitida> {
    const chofer = await this.obtenerActivo(id);

    chofer.usuarioSub = generarSubDeChofer();
    await this.choferes.guardar(chofer);

    const token = this.jwt.sign(payloadDeCredencialChofer(chofer.usuarioSub, chofer.legajo), {
      expiresIn: CREDENCIAL_CHOFER_EXPIRA_EN,
      // Emisor propio, distinto del humano. El guard cruza `token_use` contra
      // `iss`, asi que firmar con el emisor equivocado rechaza el token aunque
      // todo lo demas este bien.
      issuer: this.config.get<string>('JWT_ISSUER_CHOFERES', EMISOR_CHOFERES_DEFAULT),
    });

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
