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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const params: Record<string, string | undefined> = {
      q: q || undefined,
      mansione: mansione || undefined,
      rating_min: ratingMin || undefined,
      rating_max: ratingMax || undefined,
      interviewed: interviewed || undefined,
      tags: tags || undefined,
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
    router.push("/candidates");
  }

  const hasFilters = q || mansione || ratingMin || ratingMax || interviewed || tags;

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-3 border">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ricerca testuale
          </label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, cognome, mansione, note, CV..."
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mansione
          </label>
          <input
            type="text"
            value={mansione}
            onChange={(e) => setMansione(e.target.value)}
            placeholder="es. Carpentiere"
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Intervistato
          </label>
          <select
            value={interviewed}
            onChange={(e) => setInterviewed(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutti</option>
            <option value="true">Sì</option>
            <option value="false">No</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rating minimo
          </label>
          <input
            type="number"
            value={ratingMin}
            onChange={(e) => setRatingMin(e.target.value)}
            placeholder="es. 1"
            min="1"
            max="10"
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rating massimo
          </label>
          <input
            type="number"
            value={ratingMax}
            onChange={(e) => setRatingMax(e.target.value)}
            placeholder="es. 10"
            min="1"
            max="10"
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tag (separati da virgola)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="es. Saldatura,Carpentiere"
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Applica filtri
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Reset
          </button>
        )}
        {hasFilters && (
          <span className="text-sm text-gray-600 ml-2">
            Filtri attivi
          </span>
        )}
      </div>
    </form>
  );
}
