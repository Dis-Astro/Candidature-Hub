import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

/**
 * POST /api/candidates/[id]/quick-action
 * 
 * Azioni rapide per valutazione:
 * - action: "discard" → imposta discarded=true
 * - action: "approve" → imposta rating=5 (shortlist minimo)
 * 
 * Body: { action: "discard" | "approve" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action as string;

    // Trova candidato per displayId o id
    const isNumeric = /^\d+$/.test(id);
    const candidate = await prisma.candidate.findFirst({
      where: isNumeric ? { displayId: parseInt(id, 10) } : { id },
      select: { id: true, displayId: true },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Candidato non trovato" }, { status: 404 });
    }

    if (action === "discard") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { discarded: true, updatedAt: new Date() },
      });
      return NextResponse.json({ ok: true, action: "discarded", displayId: candidate.displayId });
    }

    if (action === "approve") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { rating: 5, updatedAt: new Date() }, // Rating minimo per shortlist
      });
      return NextResponse.json({ ok: true, action: "approved", displayId: candidate.displayId });
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
  } catch (e) {
    console.error("[API quick-action] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
