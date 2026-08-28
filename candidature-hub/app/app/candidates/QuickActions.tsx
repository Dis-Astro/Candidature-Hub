"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOfflineOperation, submitOfflineOperation } from "../../lib/offline-client";

type CandidateStatus = "DA_VALUTARE" | "SCARTATO" | "SHORTLIST" | "ASSUMERE";

type Props = {
  candidateId: string;
  discarded: boolean;
  rating: number | null;
  decision: string | null;
  baseUpdatedAt: string;
  canEdit?: boolean;
};

function getStatus(discarded: boolean, rating: number | null, decision: string | null): CandidateStatus {
  if (discarded) return "SCARTATO";
  if (decision === "ASSUME") return "ASSUMERE";
  if (rating !== null && rating >= 5) return "SHORTLIST";
  return "DA_VALUTARE";
}

const STATUS_CONFIG: Record<CandidateStatus, { label: string; icon: string; class: string }> = {
  DA_VALUTARE: { label: "Da valutare", icon: "○", class: "bg-blue-100 text-blue-800 border-blue-300" },
  SCARTATO: { label: "Scartato", icon: "✕", class: "bg-red-100 text-red-800 border-red-300" },
  SHORTLIST: { label: "Shortlist", icon: "✓", class: "bg-green-100 text-green-800 border-green-300" },
  ASSUMERE: { label: "Assumere", icon: "★", class: "bg-amber-100 text-amber-800 border-amber-300" },
};

export function QuickActions({ candidateId, discarded, rating, decision, baseUpdatedAt, canEdit = true }: Props) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [localDiscarded, setLocalDiscarded] = useState(discarded);
  const [localRating, setLocalRating] = useState(rating);
  const [localDecision, setLocalDecision] = useState(decision);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const currentStatus = getStatus(localDiscarded, localRating, localDecision);
  const statusCfg = STATUS_CONFIG[currentStatus];

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAction = async (action: "discard" | "restore" | "shortlist" | "hire") => {
    if (action === "discard" && !window.confirm("Confermi di voler scartare questo candidato?")) return;
    if (action === "hire" && !window.confirm("Confermi la decisione Assumere?")) return;
    setActing(true);
    try {
      const result = await submitOfflineOperation(createOfflineOperation(
        "candidate.quickAction",
        { action },
        { candidateId, baseUpdatedAt }
      ));

      if (result.status === "conflict") {
        showToast("error", result.message || "Scheda modificata sul server: ricaricala.");
        return;
      }
      if (result.status === "error" && result.message !== "queued") {
        showToast("error", result.message || "Errore");
        return;
      }

      // Aggiorna stato locale
      if (action === "discard") {
        setLocalDiscarded(true);
        setLocalDecision(null);
        showToast("success", result.message === "queued" ? "✕ Scartato sull’iPad · in attesa di sincronizzazione" : "✕ Scartato");
      } else if (action === "restore") {
        setLocalDiscarded(false);
        setLocalRating(null);
        setLocalDecision(null);
        showToast("success", result.message === "queued" ? "○ Ripristinato sull’iPad · in attesa di sincronizzazione" : "○ Ripristinato");
      } else if (action === "shortlist") {
        setLocalDiscarded(false);
        setLocalRating(5);
        showToast("success", result.message === "queued" ? "✓ Shortlist salvata sull’iPad" : "✓ Shortlist");
      } else if (action === "hire") {
        setLocalDiscarded(false);
        setLocalDecision("ASSUME");
        showToast("success", result.message === "queued" ? "★ Decisione salvata sull’iPad" : "★ Assumere");
      }

      if (result.status !== "error") router.refresh();
    } catch (e) {
      showToast("error", String(e));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div className={`fixed left-4 right-4 top-4 z-50 rounded-lg px-4 py-2 text-sm font-medium shadow-lg sm:left-auto ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.message}
        </div>
      )}

      {/* Badge stato corrente */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-500 uppercase">Stato:</span>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${statusCfg.class}`}>
          {statusCfg.icon} {statusCfg.label}
        </span>
      </div>

      {/* Pulsanti compatti */}
      {canEdit && <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <button
          onClick={() => handleAction("discard")}
          disabled={acting || currentStatus === "SCARTATO"}
          className={`min-h-12 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
            currentStatus === "SCARTATO"
              ? "bg-red-200 text-red-400 cursor-not-allowed"
              : "bg-red-500 text-white hover:bg-red-600 active:scale-95"
          }`}
        >
          ✕ Scarta
        </button>

        <button
          onClick={() => handleAction("restore")}
          disabled={acting || currentStatus === "DA_VALUTARE"}
          className={`min-h-12 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
            currentStatus === "DA_VALUTARE"
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-slate-500 text-white hover:bg-slate-600 active:scale-95"
          }`}
        >
          ↩ Ripristina
        </button>

        <button
          onClick={() => handleAction("shortlist")}
          disabled={acting || currentStatus === "SHORTLIST"}
          className={`min-h-12 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
            currentStatus === "SHORTLIST"
              ? "bg-green-200 text-green-400 cursor-not-allowed"
              : "bg-green-500 text-white hover:bg-green-600 active:scale-95"
          }`}
        >
          ✓ Shortlist
        </button>

        <button
          onClick={() => handleAction("hire")}
          disabled={acting || currentStatus === "ASSUMERE"}
          className={`min-h-12 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
            currentStatus === "ASSUMERE"
              ? "bg-amber-200 text-amber-400 cursor-not-allowed"
              : "bg-amber-500 text-white hover:bg-amber-600 active:scale-95"
          }`}
        >
          ★ Assumere
        </button>
      </div>}
    </div>
  );
}
