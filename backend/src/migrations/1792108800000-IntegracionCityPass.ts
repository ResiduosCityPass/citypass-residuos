import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-INT-01: integracion con el bus de CityPass+ (eventos recibidos, refuerzos y bloqueos). */
export class IntegracionCityPass1792108800000 implements MigrationInterface {
  name = 'IntegracionCityPass1792108800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evento_recibido" ("eventId" character varying(64) NOT NULL, "eventType" character varying(150) NOT NULL, "recibidoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_evento_recibido" PRIMARY KEY ("eventId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "refuerzo_evento" ("eventoId" character varying(64) NOT NULL, "zona" character varying(120), "contenedorIds" jsonb NOT NULL, "desde" TIMESTAMP WITH TIME ZONE NOT NULL, "hasta" TIMESTAMP WITH TIME ZONE NOT NULL, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_refuerzo_evento" PRIMARY KEY ("eventoId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refuerzo_evento_vigencia" ON "refuerzo_evento" ("desde", "hasta") `,
    );
    await queryRunner.query(
      `CREATE TABLE "bloqueo_por_incidente" ("emergenciaId" character varying(64) NOT NULL, "zonaIds" jsonb NOT NULL, "activo" boolean NOT NULL DEFAULT true, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bloqueo_por_incidente" PRIMARY KEY ("emergenciaId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bloqueo_por_incidente"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refuerzo_evento_vigencia"`);
    await queryRunner.query(`DROP TABLE "refuerzo_evento"`);
    await queryRunner.query(`DROP TABLE "evento_recibido"`);
  }
}
