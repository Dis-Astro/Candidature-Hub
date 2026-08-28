import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "candidature_session";
const SESSION_DAYS = 12;
export const REMEMBERED_SESSION_DAYS = 180;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function bearerToken(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function userFromToken(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, isActive: true } } },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function createSession(userId: string, durationDays = SESSION_DAYS): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const safeDurationDays = Math.max(1, Math.min(durationDays, REMEMBERED_SESSION_DAYS));
  const expiresAt = new Date(Date.now() + safeDurationDays * 86400_000);
  await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
  return { token, expiresAt };
}

export async function deleteSession(token?: string): Promise<void> {
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userFromToken(token);
}

export async function getRequestUser(req: NextRequest) {
  const bearer = bearerToken(req);
  if (bearer) return userFromToken(bearer);
  return getCurrentUser();
}

export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const expectedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

export async function authorizeRequest(req: NextRequest, roles: Role[], mutation = false) {
  const bearer = bearerToken(req);
  if (mutation && !bearer && !sameOrigin(req)) {
    return NextResponse.json({ error: "Origine richiesta non valida" }, { status: 403 });
  }
  const user = bearer ? await userFromToken(bearer) : await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 });
  if (!roles.includes(user.role)) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  return user;
}

export function isAuthError(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
