export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
