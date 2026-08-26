import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { hashPassword } from "../../../../lib/password";

const ROLES = new Set<Role>(["ADMIN", "RECRUITER", "VIEWER"]);
const userFields = { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true } as const;

function cleanRole(value: unknown): Role | null {
  const role = String(value || "") as Role;
  return ROLES.has(role) ? role : null;
}

async function wouldRemoveLastAdmin(id: string, role: Role, isActive: boolean) {
  const current = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  if (!current || current.role !== "ADMIN" || !current.isActive || (role === "ADMIN" && isActive)) return false;
  return (await prisma.user.count({ where: { role: "ADMIN", isActive: true } })) <= 1;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"]);
  if (isAuthError(auth)) return auth;
  const users = await prisma.user.findMany({ select: userFields, orderBy: [{ isActive: "desc" }, { name: "asc" }, { email: "asc" }] });
  return NextResponse.json({ users, currentUserId: auth.id });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = cleanRole(body.role);
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || !role) {
    return NextResponse.json({ error: "Inserisci un’email valida, un ruolo e una password di almeno 12 caratteri." }, { status: 400 });
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "Esiste già un utente con questa email." }, { status: 409 });
  }
  const user = await prisma.user.create({ data: { email, name: String(body.name || "").trim() || null, role, passwordHash: hashPassword(password) }, select: userFields });
  await prisma.auditLog.create({ data: { action: "USER_CREATE", entity: "User", entityId: user.id, details: JSON.stringify({ email, role }), userId: auth.id } });
  return NextResponse.json({ ok: true, user }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const email = String(body.email || "").trim().toLowerCase();
  const role = cleanRole(body.role);
  const isActive = body.isActive !== false;
  const password = String(body.password || "");
  if (!id || !/^\S+@\S+\.\S+$/.test(email) || !role || (password && password.length < 12)) {
    return NextResponse.json({ error: "Dati non validi. La nuova password, se inserita, deve avere almeno 12 caratteri." }, { status: 400 });
  }
  if (id === auth.id && (!isActive || role !== "ADMIN")) {
    return NextResponse.json({ error: "Non puoi disattivare il tuo account o rimuovere il tuo ruolo amministratore." }, { status: 400 });
  }
  if (await wouldRemoveLastAdmin(id, role, isActive)) return NextResponse.json({ error: "Deve rimanere almeno un amministratore attivo." }, { status: 400 });
  if (await prisma.user.findFirst({ where: { email, id: { not: id } }, select: { id: true } })) {
    return NextResponse.json({ error: "Esiste già un utente con questa email." }, { status: 409 });
  }
  const user = await prisma.user.update({
    where: { id },
    data: { email, name: String(body.name || "").trim() || null, role, isActive, ...(password ? { passwordHash: hashPassword(password) } : {}) },
    select: userFields,
  }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });
  if (!isActive || password) await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.auditLog.create({ data: { action: password ? "USER_UPDATE_PASSWORD" : "USER_UPDATE", entity: "User", entityId: id, details: JSON.stringify({ email, role, isActive }), userId: auth.id } });
  return NextResponse.json({ ok: true, user });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id || id === auth.id) return NextResponse.json({ error: "Non puoi eliminare il tuo account." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true, email: true } });
  if (!user) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });
  if (await wouldRemoveLastAdmin(id, "VIEWER", false)) return NextResponse.json({ error: "Deve rimanere almeno un amministratore attivo." }, { status: 400 });
  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({ data: { action: "USER_DELETE", entity: "User", entityId: id, details: JSON.stringify({ email: user.email }), userId: auth.id } });
  return NextResponse.json({ ok: true });
}
