"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { buildUrl } from "../../lib/url";

const PAGE_SIZES = [10, 20, 50];

export function PageSizeSelector({ currentPageSize }: { currentPageSize: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(newPageSize: number) {
    const params = Object.fromEntries(searchParams.entries());
    params.pageSize = String(newPageSize);
    params.page = "1"; // Reset alla prima pagina quando si cambia pageSize
    router.push(buildUrl("/candidates", params));
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-700">Mostra:</label>
      <select
        value={currentPageSize}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size} per pagina
          </option>
        ))}
      </select>
    </div>
  );
}
