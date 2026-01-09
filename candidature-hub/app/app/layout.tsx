import './globals.css'
import Link from 'next/link'

export const metadata = { title: 'Candidature Hub', description: 'Mini CRM CV' }

const SHOW_ADMIN_LINK = process.env.NEXT_PUBLIC_SHOW_ADMIN === '1' || true;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
          <nav className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg text-slate-800 hover:text-slate-900">
              <span className="text-2xl">📋</span>
              <span>Candidature Hub</span>
            </Link>
            <div className="flex items-center gap-1">
              <Link href="/candidates" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Candidati
              </Link>
              {SHOW_ADMIN_LINK && (
                <Link href="/admin" className="px-4 py-2 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors">
                  Admin
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
