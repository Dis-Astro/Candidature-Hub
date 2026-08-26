import './globals.css'
import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { getCurrentUser } from '../lib/auth'
import { LogoutButton } from './LogoutButton'
import { AppNavigation } from './AppNavigation'
import { BrandMark } from './BrandMark'

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
  themeColor: '#f5f2ec',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="it">
      <body className="min-h-dvh antialiased">
        {user ? <div className="app-shell">
          <AppNavigation role={user.role} name={user.name} email={user.email} />
          <header className="mobile-header safe-top">
            <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
              <BrandMark small />
              <span>Candidature Hub</span>
            </Link>
            <LogoutButton compact />
          </header>
          <main className="app-content"><div className="app-content-inner">{children}</div></main>
        </div> : <main className="guest-content">{children}</main>}
      </body>
    </html>
  )
}
