"use client";

import { useState, useEffect, useCallback } from "react";

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
};

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsSection({ candidateId }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("candidateId", candidateId);

      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload fallito");
      }

      // Refresh lista
      await fetchAttachments();
      
      // Reset input
      e.target.value = "";
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Eliminare "${filename}"?`)) return;

    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Eliminazione fallita");
      }
      await fetchAttachments();
    } catch (err) {
      setError(String(err));
    }
  };

  const isAudio = (mimeType: string) => mimeType.startsWith("audio/");
  const isImage = (mimeType: string) => mimeType.startsWith("image/");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Allegati</h2>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer disabled:opacity-50">
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
                accept=".pdf,.mp3,.wav,.ogg,.m4a,.webm,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.txt"
              />
            </>
          )}
        </label>
      </div>

      <p className="text-xs text-slate-500">
        PDF, audio (MP3, WAV, M4A), immagini, documenti Word. Max 50MB per file.
      </p>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Caricamento allegati...</div>
      ) : attachments.length === 0 ? (
        <div className="text-sm text-slate-500 italic">Nessun allegato</div>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="text-2xl">{TYPE_ICONS[att.type] || "📎"}</span>

              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{att.filename}</div>
                <div className="text-xs text-slate-500">
                  {TYPE_LABELS[att.type] || att.type} • {formatSize(att.size)} •{" "}
                  {new Date(att.createdAt).toLocaleString("it-IT")}
                </div>
              </div>

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
                  <a
                    href={`/api/attachments/${att.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 rounded border overflow-hidden"
                  >
                    <img
                      src={`/api/attachments/${att.id}`}
                      alt={att.filename}
                      className="w-full h-full object-cover"
                    />
                  </a>
                )}

                {/* Download */}
                <a
                  href={`/api/attachments/${att.id}`}
                  download={att.filename}
                  className="p-2 rounded-md hover:bg-slate-200 text-slate-600"
                  title="Scarica"
                >
                  ⬇️
                </a>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(att.id, att.filename)}
                  className="p-2 rounded-md hover:bg-red-100 text-red-600"
                  title="Elimina"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
