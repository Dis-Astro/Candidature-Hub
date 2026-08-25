import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, deleteSession, isAuthError } from "../../../../../lib/auth";

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER", "VIEWER"], true);
  if (isAuthError(auth)) return auth;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  await deleteSession(token);
  return NextResponse.json({ ok: true });
}
