import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-01 de Emergencias (A7): intervencion programada cuando la causa fue residuos. */
export class Intervencion1792281600000 implements MigrationInterface {
  name = 'Intervencion1792281600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "intervencion" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "emergenciaId" character varying(64) NOT NULL, "lat" numeric(10,7) NOT NULL, "lng" numeric(10,7) NOT NULL, "contenedorId" uuid, "distanciaMetros" integer, "estado" character varying(20) NOT NULL DEFAULT 'PROGRAMADA', "programadaEn" TIMESTAMP WITH TIME ZONE NOT NULL, "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_intervencion" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_intervencion_emergenciaId" ON "intervencion" ("emergenciaId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_intervencion_emergenciaId"`);
    await queryRunner.query(`DROP TABLE "intervencion"`);
  }
}
