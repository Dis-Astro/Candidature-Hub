"use client";

import { FormEvent, useState } from "react";
import { BrandMark } from "../BrandMark";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password"), remember }),
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

  return <div className="grid min-h-[calc(100dvh-2rem)] place-items-center">
    <div className="grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-[#d7d4cd] bg-[#fffefa] shadow-[0_28px_80px_rgba(44,53,66,.16)] md:min-h-[36rem] md:grid-cols-[1.1fr_1fr]">
      <div className="hidden bg-[#2c3542] p-10 text-white md:flex md:flex-col md:justify-between lg:p-12">
        <div><BrandMark /><h1 className="mt-8 text-4xl font-bold tracking-tight">Candidature Hub</h1><p className="mt-4 max-w-sm text-base leading-7 text-[#dfe6eb]">Curriculum, valutazioni e colloqui in un unico spazio protetto.</p></div>
      </div>
    <form onSubmit={submit} className="self-center space-y-5 p-6 sm:p-10 lg:p-12">
      <div><h1 className="text-2xl font-semibold">Accedi</h1><p className="mt-1 text-sm text-slate-500">Inserisci le credenziali assegnate dall’amministratore.</p></div>
      <label className="block text-sm font-medium">Email<input name="email" type="email" required autoFocus autoCapitalize="none" autoComplete="username" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" /></label>
      <label className="block text-sm font-medium">Password<input name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />Resta collegato</label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />Mostra password</label>
      </div>
      <p className="text-xs leading-5 text-slate-500">Con “Resta collegato” l’accesso viene ricordato su questo dispositivo senza salvare la password.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="primary-action w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-60">{busy ? "Accesso…" : "Accedi"}</button>
    </form>
    </div>
  </div>;
}
