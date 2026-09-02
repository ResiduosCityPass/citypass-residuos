import { MigrationInterface, QueryRunner } from 'typeorm';

export class RutasYParadas1788391577479 implements MigrationInterface {
  name = 'RutasYParadas1788391577479';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."parada_estado_enum" AS ENUM('PENDIENTE', 'CONFIRMADA', 'OMITIDA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "parada" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rutaId" uuid NOT NULL, "contenedorId" uuid NOT NULL, "orden" integer NOT NULL, "estado" "public"."parada_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "confirmadaEn" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_1e678c6b27dedb86d39b1774547" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6d5e4e15ac5ac9147cf434d5bf" ON "parada" ("rutaId", "orden") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ruta_estado_enum" AS ENUM('PROPUESTA', 'ASIGNADA', 'EN_CURSO', 'COMPLETADA', 'CANCELADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ruta" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "camionId" uuid NOT NULL, "choferId" character varying(120), "estado" "public"."ruta_estado_enum" NOT NULL DEFAULT 'PROPUESTA', "distanciaEstimadaKm" numeric(8,1) NOT NULL, "litrosEstimados" integer NOT NULL, "generadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "asignadaEn" TIMESTAMP WITH TIME ZONE, "completadaEn" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_0cc6eb7ab543d3367ef7848c88f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3845ac02d47f0dd4f9321e2727" ON "ruta" ("choferId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_5fa371c43686a433a9f708fa2b" ON "ruta" ("estado") `);
    await queryRunner.query(
      `ALTER TABLE "parada" ADD CONSTRAINT "FK_6d2afff7e9f0a22373d48897737" FOREIGN KEY ("rutaId") REFERENCES "ruta"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "parada" ADD CONSTRAINT "FK_e733188d823a75de7eab10ef1ad" FOREIGN KEY ("contenedorId") REFERENCES "contenedor"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ruta" ADD CONSTRAINT "FK_597c3bac9e65e303166e7efcbc4" FOREIGN KEY ("camionId") REFERENCES "camion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ruta" DROP CONSTRAINT "FK_597c3bac9e65e303166e7efcbc4"`);
    await queryRunner.query(
      `ALTER TABLE "parada" DROP CONSTRAINT "FK_e733188d823a75de7eab10ef1ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "parada" DROP CONSTRAINT "FK_6d2afff7e9f0a22373d48897737"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_5fa371c43686a433a9f708fa2b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3845ac02d47f0dd4f9321e2727"`);
    await queryRunner.query(`DROP TABLE "ruta"`);
    await queryRunner.query(`DROP TYPE "public"."ruta_estado_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6d5e4e15ac5ac9147cf434d5bf"`);
    await queryRunner.query(`DROP TABLE "parada"`);
    await queryRunner.query(`DROP TYPE "public"."parada_estado_enum"`);
  }
}
