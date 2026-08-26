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
          <p className="eyebrow">Amministrazione</p>
          <h1 className="page-title mt-2">Gestione utenti</h1>
          <p className="page-subtitle max-w-2xl">Crea gli accessi, assegna i permessi e revoca immediatamente le sessioni quando una persona non deve più entrare.</p>
        </div>
        <Link href="/admin" className="secondary-action inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold">Torna alle impostazioni</Link>
      </div>
      <UserManagement />
    </div>
  );
}
