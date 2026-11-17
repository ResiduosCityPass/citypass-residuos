const normalize = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[._-]/g, ' ').trim().replace(/\s+/g, ' ');
const aliases = { 'LA BOCA': 'BOCA', 'LA PATERNAL': 'PATERNAL', 'VILLA GENERAL MITRE': 'VILLA GRAL MITRE' };

/** Coincidencias explícitas por código/nombre de barrio, nunca por distancia al centroide. */
export function suggestClimateZones(names = [], zones = [], catalog = []) {
  const lookup = new Map(catalog.flatMap((b) => [[normalize(b.id), b], [normalize(b.nombre), b]]));
  const recognized = new Map();
  const unknown = new Set();
  for (const value of names) {
    const key = normalize(value);
    const barrio = lookup.get(aliases[key] ?? key);
    if (barrio) recognized.set(barrio.id, barrio);
    else unknown.add(String(value));
  }
  const covered = new Set(zones.flatMap((z) => z.barrioIds ?? []));
  return {
    zoneIds: [...new Set(zones.filter((z) => (z.barrioIds ?? []).some((id) => recognized.has(id))).map((z) => z.id))],
    unknownNames: [...unknown],
    unmappedNames: [...recognized.values()].filter((b) => !covered.has(b.id)).map((b) => b.nombre),
  };
}
