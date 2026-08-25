import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { authorizeRequest, isAuthError } from "../../../lib/auth";

/**
 * POST /api/candidates
 * Crea nuovo candidato manuale
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER"], true);
    if (isAuthError(auth)) return auth;
    const body = await req.json();
    const { firstName, lastName, email, phone, mansione } = body;

    if (!firstName?.trim() || !lastName?.trim()) {
      return NextResponse.json({ error: "Nome e Cognome obbligatori" }, { status: 400 });
    }

    // Calcola submissionIndex per stesso nome+cognome
    const existing = await prisma.candidate.count({
      where: {
        firstName: { equals: firstName.trim(), mode: "insensitive" },
        lastName: { equals: lastName.trim(), mode: "insensitive" },
      },
    });
    const submissionIndex = existing + 1;

    // Normalizza email/phone
    const emailNorm = email?.trim().toLowerCase().replace(/\s+/g, "") || null;
    const phoneNorm = phone?.trim().replace(/\D+/g, "") || null;

    const candidate = await prisma.candidate.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email?.trim() || null,
        emailNormalized: emailNorm,
        phone: phone?.trim() || null,
        phoneNormalized: phoneNorm,
        mansione: mansione || null,
        submissionIndex,
      },
    });

    revalidatePath("/candidates");

    return NextResponse.json({
      ok: true,
      id: candidate.id,
      displayId: candidate.displayId,
    });
  } catch (e) {
    console.error("[API POST /candidates] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
