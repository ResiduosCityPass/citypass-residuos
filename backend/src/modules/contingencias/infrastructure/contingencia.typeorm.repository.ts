import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContextoTransaccional } from '../../../shared/persistence/contexto-transaccional';
import { RepositorioTypeorm } from '../../../shared/persistence/repositorio-typeorm';
import { Contingencia, EstadoContingencia } from '../domain/contingencia.entity';
import {
  ContingenciaRepository,
  ParadaAfectable,
  ParadaClimaticaAsignada,
  RestriccionInundacion,
} from '../domain/contingencia.repository';

const RELACIONES = { zonas: { zona: true }, contenedores: { contenedor: true } } as const;

@Injectable()
export class ContingenciaTypeormRepository
  extends RepositorioTypeorm<Contingencia>
  implements ContingenciaRepository
{
  constructor(
    @InjectRepository(Contingencia) repo: Repository<Contingencia>,
    contexto: ContextoTransaccional,
  ) {
    super(repo, contexto, Contingencia);
  }

  async bloquearOperacion(): Promise<void> {
    // Siempre dentro de ContextoTransaccional; tambien serializa dos consumidores.
    await this.repo().query('SELECT pg_advisory_xact_lock(734012, 1)');
  }

  buscar(id: string) {
    return this.repo().findOne({ where: { id }, relations: RELACIONES });
  }

  listar() {
    return this.repo().find({ relations: RELACIONES, order: { iniciadaEn: 'DESC', id: 'ASC' } });
  }

  guardar(contingencia: Partial<Contingencia>) {
    // Guardar una instantanea vieja no debe eliminar impactos agregados despues.
    const { zonas: _zonas, contenedores: _contenedores, ...datos } = contingencia;
    return this.repo().save(this.repo().create(datos));
  }

  async registrarZonas(id: string, zonaIds: string[]): Promise<void> {
    await this.repo().query(
      `INSERT INTO contingencia_zona ("contingenciaId", "zonaId")
      SELECT $1::uuid, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
      [id, zonaIds],
    );
  }

  async registrarImpactos(id: string, zonaIds: string[]): Promise<void> {
    // Snapshot de trabajo pendiente. El llenado real nunca se cambia por el clima.
    await this.repo().query(
      `INSERT INTO contingencia_contenedor ("contingenciaId", "contenedorId")
      SELECT $1::uuid, c.id FROM contenedor c
      WHERE c."zonaId" = ANY($2::uuid[]) AND c.activo = true AND c."nivelLlenadoPct" > 0
      ON CONFLICT DO NOTHING`,
      [id, zonaIds],
    );
  }

  async zonasExistentes(zonaIds: string[]): Promise<number> {
    const rows = await this.repo().query<{ cantidad: string }[]>(
      'SELECT count(*) AS cantidad FROM zona WHERE id = ANY($1::uuid[])',
      [zonaIds],
    );
    return Number(rows[0].cantidad);
  }

  async zonaTieneHistorial(zonaId: string): Promise<boolean> {
    const rows = await this.repo().query<unknown[]>(
      'SELECT 1 FROM contingencia_zona WHERE "zonaId" = $1 LIMIT 1',
      [zonaId],
    );
    return rows.length > 0;
  }

  async eventoProcesado(eventId: string): Promise<{ huella: string } | null> {
    const rows = await this.repo().query<{ huella: string }[]>(
      'SELECT huella FROM evento_climatico_recibido WHERE "eventId" = $1',
      [eventId],
    );
    return rows[0] ?? null;
  }

  async registrarEvento(eventId: string, huella: string): Promise<void> {
    await this.repo().query(
      'INSERT INTO evento_climatico_recibido ("eventId", huella) VALUES ($1, $2)',
      [eventId, huella],
    );
  }

  async restricciones(): Promise<RestriccionInundacion[]> {
    return this.repo()
      .createQueryBuilder('c')
      .innerJoin('c.zonas', 'z')
      .select('z.zonaId', 'zonaId')
      .addSelect('c.id', 'contingenciaId')
      .addSelect('c.descripcion', 'descripcion')
      .addSelect('c.estado', 'estado')
      .where('c.estado IN (:...estados)', {
        estados: [EstadoContingencia.ACTIVA, EstadoContingencia.PENDIENTE_RECUPERACION],
      })
      .getRawMany<RestriccionInundacion>();
  }

  async pendientesDeRecuperacion(): Promise<string[]> {
    const rows = await this.repo().query<{ contenedorId: string }[]>(
      `SELECT DISTINCT cc."contenedorId"
      FROM contingencia_contenedor cc JOIN contingencia c ON c.id = cc."contingenciaId"
      WHERE c.estado = $1 AND cc."vaciadoEn" IS NULL`,
      [EstadoContingencia.EN_RECUPERACION],
    );
    return rows.map((r) => r.contenedorId);
  }

  async zonasBloqueadasManualmente(): Promise<string[]> {
    // `bloqueoManual`, no `bloqueada`: esa tambien la prende una emergencia que
    // corta la circulacion (CU-INT-01), y ahi el chofer tiene que poder cerrar las
    // paradas que quedaron fuera del radio. Las de adentro ya las omitio el sistema.
    const rows = await this.repo().query<{ id: string }[]>(
      'SELECT id FROM zona WHERE "bloqueoManual" = true',
    );
    return rows.map((r) => r.id);
  }

  async marcarVaciado(contenedorId: string, fecha: Date): Promise<string[]> {
    const rows = await this.repo().query<{ contingenciaId: string }[]>(
      `WITH vaciados AS (UPDATE contingencia_contenedor cc
      SET "vaciadoEn" = $2 FROM contingencia c
      WHERE c.id = cc."contingenciaId" AND c.estado = $3
        AND cc."contenedorId" = $1 AND cc."vaciadoEn" IS NULL RETURNING cc."contingenciaId")
      SELECT "contingenciaId" FROM vaciados`,
      [contenedorId, fecha, EstadoContingencia.EN_RECUPERACION],
    );
    return rows.map((r) => r.contingenciaId);
  }

  async contarPendientes(id: string): Promise<number> {
    const rows = await this.repo().query<{ cantidad: string }[]>(
      'SELECT count(*) AS cantidad FROM contingencia_contenedor WHERE "contingenciaId" = $1 AND "vaciadoEn" IS NULL',
      [id],
    );
    return Number(rows[0].cantidad);
  }

  async paradasAsignadasEnZonas(zonaIds: string[]): Promise<ParadaClimaticaAsignada[]> {
    if (zonaIds.length === 0) return [];
    return this.repo().query<ParadaClimaticaAsignada[]>(
      `SELECT p.id, m.patente AS "camionId"
      FROM parada p JOIN contenedor c ON c.id = p."contenedorId"
      JOIN ruta r ON r.id = p."rutaId" JOIN camion m ON m.id = r."camionId"
      WHERE c."zonaId" = ANY($1::uuid[]) AND p.estado = 'PENDIENTE'
        AND r.estado IN ('ASIGNADA', 'EN_CURSO')
      ORDER BY p.id`,
      [zonaIds],
    );
  }

  async paradasPendientes(rutaIds: string[]): Promise<ParadaAfectable[]> {
    if (rutaIds.length === 0) return [];
    return this.repo().query<ParadaAfectable[]>(
      `SELECT p.id, p."rutaId", c."zonaId"
      FROM parada p JOIN contenedor c ON c.id = p."contenedorId"
      WHERE p."rutaId" = ANY($1::uuid[]) AND p.estado = 'PENDIENTE'`,
      [rutaIds],
    );
  }
}
