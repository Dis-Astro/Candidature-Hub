import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { authorizeRequest, isAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlink } from "node:fs/promises";
import path from "node:path";

function isWithin(file: string, roots: string[]) {
  const resolved = path.resolve(file);
  return roots.some((root) => resolved.startsWith(path.resolve(root) + path.sep));
}

// GET /api/candidates/[id]  -> ritorna il candidato per id (UUID)
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER", "VIEWER"]);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  const client = await pool.connect();
  try {
    const r = await client.query('SELECT * FROM "candidates" WHERE id = $1', [id]);
    if (r.rowCount === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("GET /api/candidates/[id] error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/candidates/[id]  -> elimina candidato + record collegati
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;

  const client = await pool.connect();
  try {
    const [candidate, config] = await Promise.all([
      prisma.candidate.findUnique({ where: { id }, select: { attachments: { select: { path: true } }, cvFiles: { select: { path: true } } } }),
      prisma.systemConfig.findUnique({ where: { id: "main" } }),
    ]);
    if (!candidate) return NextResponse.json({ error: "not found" }, { status: 404 });
    const roots = [config?.attachmentsPath || "/data/attachments", config?.processedPath || "/data/processed"];
    for (const item of [...candidate.attachments, ...candidate.cvFiles]) {
      if (!isWithin(item.path, roots)) throw new Error(`Percorso file non sicuro: ${item.path}`);
      await unlink(item.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    await client.query("BEGIN");

    // Eliminiamo esplicitamente record collegati, nel dubbio sui vincoli
    await client.query('DELETE FROM "interviews" WHERE "candidateId" = $1', [id]);
    await client.query('DELETE FROM "candidate_tags" WHERE "candidateId" = $1', [id]);
    await client.query('DELETE FROM "cv_files" WHERE "candidateId" = $1', [id]);

    const del = await client.query('DELETE FROM "candidates" WHERE id = $1', [id]);

    await client.query("COMMIT");

    if (del.rowCount === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (e) {
    console.error("DELETE /api/candidates/[id] error:", e);
    try {
      await client.query("ROLLBACK");
    } catch {}
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
