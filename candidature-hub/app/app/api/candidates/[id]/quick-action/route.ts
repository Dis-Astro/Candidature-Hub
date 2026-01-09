import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../../../lib/prisma";

/**
 * POST /api/candidates/[id]/quick-action
 * 
 * Azioni rapide per valutazione:
 * - action: "discard" → imposta discarded=true
 * - action: "restore" → ripristina "da valutare" (discarded=false, rating=null)
 * - action: "shortlist" → imposta rating=5, discarded=false
 * - action: "hire" → aggiorna ultimo interview con decision=ASSUME
 * - action: "approve" (legacy) → alias di shortlist
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action as string;

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

    } else if (action === "restore") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { discarded: false, rating: null, updatedAt: new Date() },
      });
      // Reset decision nell'ultimo interview se esiste
      const lastInterview = await prisma.interview.findFirst({
        where: { candidateId: candidate.id },
        orderBy: { date: "desc" },
      });
      if (lastInterview) {
        await prisma.interview.update({
          where: { id: lastInterview.id },
          data: { decision: null },
        });
      }
      result = { ok: true, action: "restored", displayId: candidate.displayId };

    } else if (action === "shortlist" || action === "approve") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { rating: 5, discarded: false, updatedAt: new Date() },
      });
      result = { ok: true, action: "shortlist", displayId: candidate.displayId };

    } else if (action === "hire") {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { discarded: false, updatedAt: new Date() },
      });
      // Imposta decision=ASSUME nell'ultimo interview
      const lastInterview = await prisma.interview.findFirst({
        where: { candidateId: candidate.id },
        orderBy: { date: "desc" },
      });
      if (lastInterview) {
        await prisma.interview.update({
          where: { id: lastInterview.id },
          data: { decision: "ASSUME" },
        });
      } else {
        // Crea interview minimo con decision
        await prisma.interview.create({
          data: {
            candidateId: candidate.id,
            date: new Date(),
            decision: "ASSUME",
          },
        });
      }
      result = { ok: true, action: "hire", displayId: candidate.displayId };

    } else {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }

    revalidatePath("/candidates");
    revalidatePath(`/candidates/${candidate.displayId}`);

    return NextResponse.json(result);
  } catch (e) {
    console.error("[API quick-action] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
