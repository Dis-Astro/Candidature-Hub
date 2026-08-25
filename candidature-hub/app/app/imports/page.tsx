import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const labels: Record<string, { text: string; cls: string }> = {
  QUEUED: { text: "In attesa", cls: "bg-blue-100 text-blue-800" },
  PROCESSING: { text: "In analisi", cls: "bg-amber-100 text-amber-800" },
  SUCCESS: { text: "Acquisito", cls: "bg-emerald-100 text-emerald-800" },
  DUPLICATE: { text: "Duplicato", cls: "bg-slate-100 text-slate-700" },
  ERROR: { text: "Da controllare", cls: "bg-red-100 text-red-800" },
  BLOCKED: { text: "Bloccato", cls: "bg-rose-200 text-rose-900" },
};

export default async function ImportsPage() {
  const user = await requireUser();
  const [jobs, queued, errors, completed] = await Promise.all([
    prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { candidate: { select: { displayId: true, firstName: true, lastName: true } } } }),
    prisma.importJob.count({ where: { status: { in: ["QUEUED", "PROCESSING"] } } }),
    prisma.importJob.count({ where: { status: { in: ["ERROR", "BLOCKED"] } } }),
    prisma.importJob.count({ where: { status: "SUCCESS" } }),
  ]);
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Importazioni curriculum</h1><p className="mt-1 text-sm text-slate-600">Controlla in modo semplice email, caricamenti manuali, errori e scansioni antivirus.</p></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[["In lavorazione", queued, "text-blue-700"], ["Da controllare", errors, "text-red-700"], ["Acquisiti", completed, "text-emerald-700"]].map(([label, value, cls]) => <div key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><div className={`text-3xl font-bold ${cls}`}>{value}</div><div className="text-sm text-slate-600">{label}</div></div>)}
    </div>
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="hidden grid-cols-[1.2fr_.7fr_.7fr_1.5fr_auto] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500 md:grid"><span>File</span><span>Origine</span><span>Stato</span><span>Dettaglio</span><span>Azione</span></div>
      <div className="divide-y">{jobs.map(job => { const state = labels[job.status] || { text: job.status, cls: "bg-slate-100" }; return <div key={job.id} className="grid gap-3 p-4 md:grid-cols-[1.2fr_.7fr_.7fr_1.5fr_auto] md:items-center">
        <div><p className="truncate font-medium">{job.filename}</p><p className="text-xs text-slate-500">{job.createdAt.toLocaleString("it-IT")}</p></div>
        <span className="text-sm">{job.source === "EMAIL" ? "Email" : "Manuale"}</span>
        <span><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state.cls}`}>{state.text}</span></span>
        <div className="text-sm text-slate-600">{job.threat ? `Minaccia: ${job.threat}` : job.message || "—"}{job.candidate && <div><Link className="font-medium text-teal-700 underline" href={`/candidates/${job.candidateId}`}>Apri #{job.candidate.displayId} · {job.candidate.firstName} {job.candidate.lastName}</Link></div>}</div>
        <div>{job.status === "ERROR" && user.role !== "VIEWER" && <form action={`/api/imports/${job.id}/retry`} method="post"><button className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-medium text-teal-800">Riprova</button></form>}</div>
      </div>})}{jobs.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Nessuna importazione registrata.</p>}</div>
    </div>
  </div>;
}
