import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import UserManagement from "./UserManagement";

export const metadata = { title: "Gestione utenti" };

export default async function UsersPage() {
  await requireUser(["ADMIN"]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700">Amministrazione</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Gestione utenti</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Crea gli accessi, assegna i permessi e revoca immediatamente le sessioni quando una persona non deve più entrare.</p>
        </div>
        <Link href="/admin" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Torna alle impostazioni</Link>
      </div>
      <UserManagement />
    </div>
  );
}
