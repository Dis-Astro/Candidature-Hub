import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { hashPassword } from "../../../../lib/password";

const ROLES = new Set(["ADMIN", "RECRUITER", "VIEWER"]);

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"]);
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ users: await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, createdAt: true }, orderBy: { email: "asc" } }) });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "VIEWER");
  if (!email.includes("@") || password.length < 12 || !ROLES.has(role)) return NextResponse.json({ error: "Email, ruolo o password non validi" }, { status: 400 });
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: String(body.name || "").trim() || null, role: role as "ADMIN" | "RECRUITER" | "VIEWER", passwordHash: hashPassword(password) },
    update: { name: String(body.name || "").trim() || null, role: role as "ADMIN" | "RECRUITER" | "VIEWER", passwordHash: hashPassword(password) },
    select: { id: true, email: true, name: true, role: true },
  });
  await prisma.auditLog.create({ data: { action: "USER_UPSERT", entity: "User", entityId: user.id, details: JSON.stringify({ email, role }), userId: auth.id } });
  return NextResponse.json({ ok: true, user });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || id === auth.id) return NextResponse.json({ error: "Utente non eliminabile" }, { status: 400 });
  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({ data: { action: "USER_DELETE", entity: "User", entityId: id, userId: auth.id } });
  return NextResponse.json({ ok: true });
}
