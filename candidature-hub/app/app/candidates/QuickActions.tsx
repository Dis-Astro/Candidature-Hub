"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CandidateStatus = "DA_VALUTARE" | "SCARTATO" | "SHORTLIST" | "ASSUMERE";

type Props = {
  candidateId: string;
  discarded: boolean;
  rating: number | null;
  decision: string | null;
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

export function QuickActions({ candidateId, discarded, rating, decision }: Props) {
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
    setActing(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/quick-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast("error", err.error || "Errore");
        return;
      }

      // Aggiorna stato locale
      if (action === "discard") {
        setLocalDiscarded(true);
        setLocalDecision(null);
        showToast("success", "✕ Scartato");
      } else if (action === "restore") {
        setLocalDiscarded(false);
        setLocalRating(null);
        setLocalDecision(null);
        showToast("success", "○ Ripristinato");
      } else if (action === "shortlist") {
        setLocalDiscarded(false);
        setLocalRating(5);
        showToast("success", "✓ Shortlist");
      } else if (action === "hire") {
        setLocalDiscarded(false);
        setLocalDecision("ASSUME");
        showToast("success", "★ Assumere");
      }

      router.refresh();
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
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleAction("discard")}
          disabled={acting || currentStatus === "SCARTATO"}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            currentStatus === "ASSUMERE"
              ? "bg-amber-200 text-amber-400 cursor-not-allowed"
              : "bg-amber-500 text-white hover:bg-amber-600 active:scale-95"
          }`}
        >
          ★ Assumere
        </button>
      </div>
    </div>
  );
}
