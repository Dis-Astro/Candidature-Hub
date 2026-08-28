import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER", "VIEWER"]);
  if (isAuthError(auth)) return auth;
  const sinceRaw = req.nextUrl.searchParams.get("updatedSince");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const updatedSince = since && !Number.isNaN(since.getTime()) ? since : null;

  const candidates = await prisma.candidate.findMany({
    where: updatedSince ? { updatedAt: { gt: updatedSince } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 1000,
    select: {
      id: true,
      displayId: true,
      updatedAt: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mansione: true,
      rating: true,
      status: true,
      interviewed: true,
      winningSkill: true,
      interviews: { orderBy: { date: "desc" }, take: 1 },
      _count: { select: { cvFiles: true, attachments: true, interviews: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    serverTime: new Date().toISOString(),
    complete: !updatedSince,
    candidates,
  });
}
