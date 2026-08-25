import { NextRequest, NextResponse } from "next/server";

function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (origin === req.nextUrl.origin) return origin;
  const configured = (process.env.MOBILE_ALLOWED_ORIGINS || "capacitor://localhost,http://localhost,https://localhost")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(origin) ? origin : null;
}

function withCors(req: NextRequest, response: NextResponse) {
  const origin = allowedOrigin(req);
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  }
  return response;
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const hasBearer = /^Bearer\s+\S+/i.test(req.headers.get("authorization") || "");
  const isPublicAsset = /\.(?:svg|png|jpe?g|webp|ico|webmanifest)$/i.test(path);

  if (req.method === "OPTIONS" && isApi) return withCors(req, new NextResponse(null, { status: 204 }));
  if (path === "/login" || path === "/health" || path === "/api/v1/capabilities" || path === "/api/v1/auth/login" || path.startsWith("/api/auth/") || isPublicAsset) {
    return isApi ? withCors(req, NextResponse.next()) : NextResponse.next();
  }
  if (!req.cookies.get("candidature_session") && !hasBearer) {
    if (isApi) return withCors(req, NextResponse.json({ error: "Autenticazione richiesta" }, { status: 401 }));
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return isApi ? withCors(req, NextResponse.next()) : NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
