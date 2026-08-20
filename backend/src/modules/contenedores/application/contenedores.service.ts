import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

    Object.assign(contenedor, dto);

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
