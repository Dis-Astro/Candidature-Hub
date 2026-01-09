import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

const CONFIG_ID = "main";

export async function GET() {
  let cfg = await prisma.systemConfig.findUnique({ where: { id: CONFIG_ID } });

  if (!cfg) {
    cfg = await prisma.systemConfig.create({ data: { id: CONFIG_ID } });
  }

  // Maschera password per sicurezza in GET
  return NextResponse.json({
    ...cfg,
    imapPass: cfg.imapPass ? "********" : "",
    smtpPass: cfg.smtpPass ? "********" : "",
    extDbPass: cfg.extDbPass ? "********" : "",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const current = await prisma.systemConfig.findUnique({ where: { id: CONFIG_ID } });

    const data = {
      nasPath: String(body.nasPath || "/mnt/nas_curriculum/mail2pdf"),
      processedPath: String(body.processedPath || "/mnt/nas_curriculum/mail2pdf/processed"),
      imapHost: String(body.imapHost || ""),
      imapPort: Number(body.imapPort) || 993,
      imapUser: String(body.imapUser || ""),
      imapPass: body.imapPass === "********" ? (current?.imapPass || "") : String(body.imapPass || ""),
      imapMailbox: String(body.imapMailbox || "INBOX"),
      pollSeconds: Number(body.pollSeconds) || 60,
      postAction: String(body.postAction || "move"),
      moveFolder: String(body.moveFolder || "Processed"),
      retentionDays: Number(body.retentionDays) || 365,
      alertTo: String(body.alertTo || ""),
      smtpHost: String(body.smtpHost || ""),
      smtpPort: Number(body.smtpPort) || 587,
      smtpUser: String(body.smtpUser || ""),
      smtpPass: body.smtpPass === "********" ? (current?.smtpPass || "") : String(body.smtpPass || ""),
      parserTimerSec: Number(body.parserTimerSec) || 60,
      ocrEnabled: Boolean(body.ocrEnabled),
      // Database esterno
      useExternalDb: Boolean(body.useExternalDb),
      extDbHost: String(body.extDbHost || "localhost"),
      extDbPort: Number(body.extDbPort) || 5432,
      extDbName: String(body.extDbName || ""),
      extDbUser: String(body.extDbUser || ""),
      extDbPass: body.extDbPass === "********" ? (current?.extDbPass || "") : String(body.extDbPass || ""),
      extDbSsl: Boolean(body.extDbSsl),
    };

    await prisma.systemConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, ...data },
      update: data,
    });

    // Audit log per cambio config
    await prisma.auditLog.create({
      data: {
        action: "CONFIG_UPDATE",
        entity: "SystemConfig",
        entityId: CONFIG_ID,
        details: JSON.stringify({ useExternalDb: data.useExternalDb }),
        userId: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API admin/config] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
