"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type ToReviewData = {
  ids: number[];
  total: number;
  currentIndex: number;
  prevId: number | null;
  nextId: number | null;
  firstId: number | null;
};

type CandidateStatus = "DA_VALUTARE" | "SCARTATO" | "VALIDATO";

type Props = {
  currentDisplayId: number;
  candidateId: string;
  discarded: boolean;
  rating: number | null;
  interviewed: boolean;
};

function getStatus(discarded: boolean, rating: number | null): CandidateStatus {
  if (discarded) return "SCARTATO";
  if (rating !== null && rating > 0) return "VALIDATO";
  return "DA_VALUTARE";
}

const STATUS_CONFIG: Record<CandidateStatus, { label: string; bg: string; text: string; border: string }> = {
  DA_VALUTARE: { label: "Da valutare", bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  SCARTATO: { label: "Scartato", bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  VALIDATO: { label: "Validato", bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
};

export function ReviewNavigation({ currentDisplayId, candidateId, discarded, rating, interviewed }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ToReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  
  // Stato locale per aggiornamento immediato UI
  const [localDiscarded, setLocalDiscarded] = useState(discarded);
  const [localRating, setLocalRating] = useState(rating);

  const currentStatus = getStatus(localDiscarded, localRating);
  const statusCfg = STATUS_CONFIG[currentStatus];

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/to-review?current=${currentDisplayId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch to-review data:", e);
    } finally {
      setLoading(false);
    }
  }, [currentDisplayId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
  };

  const goToNext = useCallback(() => {
    if (data?.nextId) {
      router.push(`/candidates/${data.nextId}`);
    } else if (data?.firstId && data.firstId !== currentDisplayId) {
      router.push(`/candidates/${data.firstId}`);
    } else {
      router.push("/candidates");
    }
  }, [data, currentDisplayId, router]);

  const handleQuickAction = async (action: "discard" | "approve" | "restore") => {
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

      const result = await res.json();
      
      // Aggiorna stato locale immediatamente
      if (action === "discard") {
        setLocalDiscarded(true);
        showToast("success", "✓ Candidato SCARTATO");
      } else if (action === "approve") {
        setLocalRating(5);
        setLocalDiscarded(false);
        showToast("success", "✓ Candidato VALIDATO");
      } else if (action === "restore") {
        setLocalDiscarded(false);
        setLocalRating(null);
        showToast("success", "✓ Candidato RIPRISTINATO (da valutare)");
      }

      // Refresh server data (invalida cache Next.js)
      router.refresh();

      // Refresh dati navigazione
      await fetchData();

      // Per SCARTA/VALIDA da "da valutare", vai al prossimo
      if ((action === "discard" || action === "approve") && currentStatus === "DA_VALUTARE") {
        setTimeout(() => goToNext(), 800);
      }
    } catch (e) {
      showToast("error", String(e));
    } finally {
      setActing(false);
    }
  };

  const goPrev = () => {
    if (data?.prevId) router.push(`/candidates/${data.prevId}`);
  };

  const goNext = () => {
    if (data?.nextId) router.push(`/candidates/${data.nextId}`);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && data?.prevId) {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" && data?.nextId) {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [data]);

  const isInReviewList = data && data.currentIndex >= 0;
  const position = isInReviewList ? data.currentIndex + 1 : null;
  const total = data?.total || 0;

  return (
    <div className="space-y-3">
      {/* Toast notifica */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold transition-all animate-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Card principale */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-2xl p-5 shadow-sm">
        {/* Header: stato + navigazione conteggio */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          {/* Badge stato attuale */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm ${statusCfg.bg} ${statusCfg.text} border-2 ${statusCfg.border}`}>
            <span className="text-lg">
              {currentStatus === "DA_VALUTARE" && "⏳"}
              {currentStatus === "SCARTATO" && "✕"}
              {currentStatus === "VALIDATO" && "✓"}
            </span>
            <span>{statusCfg.label}</span>
          </div>

          {/* Conteggio "da valutare" */}
          {!loading && total > 0 && (
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-blue-700">Da valutare:</span>{" "}
              <span className="font-mono">{total}</span>
              {isInReviewList && (
                <span className="text-slate-400 ml-2">(questo è #{position})</span>
              )}
            </div>
          )}
          {!loading && total === 0 && (
            <div className="text-sm text-green-700 font-medium">
              🎉 Tutti valutati!
            </div>
          )}
        </div>

        {/* Pulsanti azione + navigazione */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Freccia sinistra */}
          {isInReviewList && (
            <button
              onClick={goPrev}
              disabled={!data?.prevId}
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white border-2 border-slate-300 text-slate-500 text-2xl font-bold hover:bg-slate-50 hover:border-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
              title="Precedente (←)"
            >
              ←
            </button>
          )}

          {/* SCARTA */}
          <button
            onClick={() => handleQuickAction("discard")}
            disabled={acting || currentStatus === "SCARTATO"}
            className={`flex flex-col items-center justify-center px-8 py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 shadow-lg min-w-[130px] ${
              currentStatus === "SCARTATO"
                ? "bg-red-200 text-red-400 cursor-not-allowed"
                : "bg-red-500 text-white hover:bg-red-600 hover:shadow-xl"
            }`}
          >
            <span className="text-2xl mb-1">✕</span>
            <span>SCARTA</span>
          </button>

          {/* RIPRISTINA */}
          <button
            onClick={() => handleQuickAction("restore")}
            disabled={acting || currentStatus === "DA_VALUTARE"}
            className={`flex flex-col items-center justify-center px-6 py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 shadow-lg min-w-[130px] ${
              currentStatus === "DA_VALUTARE"
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-amber-500 text-white hover:bg-amber-600 hover:shadow-xl"
            }`}
          >
            <span className="text-2xl mb-1">↩</span>
            <span>RIPRISTINA</span>
          </button>

          {/* VALIDA */}
          <button
            onClick={() => handleQuickAction("approve")}
            disabled={acting || currentStatus === "VALIDATO"}
            className={`flex flex-col items-center justify-center px-8 py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 shadow-lg min-w-[130px] ${
              currentStatus === "VALIDATO"
                ? "bg-green-200 text-green-400 cursor-not-allowed"
                : "bg-green-500 text-white hover:bg-green-600 hover:shadow-xl"
            }`}
          >
            <span className="text-2xl mb-1">✓</span>
            <span>VALIDA</span>
          </button>

          {/* Freccia destra */}
          {isInReviewList && (
            <button
              onClick={goNext}
              disabled={!data?.nextId}
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white border-2 border-slate-300 text-slate-500 text-2xl font-bold hover:bg-slate-50 hover:border-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
              title="Successivo (→)"
            >
              →
            </button>
          )}
        </div>

        {/* Help text */}
        <p className="text-xs text-center text-slate-500 mt-4">
          SCARTA = curriculum scartato • VALIDA = shortlist (rating 5) • RIPRISTINA = torna "da valutare"
        </p>
      </div>
    </div>
  );
}
