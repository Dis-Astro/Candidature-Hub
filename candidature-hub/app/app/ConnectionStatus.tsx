"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  discardOfflineOperations,
  flushOfflineOperations,
  getOfflineOperationCount,
  OFFLINE_QUEUE_EVENT,
} from "../lib/offline-client";

type Status = "online" | "offline" | "restored";

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("online");
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [conflictIds, setConflictIds] = useState<string[]>([]);
  const wasOffline = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      setPendingCount(await getOfflineOperationCount());
    } catch {
      // Safari può rendere temporaneamente indisponibile IndexedDB durante l'avvio.
    }
  }, []);

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

      const syncResults = await flushOfflineOperations().catch(() => []);
      const conflicts = syncResults.filter((item) => item.status === "conflict");
      setConflictCount(conflicts.length);
      setConflictIds(conflicts.map((item) => item.operationId));
      await refreshPendingCount();

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
  }, [refreshPendingCount]);

  useEffect(() => {
    void verifyConnection();
    void refreshPendingCount();
    const handleOnline = () => void verifyConnection();
    const handleOffline = () => {
      wasOffline.current = true;
      setStatus("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OFFLINE_QUEUE_EVENT, refreshPendingCount);
    const timer = window.setInterval(() => void verifyConnection(), 30_000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, refreshPendingCount);
      window.clearInterval(timer);
    };
  }, [refreshPendingCount, verifyConnection]);

  if (status === "online" && pendingCount === 0 && conflictCount === 0) return null;

  const hasPending = pendingCount > 0;
  const hasConflict = conflictCount > 0;
  const isWarning = status === "offline" || hasPending || hasConflict;

  async function keepServerVersion() {
    if (!window.confirm("Scartare le modifiche offline in conflitto e mantenere la versione presente sul server?")) return;
    await discardOfflineOperations(conflictIds);
    setConflictCount(0);
    setConflictIds([]);
    await refreshPendingCount();
  }

  return (
    <div
      className={`fixed inset-x-3 top-[max(.75rem,env(safe-area-inset-top))] z-[140] mx-auto max-w-2xl rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${
        isWarning
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-emerald-300 bg-emerald-50 text-emerald-900"
      }`}
      role="status"
      aria-live="polite"
    >
      {hasConflict
        ? <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{conflictCount} modifica {conflictCount === 1 ? "richiede" : "richiedono"} un controllo: la scheda è cambiata anche sul server.</span>
            <button type="button" onClick={keepServerVersion} className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold">Mantieni versione server</button>
          </span>
        : status === "offline"
          ? hasPending
            ? `Sei offline: ${pendingCount} ${pendingCount === 1 ? "modifica è custodita" : "modifiche sono custodite"} sull’iPad e saranno sincronizzate automaticamente.`
            : "Sei offline: quando premi Salva, la modifica viene custodita sull’iPad e sincronizzata al ritorno della rete."
          : hasPending
            ? `Sincronizzazione in corso: ${pendingCount} ${pendingCount === 1 ? "modifica in attesa" : "modifiche in attesa"}.`
            : "Connessione ripristinata: le modifiche offline sono state sincronizzate."}
    </div>
  );
}
