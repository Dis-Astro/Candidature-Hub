import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

const CONFIG_ID = "main";

export async function GET() {
  let cfg = await prisma.systemConfig.findUnique({ where: { id: CONFIG_ID } });

  if (!cfg) {
    // Crea record default se non esiste
    cfg = await prisma.systemConfig.create({ data: { id: CONFIG_ID } });
  }

  // Maschera password per sicurezza in GET
  return NextResponse.json({
    ...cfg,
    imapPass: cfg.imapPass ? "********" : "",
    smtpPass: cfg.smtpPass ? "********" : "",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Carica config corrente per preservare password mascherate
    const current = await prisma.systemConfig.findUnique({ where: { id: CONFIG_ID } });

    const data = {
      nasPath: String(body.nasPath || "/mnt/nas_curriculum/mail2pdf"),
      processedPath: String(body.processedPath || "/mnt/nas_curriculum/mail2pdf/processed"),
      imapHost: String(body.imapHost || ""),
      imapPort: Number(body.imapPort) || 993,
      imapUser: String(body.imapUser || ""),
      // Preserva password esistente se mascherata
      imapPass: body.imapPass === "********" ? (current?.imapPass || "") : String(body.imapPass || ""),
      imapMailbox: String(body.imapMailbox || "INBOX"),
      pollSeconds: Number(body.pollSeconds) || 60,
      postAction: String(body.postAction || "move"),
      moveFolder: String(body.moveFolder || "Processed"),
      retentionDays: Number(body.retentionDays) || 90,
      alertTo: String(body.alertTo || ""),
      smtpHost: String(body.smtpHost || ""),
      smtpPort: Number(body.smtpPort) || 587,
      smtpUser: String(body.smtpUser || ""),
      smtpPass: body.smtpPass === "********" ? (current?.smtpPass || "") : String(body.smtpPass || ""),
      parserTimerSec: Number(body.parserTimerSec) || 60,
      ocrEnabled: Boolean(body.ocrEnabled),
    };

    await prisma.systemConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API admin/config] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
