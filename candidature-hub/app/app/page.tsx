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

  const sections = [
    { href: '/candidates', title: 'Archivio candidati', description: 'Cerca, filtra e apri tutte le schede.', count: total, icon: '⌕', tone: 'bg-[#dce4ea] text-[#435d75]' },
    { href: '/candidates?interviewed=true', title: 'Colloqui effettuati', description: 'Rivedi valutazioni, note e decisioni.', count: withInterview, icon: '✓', tone: 'bg-[#e2e7de] text-[#5f6f58]' },
    { href: '/candidates?hasCv=true', title: 'Curriculum disponibili', description: 'Entra nei profili che hanno un CV allegato.', count: withCV, icon: '▤', tone: 'bg-[#eee4d8] text-[#80684d]' },
    { href: '/imports', title: 'Importazioni', description: importErrors ? 'Controlla gli elementi con errore.' : 'Gestisci acquisizioni e nuovi documenti.', count: importErrors, icon: '↓', tone: importErrors ? 'bg-red-100 text-red-700' : 'bg-[#e2e7de] text-[#5f6f58]' },
    { href: '/candidates/new', title: 'Nuovo candidato', description: 'Inserisci manualmente una nuova candidatura.', icon: '＋', tone: 'bg-[#f1dfd8] text-[#9d4f39]' },
    ...(user.role === 'ADMIN' ? [{ href: '/admin/users', title: 'Utenti e accessi', description: 'Gestisci persone, ruoli e autorizzazioni.', icon: '◎', tone: 'bg-[#ece4ef] text-[#705d78]' }] : []),
  ]

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

      <section>
        <Link href="/candidates?status=DA_VALUTARE" className="focus-card group relative block min-h-64 overflow-hidden p-6 transition active:scale-[.995] md:p-8">
          <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-[#61758a]/10" />
          <div className="absolute -bottom-24 right-20 h-48 w-48 rounded-full border-[28px] border-white/25" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#526b82]">Coda di valutazione</p><p className="mt-3 max-w-md text-lg text-slate-600">Riprendi dai profili che aspettano una decisione.</p></div>
            <div className="flex items-end justify-between gap-4">
              <div><strong className="text-6xl font-semibold tracking-[-.06em] text-[#2c3542]">{toReview}</strong><p className="mt-1 text-sm text-slate-600">candidati da valutare</p></div>
              <span className="flex min-h-14 items-center gap-3 rounded-2xl bg-[#c9795e] px-5 font-semibold text-white transition-transform group-hover:translate-x-1"><span>Apri da valutare</span><span className="text-2xl">→</span></span>
            </div>
          </div>
        </Link>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold text-slate-800">Vai a una sezione</h2><span className="text-xs text-slate-400">Ogni scheda è apribile</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sections.map(section => <Link key={section.href} href={section.href} className="surface-card group flex min-h-36 items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[#c6d1da] active:scale-[.99]">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl font-semibold ${section.tone}`}>{section.icon}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><strong className="text-base text-slate-900">{section.title}</strong>{typeof section.count === 'number' && <small className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">{section.count}</small>}</span><small className="mt-2 block leading-5 text-slate-500">{section.description}</small></span>
            <span className="text-xl text-slate-400 transition-transform group-hover:translate-x-1">→</span>
          </Link>)}
        </div>
      </section>
    </div>
  )
}
