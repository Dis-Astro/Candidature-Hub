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
      _count: { select: { importEvents: true } },
      // Per check "certificato" [SCEMO]
      interviews: {
        orderBy: { date: "desc" },
        take: 1,
        select: { notes: true },
      },
    },
  });

  // Helper: check se candidato è "certificato" (note contengono [SCEMO])
  function isCertified(candidate: typeof items[0]): boolean {
    const notes = candidate.interviews[0]?.notes || "";
    return /\[SCEMO\]/i.test(notes);
  }

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
    <div className="space-y-4">
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

      <div className="flex items-center justify-between">
        <PageSizeSelector currentPageSize={pageSize} />
        <div className="text-sm text-gray-600">
          Pagina {page} di {totalPages}
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-3 text-left font-semibold">ID</th>

              <th className="p-3 text-left font-semibold">
                <HeaderLink field="interviewed" label="Colloquio" />
              </th>

              <th className="p-3 text-left font-semibold">
                <HeaderLink field="lastName" label="Cognome" />
              </th>
              <th className="p-3 text-left font-semibold">
                <HeaderLink field="firstName" label="Nome" />
              </th>
              <th className="p-3 text-left font-semibold">
                <HeaderLink field="mansione" label="Mansione" />
              </th>
              <th className="p-3 text-left font-semibold">
                <HeaderLink field="rating" label="Rating" />
              </th>
              <th className="p-3 text-left font-semibold">
                <HeaderLink field="updatedAt" label="Aggiornato" />
              </th>
              <th className="p-3 text-left font-semibold">Invii</th>

              <th className="p-3 text-left font-semibold">
                <HeaderLink field="discarded" label="Curriculum scartato" />
              </th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {items.map((c) => {
              const certified = isCertified(c);
              const idPill = certified
                ? "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-gradient-to-r from-amber-200 to-yellow-300 text-amber-900 border-2 border-amber-400 hover:from-amber-300 hover:to-yellow-400 shadow-sm"
                : "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200";

              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  {/* ✅ ID cliccabile = Apri (DORATO se certificato) */}
                  <td className="p-3">
                    <Link
                      href={`/candidates/${c.displayId}`}
                      className={idPill}
                      title={certified ? "🏆 CERTIFICATO - Apri scheda" : "Apri scheda candidato"}
                    >
                      {certified && <span className="mr-1">🏆</span>}
                      {c.displayId}
                    </Link>
                  </td>

                  {/* ✅ Colloquio = interviewed */}
                  <td className="p-3">
                    {c.interviewed ? (
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-800 border border-green-200"
                        title="Colloquio fatto"
                      >
                        ✓
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-800 border border-red-200"
                        title="Colloquio non fatto"
                      >
                        ✕
                      </span>
                    )}
                  </td>

                  <td className="p-3">{c.lastName}</td>
                  <td className="p-3">{c.firstName}</td>
                  <td className="p-3">{formatMansione(c.mansione)}</td>

                  <td className="p-3">
                    {typeof c.rating === "number" && (
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${ratingPillClass(
                          c.rating
                        )}`}
                      >
                        {c.rating}
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-gray-600">
                    {new Date(c.updatedAt).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>

                  <td className="p-3">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                      Invii: {c._count.importEvents}
                    </span>
                  </td>

                  {/* ✅ Curriculum scartato = discarded */}
                  <td className="p-3">
                    {c.discarded ? (
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-800 border border-green-200"
                        title="Curriculum scartato"
                      >
                        ✓
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-800 border border-red-200"
                        title="Curriculum NON scartato"
                      >
                        ✕
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-500">
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
