import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [total, withInterview, withCV] = await Promise.all([
    prisma.candidate.count(),
    prisma.candidate.count({ where: { interviewed: true } }),
    prisma.cvFile.count(),
  ])

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold mb-3">Candidature Hub</h1>
      <p className="text-sm text-gray-600 mb-6">
        Mini pannello di controllo: accessi rapidi e stato dati.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="border rounded p-4">
          <div className="text-3xl font-bold">{total}</div>
          <div className="text-sm text-gray-600">Candidati</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-3xl font-bold">{withInterview}</div>
          <div className="text-sm text-gray-600">Con colloquio</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-3xl font-bold">{withCV}</div>
          <div className="text-sm text-gray-600">CV caricati</div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/candidates" className="underline">Vai alla lista candidati</Link>
      </div>
    </main>
  )
}
