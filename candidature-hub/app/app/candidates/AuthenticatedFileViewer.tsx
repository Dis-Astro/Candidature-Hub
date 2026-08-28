"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type Props = {
  url: string;
  filename: string;
  children: ReactNode;
  className?: string;
  title?: string;
};

export function AuthenticatedFileViewer({
  url,
  filename,
  children,
  className,
  title,
}: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setError(null);
  }, []);

  useEffect(() => {
    if (!objectUrl && !error) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, error, objectUrl]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  async function openFile() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(response.status === 401
          ? "La sessione è scaduta. Accedi nuovamente e riprova."
          : "Non è stato possibile aprire il documento.");
      }

      const blob = await response.blob();
      setMimeType(blob.type || "application/octet-stream");
      setObjectUrl(URL.createObjectURL(blob));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Errore durante l’apertura del documento.");
    } finally {
      setLoading(false);
    }
  }

  const isImage = mimeType.startsWith("image/");
  const isAudio = mimeType.startsWith("audio/");

  return (
    <>
      <button
        type="button"
        onClick={openFile}
        disabled={loading}
        className={className}
        title={title}
      >
        {loading ? "Apertura…" : children}
      </button>

      {(objectUrl || error) && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-slate-950/95" role="dialog" aria-modal="true" aria-label={filename}>
          <header className="flex min-h-16 items-center gap-3 border-b border-white/15 bg-slate-900 px-4 text-white shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{filename}</p>
              <p className="text-xs text-slate-300">Documento aperto dentro Candidature Hub</p>
            </div>
            {objectUrl && (
              <a
                href={objectUrl}
                download={filename}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 text-sm font-semibold hover:bg-white/10"
              >
                Scarica
              </a>
            )}
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-bold text-slate-900"
              aria-label="Chiudi documento"
            >
              Chiudi
            </button>
          </header>

          <div className="min-h-0 flex-1 bg-slate-100">
            {error ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
                  <p className="font-semibold text-red-700">Documento non disponibile</p>
                  <p className="mt-2 text-sm text-slate-600">{error}</p>
                  <button type="button" onClick={close} className="mt-5 min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white">
                    Torna alla scheda
                  </button>
                </div>
              </div>
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={objectUrl!} alt={filename} className="h-full w-full object-contain" />
            ) : isAudio ? (
              <div className="flex h-full items-center justify-center p-6">
                <audio src={objectUrl!} controls autoPlay className="w-full max-w-2xl" />
              </div>
            ) : (
              <iframe src={objectUrl!} title={filename} className="h-full w-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
