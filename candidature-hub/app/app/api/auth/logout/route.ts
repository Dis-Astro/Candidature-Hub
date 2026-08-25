import { NextRequest, NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE } from "../../../../lib/auth";

export async function POST(req: NextRequest) {
  await deleteSession(req.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
