/** Costruisce un URL aggiungendo/aggiornando query param. Ritorna SEMPRE una stringa. */
export function buildUrl(
  basePath: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const u = new URL(basePath, "http://local"); // base fittizia per usare URLSearchParams
  const sp = new URLSearchParams(u.search);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Toggle dell'ordinamento su un campo: cicla "", "asc" -> "desc" -> "asc" ... */
export function toggleSort(current: string, field: string): string {
  // current es. "updatedAt:desc,lastName:asc"
  const parts = current
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const map = new Map<string, "asc" | "desc">();
  for (const p of parts) {
    const [f, d] = p.split(":");
    if (!f) continue;
    map.set(f, d === "asc" ? "asc" : "desc");
  }

  if (!map.has(field)) {
    map.set(field, "asc");
  } else {
    map.set(field, map.get(field) === "asc" ? "desc" : "asc");
  }

  return Array.from(map.entries())
    .map(([f, d]) => `${f}:${d}`)
    .join(",");
}

/** Parse int con default/min/max */
export function parsePositiveInt(
  raw: string | undefined | null,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
