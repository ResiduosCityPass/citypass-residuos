import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-INT-02: contenedores tapados por un auto denunciado en un reclamo. */
export class ObstruccionPorReclamo1792540800000 implements MigrationInterface {
  name = 'ObstruccionPorReclamo1792540800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "obstruccion_por_reclamo" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reclamoId" character varying(64) NOT NULL, "contenedorId" uuid NOT NULL, "distanciaMetros" numeric(7,1) NOT NULL, "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "venceEn" TIMESTAMP WITH TIME ZONE NOT NULL, "resueltaEn" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_obstruccion_por_reclamo" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_obstruccion_reclamo_contenedor" ON "obstruccion_por_reclamo" ("reclamoId", "contenedorId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "obstruccion_por_reclamo" ADD CONSTRAINT "FK_obstruccion_contenedor" FOREIGN KEY ("contenedorId") REFERENCES "contenedor"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "obstruccion_por_reclamo" DROP CONSTRAINT "FK_obstruccion_contenedor"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_obstruccion_reclamo_contenedor"`);
    await queryRunner.query(`DROP TABLE "obstruccion_por_reclamo"`);
  }
}
