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
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Workspace recruiting</p>
          <h1 className="page-title mt-2">Buongiorno{user.name ? `, ${user.name.split(' ')[0]}` : ''}</h1>
          <p className="page-subtitle">Le priorità della selezione, pronte per essere gestite.</p>
        </div>
        <p className="rounded-full border border-[#d7d4cd] bg-[#fffefa]/90 px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
          Aggiornato ora
        </p>
      </header>

      <section className="grid gap-4 min-[980px]:grid-cols-[1.45fr_.8fr]">
        <Link href="/candidates?status=DA_VALUTARE" className="focus-card group relative min-h-64 overflow-hidden p-6 md:p-8">
          <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-[#61758a]/10" />
          <div className="absolute -bottom-24 right-20 h-48 w-48 rounded-full border-[28px] border-white/25" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#526b82]">Coda di valutazione</p><p className="mt-3 max-w-md text-lg text-slate-600">Riprendi dai profili che aspettano una decisione.</p></div>
            <div className="flex items-end justify-between gap-4">
              <div><strong className="text-6xl font-semibold tracking-[-.06em] text-[#2c3542]">{toReview}</strong><p className="mt-1 text-sm text-slate-600">candidati da valutare</p></div>
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#c9795e] text-2xl text-white transition-transform group-hover:translate-x-1">→</span>
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-3 gap-3 min-[980px]:grid-cols-1">
          {[
            [total, "Candidati", "Totale archivio"],
            [withInterview, "Colloqui", "Profili incontrati"],
            [withCV, "Curriculum", "Documenti disponibili"],
          ].map(([value, label, hint]) => <div key={String(label)} className="surface-card flex min-w-0 flex-col justify-center p-4 md:p-5">
            <strong className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{value}</strong>
            <span className="mt-1 text-sm font-semibold text-slate-700">{label}</span>
            <span className="mt-1 hidden text-xs text-slate-400 sm:block">{hint}</span>
          </div>)}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-800">Azioni rapide</h2><span className="text-xs text-slate-400">Pensate per il touch</span></div>
        <div className="grid gap-3 md:grid-cols-2 min-[1180px]:grid-cols-3">
          <Link href="/candidates/new" className="surface-card group flex min-h-32 items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[#dfb6a7]">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#f1dfd8] text-2xl font-light text-[#9d4f39]">＋</span>
            <span><strong className="block text-sm text-slate-900">Nuovo candidato</strong><small className="mt-1 block text-slate-500">Inserimento manuale rapido</small></span>
          </Link>
          <Link href="/imports" className={`surface-card group flex min-h-32 items-center gap-4 p-5 transition hover:-translate-y-0.5 ${importErrors ? 'border-red-200 bg-red-50/80' : ''}`}>
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-bold ${importErrors ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{importErrors}</span>
            <span><strong className="block text-sm text-slate-900">Importazioni</strong><small className="mt-1 block text-slate-500">{importErrors ? 'Elementi da controllare' : 'Tutto sotto controllo'}</small></span>
          </Link>
          <Link href="/candidates" className="surface-card group flex min-h-32 items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[#c6d1da] md:col-span-2 min-[1180px]:col-span-1">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#dce4ea] text-xl text-[#435d75]">⌕</span>
            <span><strong className="block text-sm text-slate-900">Cerca nell’archivio</strong><small className="mt-1 block text-slate-500">Filtra profili, note e CV</small></span>
          </Link>
        </div>
      </section>
    </div>
  )
}
