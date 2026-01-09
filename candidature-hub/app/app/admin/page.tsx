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
  // Database esterno
  useExternalDb: boolean;
  extDbHost: string;
  extDbPort: number;
  extDbName: string;
  extDbUser: string;
  extDbPass: string;
  extDbSsl: boolean;
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
  // Database esterno
  useExternalDb: false,
  extDbHost: "localhost",
  extDbPort: 5432,
  extDbName: "",
  extDbUser: "",
  extDbPass: "",
  extDbSsl: false,
};

export default function AdminPage() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningParser, setRunningParser] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // GDPR Retention state
  const [retentionReport, setRetentionReport] = useState<RetentionReport>(null);

  // DB Test state
  const [testingDb, setTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; message: string; details?: Record<string, string> } | null>(null);
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
      <section className="border rounded-lg p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Cancellazione Automatica Candidati (GDPR)</h2>
          <p className="text-sm text-gray-600 mt-1">
            Elimina automaticamente i dati dei candidati <strong>SCARTATI</strong> più vecchi di X giorni.
            L'azione rimuoverà il record dal database e i file associati dal NAS.
          </p>
        </div>

        <div className="max-w-xs">
          <label className="block text-xs font-medium text-gray-700">
            Giorni di retention (es. 365)
          </label>
          <input
            type="number"
            min={1}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            value={config.retentionDays}
            onChange={(e) => update("retentionDays", Number(e.target.value))}
          />
          <p className="text-xs text-gray-500 mt-1">
            I candidati scartati da più di {config.retentionDays} giorni saranno eliminabili.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={async () => {
              if (config.retentionDays <= 0) {
                setMessage({ type: "err", text: "Inserisci un numero di giorni valido" });
                return;
              }
              setLoadingRetention(true);
              setRetentionReport(null);
              try {
                const res = await fetch(`/api/admin/retention?days=${config.retentionDays}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Errore");
                setRetentionReport(data.report);
              } catch (e) {
                setMessage({ type: "err", text: String(e) });
              } finally {
                setLoadingRetention(false);
              }
            }}
            disabled={loadingRetention || config.retentionDays <= 0}
            className="px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
          >
            {loadingRetention ? "Calcolo..." : "SIMULA"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!retentionReport || retentionReport.candidatesCount === 0) {
                setMessage({ type: "err", text: "Esegui prima una simulazione" });
                return;
              }
              setShowConfirmModal(true);
            }}
            disabled={!retentionReport || retentionReport.candidatesCount === 0 || executingRetention}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            ESEGUI PULIZIA
          </button>
        </div>

        {/* Report simulazione */}
        {retentionReport && (
          <div className="border rounded-lg p-4 bg-amber-50 space-y-3">
            <h3 className="font-semibold text-amber-900">Report simulazione</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-white rounded p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">{retentionReport.candidatesCount}</div>
                <div className="text-xs text-gray-600">Candidati</div>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">{retentionReport.attachmentsCount}</div>
                <div className="text-xs text-gray-600">Allegati DB</div>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">{retentionReport.filesCount}</div>
                <div className="text-xs text-gray-600">File NAS</div>
              </div>
            </div>

            {retentionReport.candidates.length > 0 && (
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-amber-100">
                    <tr>
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">Nome</th>
                      <th className="p-2 text-left">Ultimo agg.</th>
                      <th className="p-2 text-right">Allegati</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retentionReport.candidates.slice(0, 20).map((c) => (
                      <tr key={c.displayId} className="border-t">
                        <td className="p-2">{c.displayId}</td>
                        <td className="p-2">{c.firstName} {c.lastName}</td>
                        <td className="p-2">{new Date(c.updatedAt).toLocaleDateString("it-IT")}</td>
                        <td className="p-2 text-right">{c.attachmentsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {retentionReport.candidates.length > 20 && (
                  <p className="text-xs text-gray-500 mt-2">
                    ...e altri {retentionReport.candidates.length - 20} candidati
                  </p>
                )}
              </div>
            )}

            {retentionReport.candidatesCount === 0 && (
              <p className="text-sm text-green-700">✅ Nessun candidato da eliminare con i criteri attuali.</p>
            )}
          </div>
        )}

        {/* Modal conferma */}
        {showConfirmModal && retentionReport && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
              <h3 className="text-lg font-bold text-red-700">⚠️ Conferma eliminazione</h3>
              <p className="mt-3 text-sm text-gray-700">
                Stai per eliminare definitivamente:
              </p>
              <ul className="mt-2 text-sm space-y-1">
                <li>• <strong>{retentionReport.candidatesCount}</strong> candidati</li>
                <li>• <strong>{retentionReport.attachmentsCount}</strong> allegati</li>
                <li>• <strong>{retentionReport.filesCount}</strong> file dal NAS</li>
              </ul>
              <p className="mt-4 text-sm font-semibold text-red-700">
                ⚠️ Questa azione NON può essere annullata.
              </p>
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 rounded-md border text-sm font-medium hover:bg-gray-50"
                >
                  Annulla
                </button>
                <button
                  onClick={async () => {
                    setExecutingRetention(true);
                    setShowConfirmModal(false);
                    try {
                      const res = await fetch("/api/admin/retention", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ days: config.retentionDays, confirm: true }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Errore");
                      setMessage({ type: "ok", text: data.message || "Pulizia completata" });
                      setRetentionReport(null);
                    } catch (e) {
                      setMessage({ type: "err", text: String(e) });
                    } finally {
                      setExecutingRetention(false);
                    }
                  }}
                  disabled={executingRetention}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {executingRetention ? "Eliminazione..." : "CONFERMA ELIMINAZIONE"}
                </button>
              </div>
            </div>
          </div>
        )}
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
