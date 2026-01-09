import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

// Base path per allegati su NAS
async function getAttachmentsBasePath(): Promise<string> {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" } });
  const nasPath = cfg?.nasPath || "/mnt/nas_curriculum";
  return path.join(nasPath, "attachments");
}

// Tipi MIME consentiti (allowlist stretta)
const ALLOWED_MIME_TYPES = new Set([
  // PDF
  "application/pdf",
  // Immagini
  "image/jpeg",
  "image/png",
  "image/gif",
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Max 50MB
const MAX_SIZE = 50 * 1024 * 1024;

// Mappa MIME → AttachmentType
function inferType(mimeType: string): "CV" | "AUDIO_COLLOQUIO" | "DOCUMENTO" | "IMMAGINE" | "NOTE" | "ALTRO" {
  if (mimeType.startsWith("audio/")) return "AUDIO_COLLOQUIO";
  if (mimeType.startsWith("image/")) return "IMMAGINE";
  if (mimeType === "application/pdf") return "DOCUMENTO";
  if (mimeType.includes("word")) return "DOCUMENTO";
  return "ALTRO";
}

// Sanitizza filename: rimuove caratteri pericolosi
function sanitizeFilename(filename: string): string {
  // Rimuove path traversal e caratteri pericolosi
  let safe = filename
    .replace(/\.\./g, "")           // path traversal
    .replace(/[\/\\]/g, "")         // separatori path
    .replace(/[<>|:*?"]/g, "")      // caratteri Windows pericolosi
    .replace(/[\x00-\x1f]/g, "")    // caratteri di controllo
    .trim();
  
  // Limita lunghezza
  if (safe.length > 100) {
    const ext = path.extname(safe);
    const base = path.basename(safe, ext);
    safe = base.slice(0, 90) + ext;
  }
  
  // Fallback se vuoto
  if (!safe || safe === ".") {
    safe = "file";
  }
  
  return safe;
}

// Genera nome storage sicuro (timestamp + hash)
function generateStorageName(originalName: string): string {
  const timestamp = Date.now();
  const hash = crypto.randomBytes(8).toString("hex");
  const ext = path.extname(originalName).toLowerCase() || "";
  return `${timestamp}_${hash}${ext}`;
}

// Log audit
async function logAudit(action: string, entity: string, entityId?: string, details?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId || null,
        details: details || null,
        userId: null, // "system" - no auth implementata
      },
    });
  } catch (e) {
    console.error("[AuditLog] Failed to log:", e);
  }
}

/**
 * POST /api/attachments
 * Upload allegato per candidato
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const candidateId = formData.get("candidateId") as string | null;
    const typeOverride = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId mancante" }, { status: 400 });
    }

    // Validazione dimensione (prima di tutto per evitare sprechi)
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File troppo grande. Dimensione massima consentita: 50MB` },
        { status: 400 }
      );
    }

    // Validazione MIME (allowlist stretta)
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Tipo file non consentito: ${file.type}. Formati accettati: PDF, immagini (JPG/PNG/GIF), audio (MP3/WAV/M4A), documenti Word.` },
        { status: 400 }
      );
    }

    // Verifica candidato esiste
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, displayId: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidato non trovato" }, { status: 404 });
    }

    // Sanitizza filename originale (per display)
    const originalFilename = sanitizeFilename(file.name);
    
    // Genera nome storage sicuro
    const storageName = generateStorageName(originalFilename);

    // Determina tipo
    const attachmentType = (typeOverride as "CV" | "AUDIO_COLLOQUIO" | "DOCUMENTO" | "IMMAGINE" | "NOTE" | "ALTRO") || inferType(file.type);

    // Crea directory candidato
    const basePath = await getAttachmentsBasePath();
    const candidateDir = path.join(basePath, candidateId);
    if (!existsSync(candidateDir)) {
      await mkdir(candidateDir, { recursive: true });
    }

    const filePath = path.join(candidateDir, storageName);

    // Scrivi file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Salva in DB (conserva nome originale per download)
    const attachment = await prisma.attachment.create({
      data: {
        filename: originalFilename,  // Nome originale sanitizzato (per UI/download)
        mimeType: file.type,
        size: file.size,
        type: attachmentType,
        path: filePath,              // Path storage con nome sicuro
        uploadedBy: "system",
        candidateId,
      },
    });

    // Audit log
    await logAudit(
      "ATTACHMENT_UPLOAD",
      "Attachment",
      attachment.id,
      JSON.stringify({ candidateId, filename: originalFilename, size: file.size, type: attachmentType })
    );

    return NextResponse.json({
      ok: true,
      message: "File caricato con successo",
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        type: attachment.type,
        size: attachment.size,
        createdAt: attachment.createdAt,
      },
    });
  } catch (e) {
    console.error("[API attachments POST] Error:", e);
    return NextResponse.json({ error: "Errore durante il caricamento del file" }, { status: 500 });
  }
}

/**
 * GET /api/attachments?candidateId=xxx
 * Lista allegati per candidato
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get("candidateId");

    if (!candidateId) {
      return NextResponse.json({ error: "candidateId mancante" }, { status: 400 });
    }

    const attachments = await prisma.attachment.findMany({
      where: { candidateId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        type: true,
        createdAt: true,
        uploadedBy: true,
      },
    });

    return NextResponse.json({ attachments });
  } catch (e) {
    console.error("[API attachments GET] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
