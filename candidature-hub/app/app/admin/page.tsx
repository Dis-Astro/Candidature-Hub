"use client";

import { useState, useEffect } from "react";

type Config = {
  // NAS
  nasPath: string;
  processedPath: string;
  // IMAP (mail2pdf)
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  pollSeconds: number;
  postAction: string;
  moveFolder: string;
  retentionDays: number;
  // SMTP Alert
  alertTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  // Parser
  parserTimerSec: number;
  ocrEnabled: boolean;
};

type RetentionReport = {
  candidatesCount: number;
  attachmentsCount: number;
  filesCount: number;
  candidates: Array<{
    displayId: number;
    firstName: string;
    lastName: string;
    updatedAt: string;
    attachmentsCount: number;
  }>;
} | null;

const DEFAULT_CONFIG: Config = {
  nasPath: "/mnt/nas_curriculum/mail2pdf",
  processedPath: "/mnt/nas_curriculum/mail2pdf/processed",
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPass: "",
  imapMailbox: "INBOX",
  pollSeconds: 60,
  postAction: "move",
  moveFolder: "Processed",
  retentionDays: 365,
  alertTo: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  parserTimerSec: 60,
  ocrEnabled: false,
};

export default function AdminPage() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningParser, setRunningParser] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // GDPR Retention state
  const [retentionReport, setRetentionReport] = useState<RetentionReport>(null);
  const [loadingRetention, setLoadingRetention] = useState(false);
  const [executingRetention, setExecutingRetention] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : DEFAULT_CONFIG))
      .then((data) => setConfig({ ...DEFAULT_CONFIG, ...data }))
      .catch(() => setConfig(DEFAULT_CONFIG))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage({ type: "ok", text: "Configurazione salvata" });
    } catch (e: unknown) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleRunParser() {
    setRunningParser(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/run-parser", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMessage({ type: "ok", text: data.message || "Parser avviato" });
    } catch (e: unknown) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setRunningParser(false);
    }
  }

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Caricamento configurazione...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Gestione Sistema</h1>
      <p className="text-sm text-gray-600">
        Configura percorsi NAS, parametri IMAP/SMTP e parser. Solo ADMIN.
      </p>

      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === "ok"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-red-100 text-red-800 border border-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* NAS */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">Percorsi NAS</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">Cartella CV in ingresso</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.nasPath}
              onChange={(e) => update("nasPath", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Cartella CV elaborati</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.processedPath}
              onChange={(e) => update("processedPath", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* IMAP */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">IMAP (mail2pdf)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">Host IMAP</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.imapHost}
              onChange={(e) => update("imapHost", e.target.value)}
              placeholder="imap.example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Porta</label>
            <input
              type="number"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.imapPort}
              onChange={(e) => update("imapPort", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Utente</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.imapUser}
              onChange={(e) => update("imapUser", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Password</label>
            <input
              type="password"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.imapPass}
              onChange={(e) => update("imapPass", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Mailbox</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.imapMailbox}
              onChange={(e) => update("imapMailbox", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Poll (secondi)</label>
            <input
              type="number"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.pollSeconds}
              onChange={(e) => update("pollSeconds", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Post-action</label>
            <select
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.postAction}
              onChange={(e) => update("postAction", e.target.value)}
            >
              <option value="none">Nessuna</option>
              <option value="move">Sposta in cartella</option>
              <option value="delete">Elimina</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Cartella destinazione</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.moveFolder}
              onChange={(e) => update("moveFolder", e.target.value)}
              disabled={config.postAction !== "move"}
            />
          </div>
        </div>
      </section>

      {/* Retention GDPR */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">Retention GDPR</h2>
        <div className="max-w-xs">
          <label className="block text-xs font-medium text-gray-700">
            Giorni di retention (0 = disabilitata)
          </label>
          <input
            type="number"
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            value={config.retentionDays}
            onChange={(e) => update("retentionDays", Number(e.target.value))}
          />
        </div>
      </section>

      {/* SMTP Alert */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">Alert SMTP</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">Destinatario alert</label>
            <input
              type="email"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.alertTo}
              onChange={(e) => update("alertTo", e.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Host SMTP</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.smtpHost}
              onChange={(e) => update("smtpHost", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Porta SMTP</label>
            <input
              type="number"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.smtpPort}
              onChange={(e) => update("smtpPort", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Utente SMTP</label>
            <input
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.smtpUser}
              onChange={(e) => update("smtpUser", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">Password SMTP</label>
            <input
              type="password"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.smtpPass}
              onChange={(e) => update("smtpPass", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Parser */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">Parser CV</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Frequenza timer (secondi)
            </label>
            <input
              type="number"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              value={config.parserTimerSec}
              onChange={(e) => update("parserTimerSec", Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input
              type="checkbox"
              id="ocrEnabled"
              checked={config.ocrEnabled}
              onChange={(e) => update("ocrEnabled", e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="ocrEnabled" className="text-sm text-gray-700">
              Abilita OCR (richiede tesseract)
            </label>
          </div>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={handleRunParser}
            disabled={runningParser}
            className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {runningParser ? "Avvio in corso..." : "Esegui parser ora"}
          </button>
        </div>
      </section>

      {/* Salva */}
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center rounded-md bg-teal-600 px-6 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva configurazione"}
        </button>
      </div>
    </div>
  );
}
