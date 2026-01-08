import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";

/**
 * GET /api/attachments/[id]
 * Download allegato
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    }

    if (!existsSync(attachment.path)) {
      return NextResponse.json({ error: "File non trovato su disco" }, { status: 404 });
    }

    const buffer = await readFile(attachment.path);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${attachment.filename}"`,
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
    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    }

    // Elimina file da disco
    if (existsSync(attachment.path)) {
      await unlink(attachment.path);
    }

    // Elimina da DB
    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API attachments/[id] DELETE] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
