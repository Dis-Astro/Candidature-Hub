import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";

/**
 * GET /api/candidates/to-review
 * 
 * Ritorna lista ordinata di candidati "da valutare":
 * - interviewed = false
 * - discarded = false  
 * - rating IS NULL
 * 
 * Query params:
 * - current: displayId corrente (opzionale, per calcolare prev/next)
 * 
 * Response:
 * - ids: array di displayId ordinati per createdAt ASC
 * - currentIndex: posizione del current nella lista (-1 se non trovato)
 * - prevId: displayId precedente (null se primo)
 * - nextId: displayId successivo (null se ultimo)
 * - total: numero totale da valutare
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER", "VIEWER"]);
    if (isAuthError(auth)) return auth;
    const { searchParams } = new URL(req.url);
    const currentParam = searchParams.get("current");
    const currentDisplayId = currentParam ? parseInt(currentParam, 10) : null;

    // Query candidati "da valutare"
    const toReview = await prisma.candidate.findMany({
      where: {
        status: "DA_VALUTARE",
      },
      orderBy: { createdAt: "asc" },
      select: { displayId: true, id: true },
    });

    const ids = toReview.map((c) => c.displayId);
    const total = ids.length;

    let currentIndex = -1;
    let prevId: number | null = null;
    let nextId: number | null = null;

    if (currentDisplayId !== null && !isNaN(currentDisplayId)) {
      currentIndex = ids.indexOf(currentDisplayId);
      if (currentIndex > 0) {
        prevId = ids[currentIndex - 1];
      }
      if (currentIndex >= 0 && currentIndex < ids.length - 1) {
        nextId = ids[currentIndex + 1];
      }
    }

    // Se current non è nella lista "da valutare", trova il primo disponibile
    const firstId = ids.length > 0 ? ids[0] : null;

    return NextResponse.json({
      ids,
      total,
      currentIndex,
      prevId,
      nextId,
      firstId,
    });
  } catch (e) {
    console.error("[API to-review] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
