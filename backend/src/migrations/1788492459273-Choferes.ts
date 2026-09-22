import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los choferes pasan a ser una entidad de este modulo, y `ruta.choferId` deja de
 * ser texto libre para ser una clave foranea.
 *
 * La conversion NO puede ser un DROP COLUMN + ADD COLUMN, que es lo que genera
 * el CLI: eso deja sin chofer a todas las rutas ya asignadas, y esas rutas son
 * el registro de quien ejecuto cada recoleccion. Se hace en tres pasos: se crean
 * los choferes que hoy existen como texto, se traduce cada ruta a su id, y
 * recien ahi se reemplaza la columna.
 *
 * Verificada sobre datos legacy, no solo sobre una base vacia: con rutas
 * escritas a mano -incluidos dos identificadores de 55 caracteres que comparten
 * los primeros 51- cada texto distinto queda en un chofer propio, ninguna ruta
 * pierde a quien la ejecuto, y el `down()` devuelve el texto original exacto.
 * El CI solo ejercita el camino desde una base vacia, asi que esa parte se
 * probo a mano.
 */
export class Choferes1788492459273 implements MigrationInterface {
  name = 'Choferes1788492459273';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chofer" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(120) NOT NULL, "legajo" character varying(40) NOT NULL, "usuarioSub" character varying(120), "activo" boolean NOT NULL DEFAULT true, "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_86bc63c05d0382a6bb24c197414" UNIQUE ("legajo"), CONSTRAINT "PK_c19ca04e2368a844b8420650c48" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5db2a677227084c5b61ca44e21" ON "chofer" ("usuarioSub") WHERE "usuarioSub" IS NOT NULL`,
    );

    // Un chofer por cada identificador que hoy aparece escrito a mano en alguna
    // ruta. El nombre queda igual al identificador porque es lo unico que
    // sabemos de esa persona: alguien lo tipeo en un campo de texto. Hay que
    // corregirlo a mano despues, pero la ruta no pierde a quien la ejecuto.
    //
    // `usuarioSub` queda NULL a proposito, y NO copiando el texto viejo. Los
    // identificadores que emite el ABM son 48 caracteres aleatorios justamente
    // para que tener uno no permita deducir otro; arrastrar aca un "jperez"
    // dejaria en la tabla un identificador de sesion adivinable, que es lo
    // contrario de lo que el resto del esquema garantiza.
    //
    // Un chofer sin `usuarioSub` es un caso previsto: existe en la operacion y
    // se le pueden asignar rutas, pero no entra hasta que alguien le emita una
    // credencial. Que es exactamente la situacion de alguien que hasta ayer era
    // un texto en un campo. El indice unico es parcial, asi que varios NULL
    // conviven sin chocar.
    //
    // El texto viejo admitia 120 caracteres y `legajo` tiene 40. Sin recortarlo,
    // un solo identificador largo hacia fallar el INSERT, y como en produccion
    // las migraciones corren al arrancar, el contenedor no levantaba. Los largos
    // se recortan y se les agrega un sufijo del hash del texto completo, para que
    // dos identificadores que comparten los primeros caracteres no choquen contra
    // la unicidad del legajo. El texto entero queda en `nombre`, que es de 120.
    await queryRunner.query(
      `INSERT INTO "chofer" ("nombre", "legajo")
       SELECT "choferId",
              CASE WHEN length("choferId") <= 40 THEN "choferId"
                   ELSE left("choferId", 31) || '-' || left(md5("choferId"), 8)
              END
       FROM (SELECT DISTINCT "choferId" FROM "ruta" WHERE "choferId" IS NOT NULL) AS viejos`,
    );

    // Se cruza por `nombre`, que tiene el texto completo: el legajo pudo quedar
    // recortado. Dentro de esta migracion `nombre` es unico, porque cada chofer
    // sale de un DISTINCT sobre ese mismo texto.
    await queryRunner.query(`ALTER TABLE "ruta" ADD "choferIdNuevo" uuid`);
    await queryRunner.query(
      `UPDATE "ruta" SET "choferIdNuevo" = "chofer"."id"
       FROM "chofer"
       WHERE "chofer"."nombre" = "ruta"."choferId"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_3845ac02d47f0dd4f9321e2727"`);
    await queryRunner.query(`ALTER TABLE "ruta" DROP COLUMN "choferId"`);
    await queryRunner.query(`ALTER TABLE "ruta" RENAME COLUMN "choferIdNuevo" TO "choferId"`);

    await queryRunner.query(
      `CREATE INDEX "IDX_3845ac02d47f0dd4f9321e2727" ON "ruta" ("choferId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "ruta" ADD CONSTRAINT "FK_3845ac02d47f0dd4f9321e27274" FOREIGN KEY ("choferId") REFERENCES "chofer"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  /**
   * Vuelve a texto libre traduciendo cada id a su `nombre`, que es donde el
   * `up()` dejo el texto original completo. El legajo no sirve: un
   * identificador de mas de 40 caracteres quedo recortado ahi. Tampoco el
   * `usuarioSub`, que es nullable y es informacion que el modelo viejo no sabia
   * representar.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ruta" DROP CONSTRAINT "FK_3845ac02d47f0dd4f9321e27274"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3845ac02d47f0dd4f9321e2727"`);

    await queryRunner.query(`ALTER TABLE "ruta" ADD "choferIdViejo" character varying(120)`);
    await queryRunner.query(
      `UPDATE "ruta" SET "choferIdViejo" = "chofer"."nombre"
       FROM "chofer"
       WHERE "chofer"."id" = "ruta"."choferId"`,
    );

    await queryRunner.query(`ALTER TABLE "ruta" DROP COLUMN "choferId"`);
    await queryRunner.query(`ALTER TABLE "ruta" RENAME COLUMN "choferIdViejo" TO "choferId"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_3845ac02d47f0dd4f9321e2727" ON "ruta" ("choferId") `,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_5db2a677227084c5b61ca44e21"`);
    await queryRunner.query(`DROP TABLE "chofer"`);
  }
}
