export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "../../../lib/prisma";
import type { Candidate, Interview, CvFile } from "@prisma/client";
import { InterviewForm } from "../InterviewForm";
import { ReviewNavigation } from "../ReviewNavigation";

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
  // Next 16: params e searchParams sono Promise → li aspettiamo
  const { id: idParam } = await params;
  const search = await searchParams;

  let candidateId: string | null = null; // id UUID/stringa
  let displayId: number | null = null; // id numerico progressivo

  // 1) Proviamo da /candidates/[id]
  if (idParam && /^\d+$/.test(idParam)) {
    displayId = Number(idParam);
  } else if (idParam) {
    candidateId = idParam;
  }

  // 2) Fallback da querystring ?id=...
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
        <p className="mt-2">
          Non è stato passato nessun ID candidato nell&apos;URL.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          URL atteso: <code>/candidates/&lt;displayId&gt;</code> oppure{" "}
          <code>/candidates/detail?id=&lt;id o displayId&gt;</code>
        </p>
      </div>
    );
  }

  const whereCond = candidateId
    ? { id: candidateId }
    : { displayId: displayId as number };

  const candidate = await prisma.candidate.findFirst({
    where: whereCond,
    include: {
      cvFiles: {
        orderBy: { createdAt: "desc" },
      },
      interviews: {
        orderBy: { date: "desc" },
      },
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
        <p className="mt-2 text-sm text-gray-600">
          Verifica che l&apos;URL sia corretto o torna alla lista dei candidati.
        </p>
      </div>
    );
  }

  const [latestInterview /*, ...previousInterviews*/] = candidate
    .interviews as Interview[];

  return (
    <div className="p-4 space-y-4" suppressHydrationWarning>
      {/* Barra navigazione "da valutare" */}
      <ReviewNavigation
        currentDisplayId={candidate.displayId}
        candidateId={candidate.id}
      />

      <InterviewForm
        candidate={
          candidate as Candidate & {
            cvFiles: CvFile[];
            interviews: Interview[];
          }
        }
        lastInterview={latestInterview ?? null}
      />
    </div>
  );
}

