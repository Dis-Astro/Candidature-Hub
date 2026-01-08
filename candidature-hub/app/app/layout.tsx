import './globals.css'
import Link from 'next/link'

export const metadata = { title: 'Candidature Hub', description: 'Mini CRM CV' }

// TODO: sostituire con check sessione utente quando auth implementata
const SHOW_ADMIN_LINK = process.env.NEXT_PUBLIC_SHOW_ADMIN === '1' || true; // feature flag

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh bg-white text-gray-900">
        <header className="border-b">
          <nav className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-semibold">Candidature Hub</Link>
            <Link href="/candidates" className="underline">Candidati</Link>
            {SHOW_ADMIN_LINK && (
              <Link href="/admin" className="underline text-amber-700 font-medium">Admin</Link>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
