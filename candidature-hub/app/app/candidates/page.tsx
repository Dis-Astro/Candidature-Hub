export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { CandidateStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { buildUrl, parsePositiveInt } from "../../lib/url";
import { FilterForm } from "./FilterForm";
import { PageSizeSelector } from "./PageSizeSelector";
import { requireUser } from "../../lib/auth";

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
  const user = await requireUser();
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

  const statusRaw = sp.get("status");
  if (statusRaw && Object.values(CandidateStatus).includes(statusRaw as CandidateStatus)) {
    whereBase.status = statusRaw as CandidateStatus;
  }

  if (sp.get("hasCv") === "true") {
    whereBase.cvFiles = { some: {} };
  }

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

  // Testo "classico" su campi candidato
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
      status: true,
      notes: true,
      _count: { select: { importEvents: true } },
      interviews: {
        orderBy: { date: "desc" },
        take: 1,
        select: { notes: true, hrNotes: true, decision: true, profileVerified: true },
      },
    },
  });

  // Profilo verificato esplicitamente dal recruiter.
  function isCertified(candidate: typeof items[0]): boolean {
    return candidate.interviews[0]?.profileVerified ?? false;
  }

  // Helper: determina stato candidato per badge
  type CandidateState = "SCARTATO" | "DA_VALUTARE" | "SHORTLIST" | "ASSUMERE";
  function getCandidateState(c: typeof items[0]): CandidateState {
    return c.status;
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
    <div className="relative space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Archivio</p>
          <h1 className="page-title mt-2">Candidati</h1>
          <p className="page-subtitle">{rangeText} · trova, confronta e valuta i profili.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/api/candidates/export" prefetch={false} className="touch-button border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50">Esporta CSV</Link>
          {user.role !== "VIEWER" && <Link
            href="/candidates/new"
            className="touch-button bg-teal-700 text-white shadow-sm transition hover:bg-teal-800"
          >
            <span className="text-lg">+</span> Nuovo candidato
          </Link>}
        </div>
      </div>

      <FilterForm />

      <div className="flex items-center justify-between text-sm text-slate-500">
        <PageSizeSelector currentPageSize={pageSize} />
        <span>Pagina {page} di {totalPages}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:hidden">
        {items.map((candidate) => {
          const certified = isCertified(candidate);
          const state = getCandidateState(candidate);
          const stateBadge = STATE_BADGE[state];
          return (
            <Link key={candidate.id} href={`/candidates/${candidate.displayId}`} className="surface-card group flex min-h-44 flex-col justify-between p-4 transition active:scale-[.99] active:bg-slate-50 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">#{candidate.displayId}</span>
                    {certified && <span title="Profilo verificato">🏆</span>}
                    {candidate.interviewed && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">Colloquio</span>}
                  </div>
                  <h2 className="mt-2 truncate text-lg font-bold tracking-tight text-slate-900 group-hover:text-teal-800">{candidate.lastName} {candidate.firstName}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{formatMansione(candidate.mansione) || "Mansione non indicata"}</p>
                </div>
                {typeof candidate.rating === "number" && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${ratingPillClass(candidate.rating)}`}>{candidate.rating}</span>}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${stateBadge.class}`}>{stateBadge.label}</span>
                <span className="text-xs text-slate-400">Agg. {new Date(candidate.updatedAt).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</span>
              </div>
            </Link>
          );
        })}
        {items.length === 0 && <div className="rounded-xl border bg-white p-8 text-center text-slate-400">Nessun risultato trovato</div>}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm xl:block">
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
              const candidateHref = `/candidates/${c.displayId}`;

              return (
                <tr key={c.id} className="cursor-pointer transition-colors hover:bg-slate-50/80 focus-within:bg-slate-50">
                  {/* ID (DORATO con 🏆 se certificato) */}
                  <td className="p-0">
                    <Link
                      href={candidateHref}
                      className="block px-4 py-3"
                      aria-label={`Apri la scheda di ${c.firstName} ${c.lastName}`}
                    >
                      <span
                        className={certified
                          ? "inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-gradient-to-r from-amber-200 to-yellow-300 px-2.5 py-1 text-xs font-bold text-amber-900 shadow-sm"
                          : "inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                        }
                      >
                        {certified && <span>🏆</span>}
                        {c.displayId}
                      </span>
                    </Link>
                  </td>

                  {/* Colloquio */}
                  <td className="p-0">
                    <Link href={candidateHref} className="block px-4 py-3">
                      {c.interviewed ? (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-sm text-green-700" title="Colloquio fatto">✓</span>
                      ) : (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-400" title="No colloquio">–</span>
                      )}
                    </Link>
                  </td>

                  <td className="p-0"><Link href={candidateHref} className="block px-4 py-3 font-medium text-slate-800">{c.lastName}</Link></td>
                  <td className="p-0"><Link href={candidateHref} className="block px-4 py-3 text-slate-600">{c.firstName}</Link></td>
                  <td className="p-0"><Link href={candidateHref} className="block px-4 py-3 text-slate-600">{formatMansione(c.mansione) || "—"}</Link></td>

                  <td className="p-0">
                    <Link href={candidateHref} className="block px-4 py-3">
                      {typeof c.rating === "number" ? <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ratingPillClass(c.rating)}`}>{c.rating}</span> : "—"}
                    </Link>
                  </td>

                  <td className="p-0 text-xs text-slate-500">
                    <Link href={candidateHref} className="block px-4 py-3">{new Date(c.updatedAt).toLocaleString("it-IT", {
                        day: "2-digit", month: "2-digit", year: "2-digit",
                        timeZone: "Europe/Rome",
                      })}</Link>
                  </td>

                  <td className="p-0">
                    <Link href={candidateHref} className="block px-4 py-3"><span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c._count.importEvents}</span></Link>
                  </td>

                  {/* Stato */}
                  <td className="p-0">
                    <Link href={candidateHref} className="block px-4 py-3"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${stateBadge.class}`} title={stateBadge.label}>
                        {state === "SCARTATO" && "✕ "}
                        {state === "ASSUMERE" && "★ "}
                        {state === "SHORTLIST" && "✓ "}
                        {stateBadge.label}
                      </span></Link>
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

      <div className="flex flex-col items-stretch justify-between gap-3 pt-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Link
            className={`touch-button border text-sm ${
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
            className={`touch-button border text-sm ${
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

        <div className="text-center text-sm text-gray-600 sm:text-right">
          Pagina {page} di {totalPages}
        </div>
      </div>
    </div>
  );
}
