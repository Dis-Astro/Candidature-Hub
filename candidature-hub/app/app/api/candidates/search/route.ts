import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER"]);
  if (isAuthError(auth)) return auth;
  const query = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  const exclude = req.nextUrl.searchParams.get("exclude") || undefined;
  if (query.length < 2) return NextResponse.json({ candidates: [] });
  const numericId = /^\d+$/.test(query) ? Number(query) : null;

  const candidates = await prisma.candidate.findMany({
    where: {
      ...(exclude ? { id: { not: exclude } } : {}),
      OR: [
        ...(numericId !== null ? [{ displayId: numericId }] : []),
        { firstName: { contains: query, mode: "insensitive" as const } },
        { lastName: { contains: query, mode: "insensitive" as const } },
        { email: { contains: query, mode: "insensitive" as const } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 8,
    select: { id: true, displayId: true, firstName: true, lastName: true, email: true, mansione: true },
  });
  return NextResponse.json({ candidates });
}
