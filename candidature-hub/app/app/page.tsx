import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await requireUser();
  const [total, withInterview, withCV, toReview, importErrors] = await Promise.all([
    prisma.candidate.count(),
    prisma.candidate.count({ where: { interviewed: true } }),
    prisma.cvFile.count(),
    prisma.candidate.count({ where: { status: 'DA_VALUTARE' } }),
    prisma.importJob.count({ where: { status: { in: ['ERROR', 'BLOCKED'] } } }),
  ])

  return (
    <main className="space-y-7">
      <div><p className="text-sm font-medium text-teal-700">Bentornato{user.name ? `, ${user.name}` : ''}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Panoramica candidature</h1><p className="mt-2 text-sm text-slate-600">Tutto ciò che richiede attenzione, in una sola schermata.</p></div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-3xl font-bold">{total}</div>
          <div className="text-sm text-gray-600">Candidati</div>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-3xl font-bold">{withInterview}</div>
          <div className="text-sm text-gray-600">Con colloquio</div>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-3xl font-bold">{withCV}</div>
          <div className="text-sm text-gray-600">CV caricati</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/candidates?status=DA_VALUTARE" className="rounded-xl bg-teal-700 p-5 text-white shadow-sm transition hover:bg-teal-800"><div className="text-3xl font-bold">{toReview}</div><div className="mt-1 font-semibold">Candidati da valutare</div><div className="mt-3 text-sm text-teal-100">Apri la coda →</div></Link>
        <Link href="/imports" className={`rounded-xl border p-5 shadow-sm ${importErrors ? 'border-red-200 bg-red-50' : 'bg-white'}`}><div className={`text-3xl font-bold ${importErrors ? 'text-red-700' : 'text-emerald-700'}`}>{importErrors}</div><div className="mt-1 font-semibold">Importazioni da controllare</div><div className="mt-3 text-sm text-slate-600">Controlla posta, parser e antivirus →</div></Link>
        <Link href="/candidates/new" className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-teal-300"><div className="text-3xl">＋</div><div className="mt-1 font-semibold">Nuova candidatura</div><div className="mt-3 text-sm text-slate-600">Inserimento rapido manuale →</div></Link>
      </div>
    </main>
  )
}
