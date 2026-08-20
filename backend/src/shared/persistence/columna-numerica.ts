import { ValueTransformer } from 'typeorm';

/**
 * TypeORM devuelve las columnas `numeric`/`decimal` de Postgres como string,
 * para no perder precision. En este dominio los valores son porcentajes,
 * temperaturas y coordenadas: numeros chicos donde el double alcanza y sobra.
 *
 * Sin este transformer, `contenedor.nivelLlenadoPct > umbral` compara string
 * contra numero y la regla de CU-05 falla en silencio.
 */
export const columnaNumerica: ValueTransformer = {
  to: (valor: number | null) => valor,
  from: (valor: string | null) => (valor === null ? null : Number(valor)),
};
