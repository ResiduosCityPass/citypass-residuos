import { MigrationInterface, QueryRunner } from 'typeorm';

export class EsquemaInicial1788389632824 implements MigrationInterface {
  name = 'EsquemaInicial1788389632824';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sensor_estado_enum" AS ENUM('ACTIVO', 'SIN_SENAL', 'BATERIA_BAJA', 'INACTIVO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sensor" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(20) NOT NULL, "contenedorId" uuid NOT NULL, "apiKeyHash" character varying(120) NOT NULL, "estado" "public"."sensor_estado_enum" NOT NULL DEFAULT 'ACTIVO', "bateriaPct" integer, "ultimoReporteEn" TIMESTAMP WITH TIME ZONE, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_dc38d26f3551fc6fff2f4315c94" UNIQUE ("codigo"), CONSTRAINT "UQ_d426b364035c30a95fd1a297b5c" UNIQUE ("contenedorId"), CONSTRAINT "REL_d426b364035c30a95fd1a297b5" UNIQUE ("contenedorId"), CONSTRAINT "PK_ccc38b9aa8b3e198b6503d5eee9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4b4cb8e5c92b81e30b6c108c09" ON "sensor" ("apiKeyHash") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."contenedor_tiporesiduo_enum" AS ENUM('COMUN', 'RECICLABLE', 'ORGANICO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."contenedor_estado_enum" AS ENUM('NORMAL', 'ADVERTENCIA', 'CRITICO', 'FUERA_DE_SERVICIO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "contenedor" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(20) NOT NULL, "zonaId" uuid NOT NULL, "tipoResiduo" "public"."contenedor_tiporesiduo_enum" NOT NULL, "capacidadLitros" integer NOT NULL, "lat" numeric(10,7) NOT NULL, "lng" numeric(10,7) NOT NULL, "estado" "public"."contenedor_estado_enum" NOT NULL DEFAULT 'NORMAL', "nivelLlenadoPct" numeric(5,2) NOT NULL DEFAULT '0', "temperaturaC" numeric(5,2), "ultimaLecturaEn" TIMESTAMP WITH TIME ZONE, "activo" boolean NOT NULL DEFAULT true, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_4bd61fa156dda0c3a378cdb1cd0" UNIQUE ("codigo"), CONSTRAINT "PK_1f75e9b3e781063dcfa45ddb36b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_64df06f318c3a077aac300b507" ON "contenedor" ("zonaId", "estado") `,
    );
    await queryRunner.query(
      `CREATE TABLE "zona" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(80) NOT NULL, "umbralCriticoPct" integer NOT NULL, "umbralTemperaturaC" integer NOT NULL, "bloqueada" boolean NOT NULL DEFAULT false, "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_98d9092625727fb46bc4aa13237" UNIQUE ("nombre"), CONSTRAINT "PK_3a6cfcf317ea20ea08421eab0a5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "lectura" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "contenedorId" uuid NOT NULL, "nivelLlenadoPct" numeric(5,2) NOT NULL, "temperaturaC" numeric(5,2) NOT NULL, "bateriaPct" integer NOT NULL, "registradaEn" TIMESTAMP WITH TIME ZONE NOT NULL, "recibidaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_27e8ea81a2c18f5f4742ed42f4e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_lectura_contenedor_fecha" ON "lectura" ("contenedorId", "registradaEn") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."camion_tiporesiduohabilitado_enum" AS ENUM('COMUN', 'RECICLABLE', 'ORGANICO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."camion_estado_enum" AS ENUM('DISPONIBLE', 'EN_RUTA', 'MANTENIMIENTO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "camion" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "patente" character varying(20) NOT NULL, "capacidadLitros" integer NOT NULL, "tipoResiduoHabilitado" "public"."camion_tiporesiduohabilitado_enum" NOT NULL, "estado" "public"."camion_estado_enum" NOT NULL DEFAULT 'DISPONIBLE', "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_df31aeb90b08c5692281f173d19" UNIQUE ("patente"), CONSTRAINT "PK_848910dbd18de3231e3c30a745d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_08297b84a596b5989044e8494e" ON "camion" ("estado", "tipoResiduoHabilitado") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerta_tipo_enum" AS ENUM('SATURACION', 'INCENDIO', 'SENSOR_CAIDO', 'BATERIA_BAJA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerta_severidad_enum" AS ENUM('BAJA', 'MEDIA', 'ALTA', 'CRITICA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerta_estado_enum" AS ENUM('ABIERTA', 'EN_ATENCION', 'RESUELTA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "alerta" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "contenedorId" uuid NOT NULL, "tipo" "public"."alerta_tipo_enum" NOT NULL, "severidad" "public"."alerta_severidad_enum" NOT NULL, "estado" "public"."alerta_estado_enum" NOT NULL DEFAULT 'ABIERTA', "detalle" text, "detectadaEn" TIMESTAMP WITH TIME ZONE NOT NULL, "resueltaEn" TIMESTAMP WITH TIME ZONE, "creadaEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e60bfc27e2ae1b6bbdca11ac524" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bf4c9c98ab23da4500bb1abf04" ON "alerta" ("contenedorId", "tipo", "estado") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sensor" ADD CONSTRAINT "FK_d426b364035c30a95fd1a297b5c" FOREIGN KEY ("contenedorId") REFERENCES "contenedor"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contenedor" ADD CONSTRAINT "FK_336fb78e92425b0b4750d36faca" FOREIGN KEY ("zonaId") REFERENCES "zona"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lectura" ADD CONSTRAINT "FK_8000508aaf643abbab68a1bc474" FOREIGN KEY ("contenedorId") REFERENCES "contenedor"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerta" ADD CONSTRAINT "FK_f1622c7962e2523627ca54c63ae" FOREIGN KEY ("contenedorId") REFERENCES "contenedor"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "alerta" DROP CONSTRAINT "FK_f1622c7962e2523627ca54c63ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lectura" DROP CONSTRAINT "FK_8000508aaf643abbab68a1bc474"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contenedor" DROP CONSTRAINT "FK_336fb78e92425b0b4750d36faca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sensor" DROP CONSTRAINT "FK_d426b364035c30a95fd1a297b5c"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bf4c9c98ab23da4500bb1abf04"`);
    await queryRunner.query(`DROP TABLE "alerta"`);
    await queryRunner.query(`DROP TYPE "public"."alerta_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."alerta_severidad_enum"`);
    await queryRunner.query(`DROP TYPE "public"."alerta_tipo_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_08297b84a596b5989044e8494e"`);
    await queryRunner.query(`DROP TABLE "camion"`);
    await queryRunner.query(`DROP TYPE "public"."camion_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."camion_tiporesiduohabilitado_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_lectura_contenedor_fecha"`);
    await queryRunner.query(`DROP TABLE "lectura"`);
    await queryRunner.query(`DROP TABLE "zona"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_64df06f318c3a077aac300b507"`);
    await queryRunner.query(`DROP TABLE "contenedor"`);
    await queryRunner.query(`DROP TYPE "public"."contenedor_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."contenedor_tiporesiduo_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4b4cb8e5c92b81e30b6c108c09"`);
    await queryRunner.query(`DROP TABLE "sensor"`);
    await queryRunner.query(`DROP TYPE "public"."sensor_estado_enum"`);
  }
}
