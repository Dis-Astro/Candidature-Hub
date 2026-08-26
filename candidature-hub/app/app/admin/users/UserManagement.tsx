"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Role = "ADMIN" | "RECRUITER" | "VIEWER";
type User = { id: string; email: string; name: string | null; role: Role; isActive: boolean; createdAt: string; updatedAt: string };
type Notice = { kind: "ok" | "error"; text: string } | null;

const roleInfo: Record<Role, { label: string; description: string }> = {
  ADMIN: { label: "Amministratore", description: "Configurazione, utenti e tutte le candidature" },
  RECRUITER: { label: "Selezionatore", description: "Gestione candidature, valutazioni e colloqui" },
  VIEWER: { label: "Consultazione", description: "Può visualizzare senza modificare" },
};

function securePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = crypto.getRandomValues(new Uint32Array(18));
  return Array.from(values, value => chars[value % chars.length]).join("");
}

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Operazione non riuscita");
  return body;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const body = await api("/api/admin/users");
      setUsers(body.users || []);
      setCurrentUserId(body.currentUserId || "");
    } catch (error) { setNotice({ kind: "error", text: String(error instanceof Error ? error.message : error) }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setNotice(null);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await api("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      form.reset(); setGeneratedPassword("");
      setNotice({ kind: "ok", text: "Utente creato. Puoi consegnargli le credenziali." });
      await load();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(""); }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setBusy(editing.id); setNotice(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, id: editing.id, isActive: editing.isActive }) });
      if (editing.id === currentUserId && String(data.password || "")) {
        window.location.replace("/login");
        return;
      }
      setEditing(null); setNotice({ kind: "ok", text: "Utente aggiornato." }); await load();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(""); }
  }

  async function setActive(user: User, isActive: boolean) {
    if (!confirm(isActive ? `Riattivare ${user.email}?` : `Disattivare ${user.email} e chiudere tutte le sue sessioni?`)) return;
    setBusy(user.id); setNotice(null);
    try {
      await api("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...user, isActive }) });
      setNotice({ kind: "ok", text: isActive ? "Utente riattivato." : "Utente disattivato e sessioni revocate." }); await load();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(""); }
  }

  async function deleteUser(user: User) {
    if (!confirm(`Eliminare definitivamente ${user.email}? Per conservare lo storico è preferibile disattivarlo.`)) return;
    setBusy(user.id); setNotice(null);
    try {
      await api(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      setNotice({ kind: "ok", text: "Utente eliminato." }); await load();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(""); }
  }

  const activeCount = users.filter(user => user.isActive).length;
  return <>
    {notice && <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Utenti totali</p><p className="mt-1 text-3xl font-bold">{users.length}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Accessi attivi</p><p className="mt-1 text-3xl font-bold text-emerald-700">{activeCount}</p></div>
      <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Amministratori</p><p className="mt-1 text-3xl font-bold text-amber-700">{users.filter(user => user.isActive && user.role === "ADMIN").length}</p></div>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold">Crea un nuovo accesso</h2>
      <p className="mt-1 text-sm text-slate-500">La password deve contenere almeno 12 caratteri.</p>
      <form onSubmit={createUser} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Nome e cognome<input name="name" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3" placeholder="Mario Rossi" /></label>
        <label className="text-sm font-medium">Email<input name="email" type="email" required autoCapitalize="none" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3" placeholder="nome@azienda.it" /></label>
        <label className="text-sm font-medium">Ruolo<select name="role" defaultValue="RECRUITER" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3"><option value="RECRUITER">Selezionatore</option><option value="VIEWER">Consultazione</option><option value="ADMIN">Amministratore</option></select></label>
        <label className="text-sm font-medium">Password<div className="mt-1 flex gap-2"><input key={generatedPassword} name="password" type="text" required minLength={12} defaultValue={generatedPassword} autoComplete="new-password" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-3" /><button type="button" onClick={() => setGeneratedPassword(securePassword())} className="min-h-12 rounded-lg border border-teal-700 px-3 text-sm font-semibold text-teal-800">Genera</button></div></label>
        <div className="md:col-span-2 flex justify-end"><button disabled={busy === "create"} className="min-h-12 rounded-lg bg-teal-700 px-6 font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy === "create" ? "Creazione…" : "Crea utente"}</button></div>
      </form>
    </section>

    <section className="space-y-3">
      <div><h2 className="text-xl font-bold">Utenti esistenti</h2><p className="text-sm text-slate-500">La disattivazione impedisce subito nuovi accessi e chiude le sessioni aperte.</p></div>
      {loading && <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">Caricamento utenti…</div>}
      {!loading && users.map(user => <article key={user.id} className={`rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${user.isActive ? "border-slate-200" : "border-slate-200 opacity-70"}`}>
        {editing?.id === user.id ? <form onSubmit={updateUser} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Nome<input name="name" defaultValue={user.name || ""} className="mt-1 w-full rounded-lg border px-3 py-3" /></label>
          <label className="text-sm font-medium">Email<input name="email" type="email" required defaultValue={user.email} className="mt-1 w-full rounded-lg border px-3 py-3" /></label>
          <label className="text-sm font-medium">Ruolo<select name="role" defaultValue={user.role} className="mt-1 w-full rounded-lg border bg-white px-3 py-3"><option value="RECRUITER">Selezionatore</option><option value="VIEWER">Consultazione</option><option value="ADMIN">Amministratore</option></select></label>
          <label className="text-sm font-medium">Nuova password <span className="font-normal text-slate-500">(facoltativa)</span><input name="password" type="password" minLength={12} autoComplete="new-password" className="mt-1 w-full rounded-lg border px-3 py-3" placeholder="Lascia vuoto per non cambiarla" /></label>
          <div className="flex justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-lg border px-4 font-semibold">Annulla</button><button disabled={busy === user.id} className="min-h-11 rounded-lg bg-teal-700 px-5 font-semibold text-white">Salva modifiche</button></div>
        </form> : <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-bold">{user.name || user.email}</h3>{user.id === currentUserId && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">Tu</span>}<span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{user.isActive ? "Attivo" : "Disattivato"}</span></div><p className="mt-1 break-all text-sm text-slate-600">{user.email}</p><p className="mt-2 text-sm"><span className="font-semibold">{roleInfo[user.role].label}</span> · <span className="text-slate-500">{roleInfo[user.role].description}</span></p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEditing(user)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Modifica</button>{user.id !== currentUserId && <><button disabled={busy === user.id} type="button" onClick={() => void setActive(user, !user.isActive)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${user.isActive ? "border border-amber-300 text-amber-800" : "bg-emerald-700 text-white"}`}>{user.isActive ? "Disattiva" : "Riattiva"}</button><button disabled={busy === user.id} type="button" onClick={() => void deleteUser(user)} className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700">Elimina</button></>}</div>
        </div>}
      </article>)}
    </section>
  </>;
}
