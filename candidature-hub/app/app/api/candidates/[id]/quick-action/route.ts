import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../../../lib/prisma";

/**
 * POST /api/candidates/[id]/quick-action
 * 
 * Azioni rapide per valutazione:
 * - action: "discard" → imposta discarded=true
 * - action: "approve" → imposta rating=5 (shortlist minimo), discarded=false
 * - action: "restore" → ripristina "da valutare" (discarded=false, rating=null)
 * 
 * Body: { action: "discard" | "approve" | "restore" }
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

    let result: { ok: boolean; action: string; displayId: number };

    if (action === "discard") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { discarded: true, updatedAt: new Date() },
      });
      result = { ok: true, action: "discarded", displayId: candidate.displayId };
    } else if (action === "approve") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { rating: 5, discarded: false, updatedAt: new Date() },
      });
      result = { ok: true, action: "approved", displayId: candidate.displayId };
    } else if (action === "restore") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { discarded: false, rating: null, updatedAt: new Date() },
      });
      result = { ok: true, action: "restored", displayId: candidate.displayId };
    } else {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }

    // Invalida cache pagine lista e dettaglio
    revalidatePath("/candidates");
    revalidatePath(`/candidates/${candidate.displayId}`);

    return NextResponse.json(result);
  } catch (e) {
    console.error("[API quick-action] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
