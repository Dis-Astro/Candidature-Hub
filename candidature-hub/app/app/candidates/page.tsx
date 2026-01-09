export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { buildUrl, parsePositiveInt } from "../../lib/url";
import { FilterForm } from "./FilterForm";
import { PageSizeSelector } from "./PageSizeSelector";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ALLOWED_SORT_FIELDS = new Set([
  "updatedAt",
  "lastName",
  "firstName",
  "mansione",
  "rating",
  "interviewed",
  "discarded",
]);
const PAGE_SIZE_ALLOWED = new Set([10, 20, 50]);

function normalizeStr(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// 🧹 Pulisce mansione: split per virgola, trim, rimuove duplicati
function formatMansione(raw: string | null | undefined): string {
  if (!raw) return "";
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = parts.filter((val, idx, arr) => arr.indexOf(val) === idx);
  return unique.join(", ");
}

function toFiniteInt(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/**
 * ✅ Sort singolo: sort="field:asc|desc"
 * Se arriva roba vecchia tipo "a:asc,b:desc", prendiamo solo il primo.
 */
function parseSortSingle(sortParam: string | undefined): { field: string; dir: "asc" | "desc" } {
  const raw = (sortParam || "").split(",")[0]?.trim();
  if (raw) {
    const [field, dirRaw] = raw.split(":").map((s) => (s || "").trim());
    const dir: "asc" | "desc" = dirRaw === "desc" ? "desc" : "asc";
    if (ALLOWED_SORT_FIELDS.has(field)) return { field, dir };
  }
  return { field: "updatedAt", dir: "desc" };
}

function ratingPillClass(r: number): string {
  if (r <= 3) return "bg-red-100 text-red-800 border border-red-200";
  if (r <= 6) return "bg-yellow-100 text-yellow-800 border border-yellow-200";
  return "bg-green-100 text-green-800 border border-green-200";
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const search = await searchParams;

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (Array.isArray(v)) sp.set(k, v[0] ?? "");
    else if (typeof v === "string") sp.set(k, v);
  }

  // ✅ parsePositiveInt richiede 4 argomenti in questo progetto
  const page = Math.max(1, parsePositiveInt(normalizeStr(search.page), 1, 1, 10000) ?? 1);

  const pageSize = PAGE_SIZE_ALLOWED.has(Number(normalizeStr(search.pageSize)))
    ? Number(normalizeStr(search.pageSize))
    : 20;

  const sortParam = normalizeStr(search.sort) || "";
  const { field: sortField, dir: sortDir } = parseSortSingle(sortParam);
  const orderBy: Array<Record<string, "asc" | "desc">> = [{ [sortField]: sortDir }];

  // === filtri
  const q = (sp.get("q") ?? "").trim() || undefined;
  const mansione = (sp.get("mansione") ?? "").trim() || undefined;

  const ratingMin = toFiniteInt(sp.get("rating_min"));
  const ratingMax = toFiniteInt(sp.get("rating_max"));

  const interviewedRaw = sp.get("interviewed"); // "true" | "false" | null
  const interviewed =
    interviewedRaw === "true" ? true : interviewedRaw === "false" ? false : undefined;

  const tagsParam = sp.get("tags") ?? "";
  const tags = tagsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const whereBase: Prisma.CandidateWhereInput = {};

  if (mansione) {
    whereBase.mansione = { contains: mansione, mode: "insensitive" };
  }
  if (typeof interviewed === "boolean") {
    whereBase.interviewed = interviewed;
  }
  if (ratingMin != null || ratingMax != null) {
    whereBase.rating = {
      ...(ratingMin != null ? { gte: ratingMin } : {}),
      ...(ratingMax != null ? { lte: ratingMax } : {}),
    };
  }

  // === Tag filter robusto (SQL, non dipende da relation Prisma)
  let tagIds: string[] | undefined = undefined;
  if (tags.length > 0) {
    const rows = await prisma.$queryRaw<{ candidateId: string }[]>(
      Prisma.sql`
        SELECT DISTINCT ct."candidateId" as "candidateId"
        FROM candidate_tags ct
        JOIN tags t ON t.id = ct."tagId"
        WHERE t.name IN (${Prisma.join(tags)})
        LIMIT 5000
      `
    );
    tagIds = rows.map((r) => r.candidateId);
    if (tagIds.length === 0) {
      tagIds = ["__none__"];
    }
  }

  // === FTS su cv_files.extractedText
  let idsFromCv: string[] = [];
  if (q && q.length > 0) {
    const rows = await prisma.$queryRaw<{ candidateId: string }[]>(
      Prisma.sql`
        SELECT DISTINCT f."candidateId" as "candidateId"
        FROM cv_files f
        WHERE to_tsvector('simple', COALESCE(f."extractedText", ''))
              @@ plainto_tsquery('simple', ${q})
        LIMIT 500
      `
    );
    idsFromCv = rows.map((r) => r.candidateId);
  }

  // Testo “classico” su campi candidato
  const orText: Prisma.CandidateWhereInput[] =
    q && q.length > 0
      ? [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { mansione: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } },
        ]
      : [];

  if (idsFromCv.length > 0) {
    orText.push({ id: { in: idsFromCv } });
  }

  const andFilters: Prisma.CandidateWhereInput[] = [];
  if (tagIds) {
    andFilters.push({ id: { in: tagIds } });
  }

  const whereFinal: Prisma.CandidateWhereInput = {
    ...whereBase,
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    ...(orText.length > 0 ? { OR: orText } : {}),
  };

  const total = await prisma.candidate.count({ where: whereFinal });

  const items = await prisma.candidate.findMany({
    where: whereFinal,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      displayId: true,
      firstName: true,
      lastName: true,
      mansione: true,
      rating: true,
      updatedAt: true,
      interviewed: true,
      discarded: true,
      notes: true,
      _count: { select: { importEvents: true } },
      interviews: {
        orderBy: { date: "desc" },
        take: 1,
        select: { notes: true, hrNotes: true, decision: true },
      },
    },
  });

  // Helper: check se candidato è "certificato" (keyword [SCEMO] in qualsiasi nota)
  function isCertified(candidate: typeof items[0]): boolean {
    const interviewNotes = candidate.interviews[0]?.notes || "";
    const hrNotes = candidate.interviews[0]?.hrNotes || "";
    const candidateNotes = candidate.notes || "";
    const allNotes = `${interviewNotes} ${hrNotes} ${candidateNotes}`;
    return /\[SCEMO\]/i.test(allNotes);
  }

  // Helper: determina stato candidato per badge
  type CandidateState = "SCARTATO" | "DA_VALUTARE" | "SHORTLIST" | "ASSUMERE";
  function getCandidateState(c: typeof items[0]): CandidateState {
    if (c.discarded) return "SCARTATO";
    const decision = c.interviews[0]?.decision;
    if (decision === "ASSUME") return "ASSUMERE";
    if (c.rating !== null && c.rating >= 5) return "SHORTLIST";
    return "DA_VALUTARE";
  }

  const STATE_BADGE: Record<CandidateState, { label: string; class: string }> = {
    SCARTATO: { label: "Scartato", class: "bg-red-100 text-red-700 border-red-200" },
    DA_VALUTARE: { label: "Da valutare", class: "bg-blue-100 text-blue-700 border-blue-200" },
    SHORTLIST: { label: "Shortlist", class: "bg-green-100 text-green-700 border-green-200" },
    ASSUMERE: { label: "Assumere", class: "bg-amber-100 text-amber-800 border-amber-300 font-bold" },
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const rangeText = `${from}–${to} di ${total}`;

  function HeaderLink({ field, label }: { field: string; label: string }) {
    const isActive = sortField === field;

    const defaultDir: "asc" | "desc" =
      field === "updatedAt" ? "desc" : field === "interviewed" ? "desc" : "asc";

    const nextDir: "asc" | "desc" = isActive ? (sortDir === "asc" ? "desc" : "asc") : defaultDir;

    const href = buildUrl("/candidates", {
      ...Object.fromEntries(sp.entries()),
      sort: `${field}:${nextDir}`,
      page: 1,
    });

    const arrow = isActive ? (sortDir === "asc" ? " ↑" : " ↓") : "";

    return (
      <Link href={href} className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 font-medium">
        {label}
        {arrow && <span className="text-blue-600 font-bold">{arrow}</span>}
      </Link>
    );
  }

  return (
    <div className="space-y-4 relative">
      {/* Watermark logo */}
      <div className="fixed bottom-8 right-8 pointer-events-none z-0 opacity-[0.08]">
        <img src="/logo.png" alt="" className="w-32 h-32 object-contain" />
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Candidati</h1>
          <p className="text-sm text-slate-500 mt-0.5">{rangeText}</p>
        </div>
        <Link
          href="/candidates/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm hover:shadow transition-all"
        >
          <span className="text-lg">+</span> Nuovo candidato
        </Link>
      </div>

      <FilterForm />

      <div className="flex items-center justify-between text-sm text-slate-500">
        <PageSizeSelector currentPageSize={pageSize} />
        <span>Pagina {page} di {totalPages}</span>
      </div>

      <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <HeaderLink field="interviewed" label="Colloquio" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <HeaderLink field="lastName" label="Cognome" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <HeaderLink field="firstName" label="Nome" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <HeaderLink field="mansione" label="Mansione" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <HeaderLink field="rating" label="Rating" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <HeaderLink field="updatedAt" label="Aggiornato" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Invii</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Stato</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {items.map((c) => {
              const certified = isCertified(c);
              const state = getCandidateState(c);
              const stateBadge = STATE_BADGE[state];
              const idPill = certified
                ? "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-200 to-yellow-300 text-amber-900 border border-amber-400 hover:from-amber-300 hover:to-yellow-400 shadow-sm transition-all"
                : "inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all";

              return (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* ID (DORATO se certificato) */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/candidates/${c.displayId}`}
                      className={idPill}
                      title={certified ? "🏆 CERTIFICATO - Apri scheda" : "Apri scheda candidato"}
                    >
                      {certified && <span className="mr-1">🏆</span>}
                      {c.displayId}
                    </Link>
                  </td>

                  {/* Colloquio */}
                  <td className="px-4 py-3">
                    {c.interviewed ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-700 text-sm" title="Colloquio fatto">✓</span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-400 text-sm" title="No colloquio">–</span>
                    )}
                  </td>

                  <td className="px-4 py-3 font-medium text-slate-800">{c.lastName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.firstName}</td>
                  <td className="px-4 py-3 text-slate-600">{formatMansione(c.mansione)}</td>

                  <td className="px-4 py-3">
                    {typeof c.rating === "number" && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ratingPillClass(c.rating)}`}>
                        {c.rating}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(c.updatedAt).toLocaleString("it-IT", {
                      day: "2-digit", month: "2-digit", year: "2-digit",
                    })}
                  </td>

                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {c._count.importEvents}
                    </span>
                  </td>

                  {/* Stato */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${stateBadge.class}`} title={stateBadge.label}>
                      {state === "SCARTATO" && "✕ "}
                      {state === "ASSUMERE" && "★ "}
                      {state === "SHORTLIST" && "✓ "}
                      {stateBadge.label}
                    </span>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  Nessun risultato trovato
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Link
            className={`px-4 py-2 rounded-md border text-sm font-medium ${
              page <= 1
                ? "pointer-events-none opacity-50 bg-gray-100 text-gray-400"
                : "bg-white hover:bg-gray-50 text-gray-700"
            }`}
            href={buildUrl("/candidates", {
              ...Object.fromEntries(sp.entries()),
              page: Math.max(1, page - 1),
            })}
          >
            ← Precedente
          </Link>

          <Link
            className={`px-4 py-2 rounded-md border text-sm font-medium ${
              page >= totalPages
                ? "pointer-events-none opacity-50 bg-gray-100 text-gray-400"
                : "bg-white hover:bg-gray-50 text-gray-700"
            }`}
            href={buildUrl("/candidates", {
              ...Object.fromEntries(sp.entries()),
              page: Math.min(totalPages, page + 1),
            })}
          >
            Successivo →
          </Link>
        </div>

        <div className="text-sm text-gray-600">
          Pagina {page} di {totalPages}
        </div>
      </div>
    </div>
  );
}
