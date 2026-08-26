import './globals.css'
import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '../lib/auth'
import { LogoutButton } from './LogoutButton'
import { MobileNavigation } from './MobileNavigation'

export const metadata: Metadata = {
  title: { default: 'Candidature Hub', template: '%s · Candidature Hub' },
  description: 'Gestione candidature, curriculum e colloqui',
  applicationName: 'Candidature Hub',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/app-icon.svg' },
  appleWebApp: { capable: true, title: 'Candidature Hub', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f766e',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="it">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
          <nav className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 safe-top lg:px-6">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg text-slate-800 hover:text-slate-900">
              <span className="text-2xl">📋</span>
              <span className="hidden min-[360px]:inline">Candidature Hub</span>
            </Link>
            {user && <div className="hidden sm:flex items-center gap-1">
              <Link href="/candidates" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Candidati
              </Link>
              <Link href="/imports" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                Importazioni
              </Link>
              <Link href="/docs" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">Guida</Link>
              {user?.role === 'ADMIN' && (
                <div className="flex items-center">
                  <Link href="/admin/users" className="px-3 py-2 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors">Utenti</Link>
                  <Link href="/admin" className="px-3 py-2 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors">Admin</Link>
                </div>
              )}
              <LogoutButton />
            </div>}
            <div className="sm:hidden">{user && <LogoutButton compact />}</div>
          </nav>
        </header>
        <main className={`mx-auto max-w-7xl px-4 py-4 sm:py-6 lg:px-6 ${user ? 'pb-24 sm:pb-6' : ''}`}>{children}</main>
        {user && <MobileNavigation role={user.role} />}
      </body>
    </html>
  )
}
