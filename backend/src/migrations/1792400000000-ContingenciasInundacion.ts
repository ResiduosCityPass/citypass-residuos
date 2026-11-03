import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContingenciasInundacion1792400000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE contingencia (
      id uuid PRIMARY KEY, descripcion varchar(200) NOT NULL,
      estado varchar(30) NOT NULL CHECK (estado IN ('ACTIVA', 'PENDIENTE_RECUPERACION', 'EN_RECUPERACION', 'RECUPERADA')),
      revision integer NOT NULL CHECK (revision > 0), "iniciadaEn" timestamptz NOT NULL,
      "finalizadaEn" timestamptz, "recuperacionEn" timestamptz, "recuperadaEn" timestamptz,
      "correlationId" uuid NOT NULL
    )`);
    await q.query(`CREATE TABLE contingencia_zona (
      "contingenciaId" uuid NOT NULL REFERENCES contingencia(id) ON DELETE CASCADE,
      "zonaId" uuid NOT NULL REFERENCES zona(id) ON DELETE RESTRICT,
      PRIMARY KEY ("contingenciaId", "zonaId")
    )`);
    await q.query(`CREATE INDEX "idx_contingencia_zona" ON contingencia_zona ("zonaId")`);
    await q.query(`CREATE TABLE contingencia_contenedor (
      "contingenciaId" uuid NOT NULL REFERENCES contingencia(id) ON DELETE CASCADE,
      "contenedorId" uuid NOT NULL REFERENCES contenedor(id) ON DELETE RESTRICT,
      "vaciadoEn" timestamptz,
      PRIMARY KEY ("contingenciaId", "contenedorId")
    )`);
    await q.query(
      `CREATE INDEX "idx_contingencia_contenedor" ON contingencia_contenedor ("contenedorId")`,
    );
    await q.query(
      `CREATE TABLE evento_climatico_recibido ("eventId" uuid PRIMARY KEY, huella varchar(64) NOT NULL)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE evento_climatico_recibido');
    await q.query('DROP TABLE contingencia_contenedor');
    await q.query('DROP TABLE contingencia_zona');
    await q.query('DROP TABLE contingencia');
  }
}
