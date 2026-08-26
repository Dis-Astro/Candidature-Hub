"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { LogoutButton } from "./LogoutButton";
import { BrandMark } from "./BrandMark";

type IconName = "home" | "people" | "imports" | "guide" | "settings" | "accounts" | "plus";

function Icon({ name, className = "h-6 w-6" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    imports: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    guide: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08a1.7 1.7 0 0 0-1.52 1Z" /></>,
    accounts: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17.5" cy="14.5" r="2" /><path d="m17.5 11.2.4-1.2M17.5 17.8l.4 1.2M14.2 14.5l-1.2-.4M20.8 14.5l1.2-.4M15.2 12.2l-.8-.9M19.8 16.8l.8.9M19.8 12.2l.8-.9" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

const links: Array<{ href: string; label: string; icon: IconName; adminOnly?: boolean }> = [
  { href: "/", label: "Panoramica", icon: "home" },
  { href: "/candidates", label: "Candidati", icon: "people" },
  { href: "/imports", label: "Importazioni", icon: "imports" },
  { href: "/docs", label: "Guida", icon: "guide" },
  { href: "/admin/users", label: "Utenti", icon: "accounts", adminOnly: true },
  { href: "/admin", label: "Sistema", icon: "settings", adminOnly: true },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavigation({ role, name, email }: { role: Role; name?: string | null; email: string }) {
  const pathname = usePathname();
  const visibleLinks = links.filter(link => !link.adminOnly || role === "ADMIN");
  const mobileLinks = role === "ADMIN"
    ? visibleLinks.filter(link => ["/", "/candidates", "/imports", "/admin"].includes(link.href))
    : visibleLinks.filter(link => link.href !== "/docs").slice(0, 3);

  return <>
    <aside className="app-sidebar" aria-label="Navigazione principale">
      <Link href="/" className="app-brand" aria-label="Candidature Hub">
        <BrandMark />
        <span className="app-brand-copy"><strong>Candidature</strong><small>Hub</small></span>
      </Link>

      <Link href="/candidates/new" className="app-new-candidate">
        <Icon name="plus" />
        <span>Nuovo candidato</span>
      </Link>

      <nav className="app-sidebar-links">
        {visibleLinks.map(link => {
          const active = isCurrent(pathname, link.href);
          return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`app-sidebar-link ${active ? "is-active" : ""}`}>
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </Link>;
        })}
      </nav>

      <div className="app-user-card">
        <span className="app-user-avatar">{(name || email).trim().charAt(0).toUpperCase()}</span>
        <span className="app-user-copy"><strong>{name || "Account"}</strong><small>{role === "ADMIN" ? "Amministratore" : role === "RECRUITER" ? "Recruiter" : "Visualizzatore"}</small></span>
        <LogoutButton compact />
      </div>
    </aside>

    <nav className="mobile-dock" aria-label="Navigazione mobile">
      {mobileLinks.map(link => {
        const active = isCurrent(pathname, link.href);
        return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`mobile-dock-item ${active ? "is-active" : ""}`}>
          <Icon name={link.icon} className="h-5 w-5" />
          <span>{link.label === "Importazioni" ? "Import" : link.label === "Panoramica" ? "Home" : link.label}</span>
        </Link>;
      })}
      {role !== "ADMIN" && <Link href="/candidates/new" className={`mobile-dock-item ${pathname === "/candidates/new" ? "is-active" : ""}`}><Icon name="plus" className="h-5 w-5" /><span>Nuovo</span></Link>}
    </nav>
  </>;
}
