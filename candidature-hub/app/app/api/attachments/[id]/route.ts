import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import path from "node:path";

// Log audit
async function logAudit(action: string, entity: string, userId: string, entityId?: string, details?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId || null,
        details: details || null,
        userId,
      },
    });
  } catch (e) {
    console.error("[AuditLog] Failed to log:", e);
  }
}

/**
 * GET /api/attachments/[id]
 * Download allegato
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER", "VIEWER"]);
    if (isAuthError(auth)) return auth;
    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    }
    const config = await prisma.systemConfig.findUnique({ where: { id: "main" }, select: { attachmentsPath: true } });
    const root = path.resolve(config?.attachmentsPath || "/data/attachments");
    if (!path.resolve(attachment.path).startsWith(root + path.sep)) return NextResponse.json({ error: "Percorso allegato non sicuro" }, { status: 403 });

    if (!existsSync(attachment.path)) {
      return NextResponse.json({ error: "File non trovato su disco" }, { status: 404 });
    }

    const buffer = await readFile(attachment.path);

    // Sanitizza filename per header (evita injection)
    const safeFilename = attachment.filename.replace(/["\r\n]/g, "_");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    console.error("[API attachments/[id] GET] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * DELETE /api/attachments/[id]
 * Elimina allegato
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER"], true);
    if (isAuthError(auth)) return auth;
    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      select: { id: true, filename: true, candidateId: true, path: true, size: true, type: true },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    }

    // Elimina file da disco
    const config = await prisma.systemConfig.findUnique({ where: { id: "main" }, select: { attachmentsPath: true } });
    const root = path.resolve(config?.attachmentsPath || "/data/attachments");
    if (!path.resolve(attachment.path).startsWith(root + path.sep)) return NextResponse.json({ error: "Percorso allegato non sicuro" }, { status: 403 });
    if (existsSync(attachment.path)) {
      await unlink(attachment.path);
    }

    // Elimina da DB
    await prisma.attachment.delete({ where: { id } });

    // Audit log
    await logAudit(
      "ATTACHMENT_DELETE",
      "Attachment",
      auth.id,
      attachment.id,
      JSON.stringify({ 
        candidateId: attachment.candidateId, 
        filename: attachment.filename,
        size: attachment.size,
        type: attachment.type
      })
    );

    return NextResponse.json({ ok: true, message: "Allegato eliminato" });
  } catch (e) {
    console.error("[API attachments/[id] DELETE] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
