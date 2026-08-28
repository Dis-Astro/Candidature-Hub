"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearOfflineDraft,
  createOfflineOperation,
  loadOfflineDraft,
  saveOfflineDraft,
  submitOfflineOperation,
} from "../../../lib/offline-client";

const MANSIONE_OPTIONS = [
  "Ufficio Tecnico", "Segreteria", "Ufficio Gare", "Operaio",
  "Project Manager", "Ufficio Amministrativo", "Magazziniere", "Autista", "Altro",
];
const DRAFT_KEY = "candidate:new";

type CandidateDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mansione: string;
};

export default function NewCandidatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const draftLoaded = useRef(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mansione, setMansione] = useState("");

  useEffect(() => {
    void loadOfflineDraft<CandidateDraft>(DRAFT_KEY).then((draft) => {
      if (draft) {
        setFirstName(draft.value.firstName || "");
        setLastName(draft.value.lastName || "");
        setEmail(draft.value.email || "");
        setPhone(draft.value.phone || "");
        setMansione(draft.value.mansione || "");
        setNotice("Ho recuperato la bozza che avevi lasciato su questo iPad.");
      }
      draftLoaded.current = true;
    }).catch(() => {
      draftLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!draftLoaded.current) return;
    const timer = window.setTimeout(() => {
      const draft = { firstName, lastName, email, phone, mansione };
      if (Object.values(draft).some(Boolean)) void saveOfflineDraft(DRAFT_KEY, draft);
      else void clearOfflineDraft(DRAFT_KEY);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [email, firstName, lastName, mansione, phone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Nome e Cognome sono obbligatori");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const result = await submitOfflineOperation(
        createOfflineOperation("candidate.create", {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          mansione: mansione || null,
        })
      );

      if (result.status === "applied" || result.status === "duplicate") {
        await clearOfflineDraft(DRAFT_KEY);
        router.push(`/candidates/${result.displayId}`);
        return;
      }
      if (result.message !== "queued") throw new Error(result.message || "La sincronizzazione richiede un controllo.");

      await clearOfflineDraft(DRAFT_KEY);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setMansione("");
      setNotice("Candidato salvato su questo iPad. Lo invierò automaticamente al server appena torna la connessione.");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="eyebrow">Inserimento manuale</p>
        <h1 className="page-title mt-2">Nuovo candidato</h1>
        <p className="page-subtitle">Crea il profilo essenziale. Potrai aggiungere colloquio, note e documenti nella scheda successiva.</p>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm font-medium text-teal-900" role="status">
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="surface-card space-y-5 p-5 md:p-7">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              placeholder="Mario"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
              Cognome <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              placeholder="Rossi"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            placeholder="mario.rossi@email.com"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
            Telefono
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            placeholder="+39 333 1234567"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
            Mansione
          </label>
          <select
            value={mansione}
            onChange={(e) => setMansione(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">— Seleziona —</option>
            {MANSIONE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="touch-button flex-1 border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={saving}
            className="touch-button flex-1 bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? "Creazione..." : "Crea candidato"}
          </button>
        </div>
      </form>
    </div>
  );
}
