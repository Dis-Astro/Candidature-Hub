/**
 * Ottiene la direzione di ordinamento corrente per un campo specifico
 * @param sortParam - Il parametro sort corrente (es. "updatedAt:desc,lastName:asc")
 * @param field - Il campo da verificare
 * @returns "asc" | "desc" | null
 */
export function getCurrentSortDir(
  sortParam: string | undefined,
  field: string
): "asc" | "desc" | null {
  if (!sortParam) return null;

  const parts = sortParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const [f, dir] = part.split(":");
    if (f === field) {
      return dir === "desc" ? "desc" : "asc";
    }
  }

  return null;
}
