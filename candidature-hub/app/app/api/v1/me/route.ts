import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER", "VIEWER"]);
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ user: auth });
}
