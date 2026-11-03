/** Evita backtracking al normalizar una URL con muchas barras al final. */
export function sinBarrasFinales(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  return value.slice(0, end);
}
