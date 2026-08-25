import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { verifyPassword } from "../../../../../lib/password";
import { createSession } from "../../../../../lib/auth";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= 8) {
    return NextResponse.json({ error: "Troppi tentativi. Riprovare più tardi." }, { status: 429 });
  }
  if (current && current.resetAt <= now) attempts.delete(key);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const state = attempts.get(key) || { count: 0, resetAt: now + 15 * 60_000 };
    state.count += 1;
    attempts.set(key, state);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
  }

  attempts.delete(key);
  const session = await createSession(user.id);
  return NextResponse.json({
    tokenType: "Bearer",
    accessToken: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
