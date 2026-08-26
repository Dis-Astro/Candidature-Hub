"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildUrl } from "../../lib/url";
import { FormEvent, useState } from "react";

export function FilterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [mansione, setMansione] = useState(searchParams.get("mansione") ?? "");
  const [ratingMin, setRatingMin] = useState(searchParams.get("rating_min") ?? "");
  const [ratingMax, setRatingMax] = useState(searchParams.get("rating_max") ?? "");
  const [interviewed, setInterviewed] = useState(searchParams.get("interviewed") ?? "");
  const [tags, setTags] = useState(searchParams.get("tags") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const params: Record<string, string | undefined> = {
      q: q || undefined,
      mansione: mansione || undefined,
      rating_min: ratingMin || undefined,
      rating_max: ratingMax || undefined,
      interviewed: interviewed || undefined,
      tags: tags || undefined,
      status: status || undefined,
      page: "1", // Reset alla prima pagina quando si filtrano
    };
    // Mantieni sort e pageSize se presenti
    const sort = searchParams.get("sort");
    const pageSize = searchParams.get("pageSize");
    if (sort) params.sort = sort;
    if (pageSize) params.pageSize = pageSize;

    router.push(buildUrl("/candidates", params));
  }

  function handleReset() {
    setQ("");
    setMansione("");
    setRatingMin("");
    setRatingMax("");
    setInterviewed("");
    setTags("");
    setStatus("");
    router.push("/candidates");
  }

  const hasFilters = q || mansione || ratingMin || ratingMax || interviewed || tags || status;

  return (
    <form onSubmit={handleSubmit} className="surface-card space-y-4 p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-bold text-slate-800">Filtra l’archivio</h2><p className="mt-0.5 text-xs text-slate-500">Ricerca anche nel testo dei curriculum.</p></div>
        {hasFilters && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">Filtri attivi</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Cerca
          </label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, cognome, mansione, note, CV..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Mansione
          </label>
          <input
            type="text"
            value={mansione}
            onChange={(e) => setMansione(e.target.value)}
            placeholder="es. Carpentiere"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Intervistato
          </label>
          <select
            value={interviewed}
            onChange={(e) => setInterviewed(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">Tutti</option>
            <option value="true">Sì</option>
            <option value="false">No</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Stato</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
            <option value="">Tutti gli stati</option>
            <option value="DA_VALUTARE">Da valutare</option>
            <option value="SHORTLIST">Shortlist</option>
            <option value="ASSUMERE">Assumere</option>
            <option value="SCARTATO">Scartato</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Rating minimo
          </label>
          <input
            type="number"
            value={ratingMin}
            onChange={(e) => setRatingMin(e.target.value)}
            placeholder="es. 1"
            min="1"
            max="10"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Rating massimo
          </label>
          <input
            type="number"
            value={ratingMax}
            onChange={(e) => setRatingMax(e.target.value)}
            placeholder="es. 10"
            min="1"
            max="10"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Tag (separati da virgola)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="es. Saldatura,Carpentiere"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <button
          type="submit"
          className="touch-button bg-teal-700 text-white hover:bg-teal-800"
        >
          Applica filtri
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="touch-button bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Reset
          </button>
        )}
      </div>
    </form>
  );
}
