import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" }, select: { parserPollSeconds: true } });
  return NextResponse.json({ ok: true, message: `Il parser Docker acquisirà i nuovi PDF entro ${cfg?.parserPollSeconds || 30} secondi.` });
}
