"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "online" | "offline" | "restored";

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("online");
  const wasOffline = useRef(false);

  const verifyConnection = useCallback(async () => {
    if (!navigator.onLine) {
      wasOffline.current = true;
      setStatus("offline");
      return;
    }

    try {
      const response = await fetch("/health", {
        cache: "no-store",
        credentials: "same-origin",
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) throw new Error("server unavailable");

      if (wasOffline.current) {
        wasOffline.current = false;
        setStatus("restored");
        window.setTimeout(() => setStatus("online"), 3_500);
      } else {
        setStatus("online");
      }
    } catch {
      wasOffline.current = true;
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    void verifyConnection();
    const handleOnline = () => void verifyConnection();
    const handleOffline = () => {
      wasOffline.current = true;
      setStatus("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const timer = window.setInterval(() => void verifyConnection(), 30_000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(timer);
    };
  }, [verifyConnection]);

  if (status === "online") return null;

  return (
    <div
      className={`fixed inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] z-[140] mx-auto max-w-2xl rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${
        status === "offline"
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-emerald-300 bg-emerald-50 text-emerald-900"
      }`}
      role="status"
      aria-live="polite"
    >
      {status === "offline"
        ? "Connessione assente: il server non può salvare le modifiche. Non chiudere la scheda e riprova quando la rete torna disponibile."
        : "Connessione ripristinata: puoi tornare a salvare normalmente."}
    </div>
  );
}
