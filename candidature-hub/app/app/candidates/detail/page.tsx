export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/lib/prisma";
import type { Candidate, Interview, CvFile } from "@prisma/client";
import { InterviewForm } from "../InterviewForm";

type CandidateWithRelations = Candidate & {
  interviews: Interview[];
  cvFiles: CvFile[];
};

type SearchParams = Promise<{ id?: string }>;

type DetailPageProps = {
  searchParams: SearchParams;
};

export default async function DetailPage({ searchParams }: DetailPageProps) {
  const { id } = await searchParams;

  if (!id) {
    return (
      <div className="p-4 text-red-600">
        ID mancante. Non è stato passato nessun ID candidato nell&apos;URL.
      </div>
    );
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      interviews: {
        orderBy: { date: "desc" },
      },
      cvFiles: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!candidate) {
    return (
      <div className="p-4 text-red-600">
        Candidato non trovato (ID: <code>{id}</code>).
      </div>
    );
  }

  const typedCandidate = candidate as CandidateWithRelations;
  const lastInterview = typedCandidate.interviews[0] ?? null;

  return (
    <div className="p-4">
      <InterviewForm candidate={typedCandidate} lastInterview={lastInterview} />
    </div>
  );
}
