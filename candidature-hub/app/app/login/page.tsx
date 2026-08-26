"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Accesso non riuscito");
      return;
    }
    // A full navigation makes the new HttpOnly session cookie visible to all
    // server components immediately. A client-side transition can otherwise
    // reuse the unauthenticated layout and leave the login page on screen.
    window.location.replace("/");
  }

  return <main className="grid min-h-[75vh] place-items-center">
    <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-[1.05fr_1fr]">
      <div className="hidden bg-gradient-to-br from-teal-800 to-slate-900 p-10 text-white md:flex md:flex-col md:justify-between">
        <div><div className="text-4xl">📋</div><h1 className="mt-5 text-3xl font-bold">Candidature Hub</h1><p className="mt-3 text-teal-50">Curriculum, valutazioni e colloqui in un unico spazio protetto.</p></div>
        <p className="text-sm text-teal-100">Ottimizzato per iPad e tablet Android.</p>
      </div>
    <form onSubmit={submit} className="space-y-5 p-6 sm:p-9">
      <div><h1 className="text-2xl font-semibold">Accedi</h1><p className="mt-1 text-sm text-slate-500">Inserisci le credenziali assegnate dall’amministratore.</p></div>
      <label className="block text-sm font-medium">Email<input name="email" type="email" required autoFocus autoCapitalize="none" autoComplete="username" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="block text-sm font-medium">Password<input name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />Mostra password</label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60">{busy ? "Accesso…" : "Accedi"}</button>
    </form>
    </div>
  </main>;
}
