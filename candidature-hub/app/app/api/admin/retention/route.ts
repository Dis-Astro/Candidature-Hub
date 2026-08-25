import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { unlink, rmdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";

function isWithin(file: string, root: string) {
  return path.resolve(file).startsWith(path.resolve(root) + path.sep);
}

// Base path per allegati nello storage permanente
async function getAttachmentsBasePath(): Promise<string> {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" } });
  return cfg?.attachmentsPath || "/data/attachments";
}

type RetentionReport = {
  candidatesCount: number;
  attachmentsCount: number;
  filesCount: number;
  candidates: Array<{
    id: string;
    displayId: number;
    firstName: string;
    lastName: string;
    updatedAt: string;
    attachmentsCount: number;
  }>;
};

/**
 * GET /api/admin/retention?days=X
 * Dry-run: calcola cosa verrebbe eliminato
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req, ["ADMIN"]);
    if (isAuthError(auth)) return auth;
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 0;

    if (!days || days <= 0) {
      return NextResponse.json({ error: "Parametro 'days' non valido" }, { status: 400 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Trova candidati SCARTATI più vecchi di X giorni
    const candidates = await prisma.candidate.findMany({
      where: {
        discarded: true,
        updatedAt: { lt: cutoffDate },
      },
      select: {
        id: true,
        displayId: true,
        firstName: true,
        lastName: true,
        updatedAt: true,
        _count: { select: { attachments: true, cvFiles: true } },
      },
      orderBy: { updatedAt: "asc" },
    });

    // Conta allegati totali
    const candidateIds = candidates.map(c => c.id);
    const attachmentsCount = await prisma.attachment.count({
      where: { candidateId: { in: candidateIds } },
    });
    const cvFilesCount = await prisma.cvFile.count({
      where: { candidateId: { in: candidateIds } },
    });

    const report: RetentionReport = {
      candidatesCount: candidates.length,
      attachmentsCount: attachmentsCount + cvFilesCount,
      filesCount: attachmentsCount + cvFilesCount, // file nello storage
      candidates: candidates.map(c => ({
        id: c.id,
        displayId: c.displayId,
        firstName: c.firstName,
        lastName: c.lastName,
        updatedAt: c.updatedAt.toISOString(),
        attachmentsCount: c._count.attachments + c._count.cvFiles,
      })),
    };

    return NextResponse.json({ ok: true, report, days, cutoffDate: cutoffDate.toISOString() });
  } catch (e) {
    console.error("[API retention GET] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/admin/retention
 * Esegui pulizia reale
 * Body: { days: number, confirm: true }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req, ["ADMIN"], true);
    if (isAuthError(auth)) return auth;
    const body = await req.json();
    const { days, confirm } = body;

    if (!days || days <= 0) {
      return NextResponse.json({ error: "Parametro 'days' non valido" }, { status: 400 });
    }
    if (confirm !== true) {
      return NextResponse.json({ error: "Conferma richiesta (confirm: true)" }, { status: 400 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Trova candidati da eliminare
    const candidates = await prisma.candidate.findMany({
      where: {
        discarded: true,
        updatedAt: { lt: cutoffDate },
      },
      select: {
        id: true,
        displayId: true,
        attachments: { select: { id: true, path: true } },
        cvFiles: { select: { id: true, path: true } },
      },
    });

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, message: "Nessun candidato da eliminare", deleted: 0 });
    }

    const basePath = await getAttachmentsBasePath();
    const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" } });
    const processedPath = cfg?.processedPath || "/data/processed";
    let filesDeleted = 0;
    let attachmentsDeleted = 0;
    let cvFilesDeleted = 0;
    const errors: string[] = [];

    for (const candidate of candidates) {
      // 1. Elimina file allegati dallo storage
      for (const att of candidate.attachments) {
        if (att.path && existsSync(att.path)) {
          try {
            if (!isWithin(att.path, basePath)) throw new Error("path fuori dalla cartella allegati");
            await unlink(att.path);
            filesDeleted++;
          } catch (e) {
            errors.push(`File ${att.path}: ${e}`);
          }
        }
      }

      // 2. Elimina file CV dallo storage
      for (const cv of candidate.cvFiles) {
        if (cv.path && existsSync(cv.path)) {
          try {
            if (!isWithin(cv.path, processedPath)) throw new Error("path fuori dalla cartella processed");
            await unlink(cv.path);
            filesDeleted++;
          } catch (e) {
            errors.push(`File ${cv.path}: ${e}`);
          }
        }
      }

      // 3. Elimina cartella candidato (se vuota)
      const candidateDir = path.join(basePath, candidate.id);
      if (existsSync(candidateDir)) {
        try {
          await rmdir(candidateDir);
        } catch {
          // Ignora se non vuota
        }
      }

      attachmentsDeleted += candidate.attachments.length;
      cvFilesDeleted += candidate.cvFiles.length;
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: "Pulizia interrotta: alcuni file non sono stati eliminati", errors: errors.slice(0, 10) }, { status: 409 });
    }

    // 4. Elimina record dal DB (cascade elimina attachments, cvFiles, interviews, etc)
    const candidateIds = candidates.map(c => c.id);
    await prisma.candidate.deleteMany({
      where: { id: { in: candidateIds } },
    });

    // 5. Audit log
    await prisma.auditLog.create({
      data: {
        action: "GDPR_RETENTION_RUN",
        entity: "Candidate",
        entityId: null,
        details: JSON.stringify({
          days,
          cutoffDate: cutoffDate.toISOString(),
          candidatesDeleted: candidates.length,
          attachmentsDeleted,
          cvFilesDeleted,
          filesDeleted,
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        }),
        userId: null,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Pulizia completata: ${candidates.length} candidati eliminati`,
      deleted: {
        candidates: candidates.length,
        attachments: attachmentsDeleted,
        cvFiles: cvFilesDeleted,
        files: filesDeleted,
      },
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (e) {
    console.error("[API retention POST] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
