import Link from "next/link";
import type { Role } from "@prisma/client";

export function MobileNavigation({ role }: { role: Role }) {
  return (
    <nav aria-label="Navigazione mobile" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pt-1 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        <Link href="/" className="mobile-nav-item"><span aria-hidden>⌂</span><span>Home</span></Link>
        <Link href="/candidates" className="mobile-nav-item"><span aria-hidden>♟</span><span>Candidati</span></Link>
        <Link href="/imports" className="mobile-nav-item"><span aria-hidden>⇩</span><span>Import</span></Link>
        {role === "ADMIN" ? (
          <Link href="/admin" className="mobile-nav-item"><span aria-hidden>⚙</span><span>Admin</span></Link>
        ) : (
          <Link href="/docs" className="mobile-nav-item"><span aria-hidden>?</span><span>Guida</span></Link>
        )}
      </div>
    </nav>
  );
}
