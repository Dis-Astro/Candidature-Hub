"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Config = {
  storageMode: string;
  storageRoot: string;
  mailInboxPath: string;
  manualInboxPath: string;
  processedPath: string;
  attachmentsPath: string;
  backupPath: string;
  errorPath: string;
  // IMAP (mail2pdf)
  mailEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  pollSeconds: number;
  postAction: string;
  moveFolder: string;
  retentionDays: number;
  mailRetentionDays: number;
  backupRetentionDays: number;
  errorRetentionDays: number;
  // SMTP Alert
  alertTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  // Parser
  parserPollSeconds: number;
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
  storageMode: "docker-volume",
  storageRoot: "/data",
  mailInboxPath: "inbox/mail",
  manualInboxPath: "inbox/manual",
  processedPath: "processed",
  attachmentsPath: "attachments",
  backupPath: "backups",
  errorPath: "error",
  mailEnabled: false,
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPass: "",
  imapMailbox: "INBOX",
  pollSeconds: 60,
  postAction: "move",
  moveFolder: "Processed",
  retentionDays: 365,
  mailRetentionDays: 90,
  backupRetentionDays: 30,
  errorRetentionDays: 30,
  alertTo: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  parserPollSeconds: 30,
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
  const [testingMail, setTestingMail] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // GDPR Retention state
  const [retentionReport, setRetentionReport] = useState<RetentionReport>(null);

  // DB Test state
  const [testingDb, setTestingDb] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; message: string; details?: Record<string, string> } | null>(null);
  const [loadingRetention, setLoadingRetention] = useState(false);
  const [executingRetention, setExecutingRetention] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [backups, setBackups] = useState<Array<{ name: string; size: number }>>([]);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : DEFAULT_CONFIG))
      .then((data) => {
        const relative = (value: string) => value?.startsWith("/data/") ? value.slice(6) : value;
        setConfig({
          ...DEFAULT_CONFIG,
          ...data,
          mailInboxPath: relative(data.mailInboxPath),
          manualInboxPath: relative(data.manualInboxPath),
          processedPath: relative(data.processedPath),
          attachmentsPath: relative(data.attachmentsPath),
          backupPath: relative(data.backupPath),
          errorPath: relative(data.errorPath),
        });
      })
      .catch(() => setConfig(DEFAULT_CONFIG))
      .finally(() => setLoading(false));
  }, []);

  async function loadBackups() {
    const response = await fetch("/api/admin/backups");
    if (response.ok) setBackups((await response.json()).backups || []);
  }

  useEffect(() => { void loadBackups(); }, []);

  async function createBackup() {
    setBackupBusy(true);
    try {
      const response = await fetch("/api/admin/backups", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error(await response.text());
      await loadBackups();
    } catch (error) { setMessage({ type: "err", text: String(error) }); }
    finally { setBackupBusy(false); }
  }

  async function uploadBackup(file: File) {
    setBackupBusy(true);
    try {
      const response = await fetch("/api/admin/backups", { method: "POST", headers: { "content-type": "application/gzip", "x-backup-name": file.name }, body: file });
      if (!response.ok) throw new Error(await response.text());
      await loadBackups();
    } catch (error) { setMessage({ type: "err", text: String(error) }); }
    finally { setBackupBusy(false); }
  }

  async function uploadCurricula(files: FileList) {
    const form = new FormData();
    Array.from(files).forEach(file => form.append("files", file));
    const response = await fetch("/api/admin/ingest", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? { type: "ok", text: body.message } : { type: "err", text: body.error || "Caricamento fallito" });
  }

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

  async function handleTestMail() {
    setTestingMail(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/test-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verifica non riuscita");
      setMessage({ type: "ok", text: data.message });
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setTestingMail(false);
    }
  }

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Caricamento configurazione...</div>;
  }

  return (
    <div className="admin-page mx-auto max-w-7xl space-y-6 p-0 sm:p-2">
      <header>
        <p className="eyebrow">Amministrazione</p>
        <h1 className="page-title mt-2">Gestione sistema</h1>
        <p className="page-subtitle">Configura archivio, casella email, parser, backup e accessi amministrativi.</p>
      </header>

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

      {/* Storage */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">Archivio e destinazione dei file</h2>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p><strong>Archivio permanente gestito dall&apos;app.</strong></p>
          <p className="mt-1 text-xs">Non dipende da un NAS. Indica le cartelle in cui far confluire i diversi file; quelle mancanti vengono create automaticamente e tutto viene incluso nei backup.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {([
            ["mailInboxPath", "CV ricevuti via email"],
            ["manualInboxPath", "CV inseriti/scansionati manualmente"],
            ["processedPath", "CV elaborati"],
            ["attachmentsPath", "Allegati candidati"],
            ["backupPath", "Backup esportabili"],
            ["errorPath", "PDF non elaborabili"],
          ] as const).map(([key, label]) => <div key={key}>
            <label className="block text-xs font-medium text-gray-700">{label}</label>
            <input className="mt-1 w-full border rounded-md px-3 py-2 text-sm" value={config[key]} onChange={(e) => update(key, e.target.value)} placeholder="es. archivio/curriculum" />
          </div>)}
        </div>
        <button type="button" className="text-sm text-blue-700 underline" onClick={() => setConfig(prev => ({
          ...prev,
          mailInboxPath: DEFAULT_CONFIG.mailInboxPath,
          manualInboxPath: DEFAULT_CONFIG.manualInboxPath,
          processedPath: DEFAULT_CONFIG.processedPath,
          attachmentsPath: DEFAULT_CONFIG.attachmentsPath,
          backupPath: DEFAULT_CONFIG.backupPath,
          errorPath: DEFAULT_CONFIG.errorPath,
        }))}>Ripristina cartelle consigliate</button>
      </section>

      {/* IMAP */}
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">Casella email dei curriculum</h2>
        <p className="text-sm text-gray-600">Puoi cambiare questi parametri in qualsiasi momento. Il lettore email li applica senza riavviare Docker.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.mailEnabled} onChange={(e) => update("mailEnabled", e.target.checked)} />Acquisizione email abilitata</label>
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
          <div>
            <label className="block text-xs font-medium text-gray-700">Conserva email elaborate (giorni)</label>
            <input type="number" min={1} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={config.mailRetentionDays} onChange={(e) => update("mailRetentionDays", Number(e.target.value))} />
          </div>
        </div>
        <button type="button" onClick={handleTestMail} disabled={testingMail || !config.imapHost || !config.imapUser} className="rounded-md border border-teal-700 px-4 py-2 text-sm font-medium text-teal-800 disabled:opacity-50">
          {testingMail ? "Verifica in corso..." : "Verifica collegamento email"}
        </button>
      </section>

      {/* Retention GDPR */}
      <section className="border rounded-lg p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Cancellazione Automatica Candidati (GDPR)</h2>
          <p className="text-sm text-gray-600 mt-1">
            Elimina automaticamente i dati dei candidati <strong>SCARTATI</strong> più vecchi di X giorni.
            L&apos;azione rimuoverà il record dal database e i file associati dall&apos;archivio.
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
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 sm:gap-4">
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
                <div className="text-xs text-gray-600">File archivio</div>
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
                        <td className="p-2">{new Date(c.updatedAt).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</td>
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
                <li>• <strong>{retentionReport.filesCount}</strong> file dall&apos;archivio</li>
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
              value={config.parserPollSeconds}
              onChange={(e) => update("parserPollSeconds", Number(e.target.value))}
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

      {/* Configurazione Database */}
      <section className="border rounded-lg p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Configurazione Database</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configura un database PostgreSQL esterno invece di quello locale.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="useExternalDb"
            checked={config.useExternalDb}
            onChange={(e) => update("useExternalDb", e.target.checked)}
            className="h-5 w-5"
          />
          <label htmlFor="useExternalDb" className="text-sm font-medium text-gray-700">
            Usa database esterno
          </label>
        </div>

        {config.useExternalDb && (
          <>
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700 font-medium">
                La password viene cifrata prima del salvataggio. Usa comunque un account PostgreSQL dedicato con privilegi limitati.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">Host</label>
                <input
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  value={config.extDbHost}
                  onChange={(e) => update("extDbHost", e.target.value)}
                  placeholder="localhost"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Porta</label>
                <input
                  type="number"
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  value={config.extDbPort}
                  onChange={(e) => update("extDbPort", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Nome DB</label>
                <input
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  value={config.extDbName}
                  onChange={(e) => update("extDbName", e.target.value)}
                  placeholder="candidature_hub"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Utente</label>
                <input
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  value={config.extDbUser}
                  onChange={(e) => update("extDbUser", e.target.value)}
                  placeholder="postgres"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  value={config.extDbPass}
                  onChange={(e) => update("extDbPass", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="extDbSsl"
                  checked={config.extDbSsl}
                  onChange={(e) => update("extDbSsl", e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="extDbSsl" className="text-sm text-gray-700">
                  Richiedi connessione SSL
                </label>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <button
                type="button"
                onClick={async () => {
                  setTestingDb(true);
                  setDbTestResult(null);
                  try {
                    const res = await fetch("/api/admin/test-db", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        host: config.extDbHost,
                        port: config.extDbPort,
                        dbname: config.extDbName,
                        user: config.extDbUser,
                        password: config.extDbPass === "********" ? "" : config.extDbPass,
                        ssl: config.extDbSsl,
                      }),
                    });
                    const data = await res.json();
                    setDbTestResult({
                      ok: data.ok,
                      message: data.ok ? data.message : data.error,
                      details: data.details,
                    });
                  } catch (e) {
                    setDbTestResult({ ok: false, message: String(e) });
                  } finally {
                    setTestingDb(false);
                  }
                }}
                disabled={testingDb || !config.extDbHost || !config.extDbName || !config.extDbUser}
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {testingDb ? "Test in corso..." : "Test Connessione"}
              </button>

              {dbTestResult && (
                <div className={`flex-1 p-3 rounded-md text-sm ${dbTestResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  <p className="font-medium">{dbTestResult.ok ? "✅" : "❌"} {dbTestResult.message}</p>
                  {dbTestResult.details && (
                    <p className="text-xs mt-1 opacity-80">
                      {dbTestResult.details.version} • DB: {dbTestResult.details.database} • User: {dbTestResult.details.user}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {config.useExternalDb && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800 font-medium">
              Questo profilo serve per verificare un database di destinazione. Per spostare l&apos;app usa un backup e aggiorna DATABASE_URL nel file .env Docker.
            </p>
            <code className="block mt-2 p-2 bg-white rounded text-xs font-mono">
              docker compose --profile tools run --rm restore /data/backups/NOME-BACKUP.tar.gz
            </code>
          </div>
        )}
      </section>

      <section className="border rounded-lg p-4 space-y-3">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-lg">Utenti e ruoli</h2><p className="text-xs text-slate-500">Crea accessi, modifica ruoli, reimposta password e disattiva utenti.</p></div>
          <Link href="/admin/users" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900">Gestisci utenti</Link>
        </div>
        <div className="flex items-center justify-between"><div><h2 className="font-semibold text-lg">Backup e migrazione</h2><p className="text-xs text-slate-500">Ogni archivio contiene database PostgreSQL e tutto lo storage. Il ripristino si applica a servizi fermi.</p></div><button type="button" onClick={createBackup} disabled={backupBusy} className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">Crea backup</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Conserva backup (giorni)<input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={config.backupRetentionDays} onChange={e => update("backupRetentionDays", Number(e.target.value))} /></label>
          <label className="text-sm">Conserva file con errore (giorni)<input type="number" min={1} className="mt-1 w-full rounded border px-3 py-2" value={config.errorRetentionDays} onChange={e => update("errorRetentionDays", Number(e.target.value))} /></label>
        </div>
        <label className="inline-flex cursor-pointer rounded border px-3 py-2 text-sm">Importa archivio<input type="file" accept=".gz" className="sr-only" disabled={backupBusy} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadBackup(file); }} /></label>
        <div className="divide-y rounded border">
          {backups.map(item => <div key={item.name} className="flex items-center justify-between p-2 text-sm"><span className="font-mono text-xs">{item.name} ({(item.size / 1048576).toFixed(1)} MB)</span><a className="text-blue-700 underline" href={`/api/admin/backups?download=${encodeURIComponent(item.name)}`}>Scarica</a></div>)}
          {backups.length === 0 && <p className="p-3 text-sm text-slate-500">Nessun backup disponibile.</p>}
        </div>
        <div className="border-t pt-3"><label className="inline-flex cursor-pointer rounded bg-teal-700 px-4 py-2 text-sm text-white">Carica CV manualmente<input type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={e => { if (e.target.files) void uploadCurricula(e.target.files); }} /></label><p className="mt-1 text-xs text-slate-500">Fino a 50 PDF; vengono depositati nella cartella manuale e acquisiti ricorsivamente dal parser.</p></div>
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
