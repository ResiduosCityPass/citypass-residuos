import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-INT-02: alerta para el operador cuando un auto tapa un contenedor. */
export class AlertaAccesoBloqueado1793491204000 implements MigrationInterface {
  name = 'AlertaAccesoBloqueado1793491204000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."alerta_tipo_enum" ADD VALUE IF NOT EXISTS 'ACCESO_BLOQUEADO'`,
    );
  }

  /** Postgres no saca valores de un enum: se rehace el tipo sin las alertas de acceso bloqueado. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "alerta" WHERE "tipo" = 'ACCESO_BLOQUEADO'`);
    await queryRunner.query(
      `ALTER TYPE "public"."alerta_tipo_enum" RENAME TO "alerta_tipo_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerta_tipo_enum" AS ENUM('SATURACION', 'INCENDIO', 'SENSOR_CAIDO', 'BATERIA_BAJA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerta" ALTER COLUMN "tipo" TYPE "public"."alerta_tipo_enum" USING "tipo"::text::"public"."alerta_tipo_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."alerta_tipo_enum_old"`);
  }
}
