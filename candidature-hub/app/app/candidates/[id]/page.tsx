export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "../../../lib/prisma";
import type { Candidate, Interview, CvFile } from "@prisma/client";
import { InterviewForm } from "../InterviewForm";
import { requireUser } from "../../../lib/auth";
import Link from "next/link";
import { AuthenticatedFileViewer } from "../AuthenticatedFileViewer";

type Params = {
  id?: string;
};

type PageSearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  params: Promise<Params>;
  searchParams: Promise<PageSearchParams>;
};

function normalizeStr(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { id: idParam } = await params;
  const search = await searchParams;

  let candidateId: string | null = null;
  let displayId: number | null = null;

  if (idParam && /^\d+$/.test(idParam)) {
    displayId = Number(idParam);
  } else if (idParam) {
    candidateId = idParam;
  }

  if (!candidateId && !displayId) {
    const raw = normalizeStr(search.id ?? search["id"]);
    if (raw && /^\d+$/.test(raw)) {
      displayId = Number(raw);
    } else if (raw) {
      candidateId = raw;
    }
  }

  if (!candidateId && !displayId) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-red-600">ID mancante</h1>
        <p className="mt-2">Non è stato passato nessun ID candidato.</p>
      </div>
    );
  }

  const whereCond = candidateId
    ? { id: candidateId }
    : { displayId: displayId as number };

  const candidate = await prisma.candidate.findFirst({
    where: whereCond,
    include: {
      cvFiles: { orderBy: { createdAt: "desc" } },
      interviews: { orderBy: { date: "desc" } },
    },
  });

  if (!candidate) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-red-600">Candidato non trovato</h1>
        <p className="mt-2">
          Nessun candidato trovato per{" "}
          {candidateId ? `id="${candidateId}"` : `displayId=${displayId}`}.
        </p>
      </div>
    );
  }

  const [latestInterview] = candidate.interviews as Interview[];

  return (
    <div className="space-y-5" suppressHydrationWarning>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/candidates" className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-700">← Tutti i candidati</Link>
          <p className="eyebrow">Profilo #{candidate.displayId}</p>
          <h1 className="page-title mt-2">{candidate.firstName} {candidate.lastName}</h1>
          <p className="page-subtitle">Valutazione, colloquio e documenti in un’unica scheda.</p>
        </div>
        {candidate.cvFiles[0] && (
          <AuthenticatedFileViewer
            url={`/api/files/${candidate.cvFiles[0].id}`}
            filename={`CV ${candidate.firstName} ${candidate.lastName}.pdf`}
            className="touch-button border border-slate-200 bg-white text-slate-700 shadow-sm"
          >
            Apri il CV
          </AuthenticatedFileViewer>
        )}
      </header>
      <InterviewForm
        candidate={candidate as Candidate & { cvFiles: CvFile[]; interviews: Interview[] }}
        lastInterview={latestInterview ?? null}
        canEdit={user.role !== "VIEWER"}
        canDelete={user.role === "ADMIN"}
      />
    </div>
  );
}
