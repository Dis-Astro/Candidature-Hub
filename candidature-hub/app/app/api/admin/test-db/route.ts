import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { decryptSecret } from "../../../../lib/secret-box";

/**
 * POST /api/admin/test-db
 * Test connessione a database PostgreSQL esterno
 * 
 * Body: { host, port, dbname, user, password, ssl }
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  let client: Client | null = null;
  
  try {
    const body = await req.json();
    const { host, port, dbname, user, password, ssl } = body;
    const saved = password ? "" : (await prisma.systemConfig.findUnique({ where: { id: "main" }, select: { extDbPass: true } }))?.extDbPass || "";
    const effectivePassword = password || decryptSecret(saved);

    if (!host || !dbname || !user) {
      return NextResponse.json({ 
        ok: false, 
        error: "Host, nome database e utente sono obbligatori" 
      }, { status: 400 });
    }

    // Configura connessione
    client = new Client({
      host: host,
      port: port || 5432,
      database: dbname,
      user: user,
      password: effectivePassword,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });

    // Test connessione
    await client.connect();
    
    // Query di test
    const result = await client.query("SELECT version(), current_database(), current_user");
    const row = result.rows[0];

    await client.end();

    return NextResponse.json({
      ok: true,
      message: "Connessione riuscita",
      details: {
        version: row.version?.split(" ")[0] + " " + row.version?.split(" ")[1],
        database: row.current_database,
        user: row.current_user,
      },
    });
  } catch (e) {
    if (client) {
      try { await client.end(); } catch {}
    }
    
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[API test-db] Error:", errorMessage);
    
    return NextResponse.json({
      ok: false,
      error: `Connessione fallita: ${errorMessage}`,
    }, { status: 400 });
  }
}
