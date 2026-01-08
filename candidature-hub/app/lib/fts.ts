/**
 * Converte "testo libero" in una query AND semplice per Postgres FTS.
 * Esempio: "saldatore autocad" -> "saldatore & autocad"
 * NB: qui NON applichiamo operatori speciali (& | ! : *) e ripuliamo simboli.
 */
export function toTsQuerySimple(q: string) {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[&|!:()*]/g, ""))
    .join(" & ");
}
