import { MigrationInterface, QueryRunner } from 'typeorm';

export class TablaOutbox1788390637827 implements MigrationInterface {
  name = 'TablaOutbox1788390637827';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."evento_pendiente_estado_enum" AS ENUM('PENDIENTE', 'PUBLICADO', 'FALLIDO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "evento_pendiente" ("eventId" uuid NOT NULL, "eventType" character varying(120) NOT NULL, "sobre" jsonb NOT NULL, "estado" "public"."evento_pendiente_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "intentos" integer NOT NULL DEFAULT '0', "ultimoError" text, "proximoIntentoEn" TIMESTAMP WITH TIME ZONE NOT NULL, "publicadoEn" TIMESTAMP WITH TIME ZONE, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_96a49b11d9d99df9d329e407f9c" PRIMARY KEY ("eventId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4b21d93789a779761a983fbbba" ON "evento_pendiente" ("estado", "proximoIntentoEn") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_4b21d93789a779761a983fbbba"`);
    await queryRunner.query(`DROP TABLE "evento_pendiente"`);
    await queryRunner.query(`DROP TYPE "public"."evento_pendiente_estado_enum"`);
  }
}
