import { MigrationInterface, QueryRunner } from 'typeorm';

/** Squad 3: actividades masivas de Espacios con sus contenedores cercanos. */
export class ActividadMasiva1792708905000 implements MigrationInterface {
  name = 'ActividadMasiva1792708905000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "actividad_masiva" ("actividadId" character varying(64) NOT NULL, "titulo" character varying(200), "capacidad" integer NOT NULL, "lat" double precision NOT NULL, "lng" double precision NOT NULL, "inicio" TIMESTAMP WITH TIME ZONE NOT NULL, "fin" TIMESTAMP WITH TIME ZONE NOT NULL, "contenedorIds" jsonb NOT NULL, "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_actividad_masiva" PRIMARY KEY ("actividadId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "actividad_masiva"`);
  }
}
