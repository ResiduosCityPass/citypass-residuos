import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { aplicarCambios } from '../../../shared/application/aplicar-cambios';
import { EstadoContenedor } from '../../../shared/domain/enums';
// Regla de CU-05, no del modulo de lecturas: es una funcion pura sobre numeros.
// Reimplementar acá la comparacion contra el umbral seria tener dos verdades.
import { evaluarEstadoContenedor } from '../../lecturas/domain/reglas/evaluador-estado';
import { ZonasService } from '../../zonas/application/zonas.service';
import { generarApiKey, hashearApiKey } from '../domain/api-key';
import { Contenedor } from '../domain/contenedor.entity';
import {
  CONTENEDOR_REPOSITORY,
  ContenedorRepository,
  FiltroContenedores,
} from '../domain/contenedor.repository';
import { Sensor } from '../domain/sensor.entity';
import { SENSOR_REPOSITORY, SensorRepository } from '../domain/sensor.repository';
import { ActualizarContenedorDto } from './dto/actualizar-contenedor.dto';
import { CrearContenedorDto } from './dto/crear-contenedor.dto';
import { VincularSensorDto } from './dto/vincular-sensor.dto';

/** Resultado de vincular un sensor: la API key en claro viaja una unica vez. */
export interface SensorVinculado {
  sensor: Sensor;
  apiKey: string;
}

/** Casos de uso de Contenedor y Sensor (CU-01). */
@Injectable()
export class ContenedoresService {
  constructor(
    @Inject(CONTENEDOR_REPOSITORY)
    private readonly contenedores: ContenedorRepository,
    @Inject(SENSOR_REPOSITORY)
    private readonly sensores: SensorRepository,
    private readonly zonas: ZonasService,
  ) {}

  async crear(dto: CrearContenedorDto): Promise<Contenedor> {
    // Valida que la zona exista: lanza 404 si no. Sin zona no hay umbral que aplicar.
    await this.zonas.obtener(dto.zonaId);

    const codigo = dto.codigo ?? (await this.generarCodigo());
    const existente = await this.contenedores.buscarPorCodigo(codigo);

    if (existente) {
      throw new ConflictException({
        message: `Ya existe un contenedor con el codigo "${codigo}"`,
        code: 'CONTENEDOR_CODIGO_DUPLICADO',
      });
    }

    return this.contenedores.crear({ ...dto, codigo, activo: true });
  }

  listar(filtro: FiltroContenedores): Promise<Contenedor[]> {
    return this.contenedores.listar({ ...filtro, soloActivos: true });
  }

  async obtener(id: string): Promise<Contenedor> {
    const contenedor = await this.contenedores.buscarPorId(id);

    if (!contenedor) {
      throw new NotFoundException({
        message: `No existe el contenedor ${id}`,
        code: 'CONTENEDOR_NO_ENCONTRADO',
      });
    }

    return contenedor;
  }

  async actualizar(id: string, dto: ActualizarContenedorDto): Promise<Contenedor> {
    const contenedor = await this.obtener(id);

    if (dto.zonaId && dto.zonaId !== contenedor.zonaId) {
      await this.zonas.obtener(dto.zonaId);
    }

    aplicarCambios(contenedor, dto);

    return this.contenedores.guardar(contenedor);
  }

  /**
   * Pone el contenedor fuera de servicio, o lo reintegra.
   *
   * No viaja en el `PATCH` general a proposito. `estado` es de la maquina de
   * reglas: NORMAL, ADVERTENCIA y CRITICO los decide la lectura del sensor
   * (CU-05), y dejarlos editar a mano seria pelearle al motor que los calcula.
   * FUERA_DE_SERVICIO es lo unico que decide una persona, y es un acto
   * operativo, no la edicion de un campo. Mismo criterio que el bloqueo de
   * zonas (CU-02) y que el estado del camion (CU-03).
   *
   * Mientras esta fuera de servicio ninguna lectura le cambia el estado —el
   * evaluador de CU-05 ya lo respeta— y el ruteo de CU-08 no lo elige, porque
   * solo toma contenedores CRITICO.
   *
   * Al reintegrarlo NO vuelve a NORMAL a ciegas: se lo reevalua contra el
   * umbral de su zona con el ultimo nivel conocido. Un contenedor que quedo al
   * 92% tiene que volver en rojo. Las alertas abiertas no se tocan ni al salir
   * ni al volver: el contenedor sigue lleno, y esa alerta es justamente lo que
   * hace falta que alguien atienda.
   */
  async cambiarServicio(id: string, fueraDeServicio: boolean): Promise<Contenedor> {
    const contenedor = await this.obtener(id);
    const estaFuera = contenedor.estado === EstadoContenedor.FUERA_DE_SERVICIO;

    // Idempotente: pedir dos veces lo mismo no es un error ni cambia nada.
    if (fueraDeServicio === estaFuera) {
      return contenedor;
    }

    if (fueraDeServicio) {
      contenedor.estado = EstadoContenedor.FUERA_DE_SERVICIO;
    } else {
      const zona = await this.zonas.obtener(contenedor.zonaId);

      contenedor.estado = evaluarEstadoContenedor(
        {
          nivelLlenadoPct: contenedor.nivelLlenadoPct,
          temperaturaC: contenedor.temperaturaC ?? 0,
        },
        zona,
        // Se pasa NORMAL como estado actual porque el evaluador cortocircuita
        // cuando el estado que recibe ya es FUERA_DE_SERVICIO, que es justo lo
        // que estamos dejando atras.
        EstadoContenedor.NORMAL,
      );
    }

    return this.contenedores.guardar(contenedor);
  }

  /**
   * Baja logica. Nunca se borra fisicamente: la tabla de lecturas guarda el
   * historico del contenedor y es la fuente de verdad de CU-12.
   */
  async darDeBaja(id: string): Promise<void> {
    const contenedor = await this.obtener(id);
    contenedor.activo = false;

    await this.contenedores.guardar(contenedor);
  }

  /**
   * CU-01 · Vincula un sensor al contenedor y devuelve la API key en claro.
   *
   * Es la unica vez que la key existe fuera del dispositivo: se persiste hasheada.
   * Si se pierde, hay que revincular y generar una nueva.
   */
  async vincularSensor(contenedorId: string, dto: VincularSensorDto): Promise<SensorVinculado> {
    await this.obtener(contenedorId);

    const yaVinculado = await this.sensores.buscarPorContenedor(contenedorId);

    if (yaVinculado) {
      throw new ConflictException({
        message: `El contenedor ya tiene el sensor ${yaVinculado.codigo} vinculado`,
        code: 'CONTENEDOR_YA_TIENE_SENSOR',
      });
    }

    const codigo = dto.codigo ?? (await this.generarCodigoSensor());

    if (await this.sensores.buscarPorCodigo(codigo)) {
      throw new ConflictException({
        message: `Ya existe un sensor con el codigo "${codigo}"`,
        code: 'SENSOR_CODIGO_DUPLICADO',
      });
    }

    const apiKey = generarApiKey();
    const sensor = await this.sensores.crear({
      codigo,
      contenedorId,
      apiKeyHash: hashearApiKey(apiKey),
    });

    return { sensor, apiKey };
  }

  private async generarCodigo(): Promise<string> {
    const total = await this.contenedores.contar();

    return `CT-${String(total + 1).padStart(4, '0')}`;
  }

  private async generarCodigoSensor(): Promise<string> {
    const total = await this.sensores.contar();

    return `SN-${String(total + 1).padStart(4, '0')}`;
  }
}
