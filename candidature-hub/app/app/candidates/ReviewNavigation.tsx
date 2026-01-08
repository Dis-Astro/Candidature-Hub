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

type Props = {
  currentDisplayId: number;
  candidateId: string;
};

export function ReviewNavigation({ currentDisplayId, candidateId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ToReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

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

  const goToNext = useCallback(() => {
    if (data?.nextId) {
      router.push(`/candidates/${data.nextId}`);
    } else if (data?.firstId && data.firstId !== currentDisplayId) {
      // Cicla al primo se non c'è next
      router.push(`/candidates/${data.firstId}`);
    } else {
      // Lista finita
      router.push("/candidates?filter=reviewed");
    }
  }, [data, currentDisplayId, router]);

  const handleQuickAction = async (action: "discard" | "approve") => {
    setActing(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/quick-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const err = await res.text();
        alert("Errore: " + err);
        return;
      }

      // Vai al prossimo da valutare
      goToNext();
    } catch (e) {
      alert("Errore: " + String(e));
    } finally {
      setActing(false);
    }
  };

  const goPrev = () => {
    if (data?.prevId) {
      router.push(`/candidates/${data.prevId}`);
    }
  };

  const goNext = () => {
    if (data?.nextId) {
      router.push(`/candidates/${data.nextId}`);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return; // Non intercettare se in input
      }
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

  if (loading) {
    return (
      <div className="bg-slate-100 rounded-xl p-4 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48"></div>
      </div>
    );
  }

  // Se questo candidato non è nella lista "da valutare"
  const isInReviewList = data && data.currentIndex >= 0;
  const position = isInReviewList ? data.currentIndex + 1 : null;
  const total = data?.total || 0;

  if (!isInReviewList && total === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-green-800 font-medium">🎉 Tutti i candidati sono stati valutati!</p>
        <a href="/candidates" className="text-green-600 underline text-sm mt-2 inline-block">
          Torna alla lista
        </a>
      </div>
    );
  }

  if (!isInReviewList) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-amber-800 text-sm">
          Questo candidato è già stato valutato.{" "}
          {total > 0 && (
            <a href={`/candidates/${data?.firstId}`} className="underline font-medium">
              Vai al primo da valutare ({total} rimasti)
            </a>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 space-y-4">
      {/* Header con posizione */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-blue-800">
          <span className="font-semibold">Da valutare:</span>{" "}
          <span className="font-mono">{position} di {total}</span>
        </div>
        <div className="text-xs text-blue-600">
          ← → per navigare
        </div>
      </div>

      {/* Navigazione frecce */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={goPrev}
          disabled={!data?.prevId}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 border-slate-300 text-slate-600 text-2xl font-bold hover:bg-slate-50 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
          title="Precedente (←)"
        >
          ←
        </button>

        <div className="flex gap-3">
          {/* SCARTA */}
          <button
            onClick={() => handleQuickAction("discard")}
            disabled={acting}
            className="flex flex-col items-center justify-center px-8 py-4 rounded-xl bg-red-500 text-white font-bold text-lg hover:bg-red-600 disabled:opacity-50 transition-all active:scale-95 shadow-lg hover:shadow-xl min-w-[140px]"
          >
            <span className="text-2xl mb-1">✕</span>
            <span>SCARTA</span>
          </button>

          {/* VALIDA */}
          <button
            onClick={() => handleQuickAction("approve")}
            disabled={acting}
            className="flex flex-col items-center justify-center px-8 py-4 rounded-xl bg-green-500 text-white font-bold text-lg hover:bg-green-600 disabled:opacity-50 transition-all active:scale-95 shadow-lg hover:shadow-xl min-w-[140px]"
          >
            <span className="text-2xl mb-1">✓</span>
            <span>VALIDA</span>
          </button>
        </div>

        <button
          onClick={goNext}
          disabled={!data?.nextId}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 border-slate-300 text-slate-600 text-2xl font-bold hover:bg-slate-50 hover:border-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
          title="Successivo (→)"
        >
          →
        </button>
      </div>

      {/* Info rapida */}
      <p className="text-xs text-center text-blue-600">
        SCARTA = curriculum scartato • VALIDA = aggiunge a shortlist (rating 5)
      </p>
    </div>
  );
}
