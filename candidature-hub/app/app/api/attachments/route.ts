import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// Base path per allegati su NAS (configurabile via SystemConfig)
async function getAttachmentsBasePath(): Promise<string> {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" } });
  const nasPath = cfg?.nasPath || "/mnt/nas_curriculum";
  return path.join(nasPath, "attachments");
}

// Tipi MIME consentiti
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/m4a",
  "audio/x-m4a",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

// Max 50MB
const MAX_SIZE = 50 * 1024 * 1024;

// Mappa MIME → AttachmentType
function inferType(mimeType: string): "CV" | "AUDIO_COLLOQUIO" | "DOCUMENTO" | "IMMAGINE" | "NOTE" | "ALTRO" {
  if (mimeType.startsWith("audio/")) return "AUDIO_COLLOQUIO";
  if (mimeType.startsWith("image/")) return "IMMAGINE";
  if (mimeType === "application/pdf") return "DOCUMENTO";
  if (mimeType.includes("word") || mimeType === "text/plain") return "DOCUMENTO";
  return "ALTRO";
}

/**
 * POST /api/attachments
 * Upload allegato per candidato
 * 
 * FormData:
 * - file: File
 * - candidateId: string
 * - type?: AttachmentType (opzionale, auto-detect da MIME)
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

    // Verifica candidato esiste
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, displayId: true },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidato non trovato" }, { status: 404 });
    }

    // Validazione MIME
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Tipo file non consentito: ${file.type}` },
        { status: 400 }
      );
    }

    // Validazione dimensione
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File troppo grande (max ${MAX_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    // Determina tipo
    const attachmentType = (typeOverride as typeof inferType extends (m: string) => infer R ? R : never) || inferType(file.type);

    // Crea directory candidato
    const basePath = await getAttachmentsBasePath();
    const candidateDir = path.join(basePath, candidateId);
    if (!existsSync(candidateDir)) {
      await mkdir(candidateDir, { recursive: true });
    }

    // Sanitizza filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const finalName = `${timestamp}_${safeName}`;
    const filePath = path.join(candidateDir, finalName);

    // Scrivi file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Salva in DB
    const attachment = await prisma.attachment.create({
      data: {
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        type: attachmentType,
        path: filePath,
        uploadedBy: "system", // TODO: utente autenticato
        candidateId,
      },
    });

    return NextResponse.json({
      ok: true,
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
    return NextResponse.json({ error: String(e) }, { status: 500 });
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
