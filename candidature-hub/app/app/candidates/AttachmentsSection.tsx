"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { AuthenticatedFileViewer } from "./AuthenticatedFileViewer";

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  type: string;
  createdAt: string;
  uploadedBy: string;
};

type Props = {
  candidateId: string;
  canEdit?: boolean;
};

type Toast = { type: "success" | "error"; message: string } | null;

const TYPE_LABELS: Record<string, string> = {
  CV: "CV",
  AUDIO_COLLOQUIO: "Audio colloquio",
  DOCUMENTO: "Documento",
  IMMAGINE: "Immagine",
  NOTE: "Note",
  ALTRO: "Altro",
};

const TYPE_ICONS: Record<string, string> = {
  CV: "📄",
  AUDIO_COLLOQUIO: "🎙️",
  DOCUMENTO: "📝",
  IMMAGINE: "🖼️",
  NOTE: "📋",
  ALTRO: "📎",
};

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsSection({ candidateId, canEdit = true }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
  };

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/attachments?candidateId=${candidateId}`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.attachments || []);
      }
    } catch (e) {
      console.error("Failed to fetch attachments:", e);
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validazione client-side dimensione
    if (file.size > MAX_SIZE_BYTES) {
      showToast("error", `❌ File troppo grande. Dimensione massima: ${MAX_SIZE_MB}MB`);
      e.target.value = "";
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("candidateId", candidateId);

      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload fallito");
      }

      showToast("success", `✅ File "${file.name}" caricato con successo`);
      await fetchAttachments();
      e.target.value = "";
    } catch (err) {
      showToast("error", `❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Eliminare "${filename}"?`)) return;

    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Eliminazione fallita");
      }

      showToast("success", `✅ File "${filename}" eliminato`);
      await fetchAttachments();
    } catch (err) {
      showToast("error", `❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const isAudio = (mimeType: string) => mimeType.startsWith("audio/");
  const isImage = (mimeType: string) => mimeType.startsWith("image/");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-4 right-4 top-4 z-50 max-w-md rounded-xl px-5 py-3 text-sm font-medium shadow-2xl transition-all animate-in slide-in-from-top-2 sm:left-auto ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Allegati</h2>
        {canEdit && <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer disabled:opacity-50 transition-colors">
          {uploading ? (
            "Caricamento..."
          ) : (
            <>
              <span>+ Carica file</span>
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
                accept=".pdf,.mp3,.wav,.m4a,.jpg,.jpeg,.png,.gif,.doc,.docx"
              />
            </>
          )}
        </label>}
      </div>

      <p className="text-xs text-slate-500">
        PDF, immagini (JPG/PNG/GIF), audio (MP3/WAV/M4A), documenti Word. <strong>Max {MAX_SIZE_MB}MB per file.</strong>
      </p>

      {loading ? (
        <div className="text-sm text-slate-500">Caricamento allegati...</div>
      ) : attachments.length === 0 ? (
        <div className="text-sm text-slate-500 italic py-4 text-center">Nessun allegato</div>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <AuthenticatedFileViewer
                url={`/api/attachments/${att.id}`}
                filename={att.filename}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-offset-4"
                title={`Apri ${att.filename}`}
              >
                <span className="text-2xl">{TYPE_ICONS[att.type] || "📎"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 underline decoration-slate-300 underline-offset-4">{att.filename}</div>
                  <div className="text-xs text-slate-500">
                    {TYPE_LABELS[att.type] || att.type} • {formatSize(att.size)} •{" "}
                    {new Date(att.createdAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
                  </div>
                </div>
              </AuthenticatedFileViewer>

              <div className="flex items-center gap-2">
                {/* Preview audio inline */}
                {isAudio(att.mimeType) && (
                  <audio
                    controls
                    className="h-8 w-40"
                    src={`/api/attachments/${att.id}`}
                  />
                )}

                {/* Preview immagine */}
                {isImage(att.mimeType) && (
                  <AuthenticatedFileViewer
                    url={`/api/attachments/${att.id}`}
                    filename={att.filename}
                    className="h-12 w-12 overflow-hidden rounded border"
                  >
                    <Image
                      src={`/api/attachments/${att.id}`}
                      alt={att.filename}
                      width={48}
                      height={48}
                      unoptimized
                      className="w-full h-full object-cover"
                    />
                  </AuthenticatedFileViewer>
                )}

                {/* Download */}
                <a
                  href={`/api/attachments/${att.id}`}
                  download={att.filename}
                  className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                  title="Scarica"
                >
                  ⬇️
                </a>

                {/* Delete */}
                {canEdit && <button
                  onClick={() => handleDelete(att.id, att.filename)}
                  className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                  title="Elimina"
                >
                  🗑️
                </button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
