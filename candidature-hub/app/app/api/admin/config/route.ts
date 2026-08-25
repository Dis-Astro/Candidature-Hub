import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { encryptSecret } from "../../../../lib/secret-box";
import path from "node:path";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";

const CONFIG_ID = "main";

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"]);
  if (isAuthError(auth)) return auth;
  let cfg = await prisma.systemConfig.findUnique({ where: { id: CONFIG_ID } });

  if (!cfg) {
    cfg = await prisma.systemConfig.create({ data: { id: CONFIG_ID } });
  }
  const encrypted = {
    imapPass: cfg.imapPass && !cfg.imapPass.startsWith("enc:v1:") ? encryptSecret(cfg.imapPass) : cfg.imapPass,
    smtpPass: cfg.smtpPass && !cfg.smtpPass.startsWith("enc:v1:") ? encryptSecret(cfg.smtpPass) : cfg.smtpPass,
    extDbPass: cfg.extDbPass && !cfg.extDbPass.startsWith("enc:v1:") ? encryptSecret(cfg.extDbPass) : cfg.extDbPass,
  };
  if (encrypted.imapPass !== cfg.imapPass || encrypted.smtpPass !== cfg.smtpPass || encrypted.extDbPass !== cfg.extDbPass) {
    cfg = await prisma.systemConfig.update({ where: { id: CONFIG_ID }, data: encrypted });
  }

  // Maschera password per sicurezza in GET
  return NextResponse.json({
    ...cfg,
    storageMode: "docker-volume",
    imapPass: cfg.imapPass ? "********" : "",
    smtpPass: cfg.smtpPass ? "********" : "",
    extDbPass: cfg.extDbPass ? "********" : "",
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req, ["ADMIN"], true);
    if (isAuthError(auth)) return auth;
    const body = await req.json();
    const current = await prisma.systemConfig.findUnique({ where: { id: CONFIG_ID } });

    const root = path.resolve("/data");
    const storagePath = (value: unknown, fallback: string) => {
      const requested = String(value || fallback).trim();
      const resolved = path.resolve(path.isAbsolute(requested) ? requested : path.join(root, requested));
      if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error(`Percorso fuori dallo storage consentito: ${resolved}`);
      return resolved;
    };
    const secret = (incoming: unknown, currentValue: string | undefined) =>
      incoming === "********" ? (currentValue || "") : encryptSecret(String(incoming || ""));
    const postAction = String(body.postAction || "move");
    if (!["none", "move", "delete"].includes(postAction)) {
      return NextResponse.json({ error: "Azione successiva email non valida" }, { status: 400 });
    }
    const data = {
      storageRoot: root,
      mailInboxPath: storagePath(body.mailInboxPath, path.join(root, "inbox/mail")),
      manualInboxPath: storagePath(body.manualInboxPath, path.join(root, "inbox/manual")),
      processedPath: storagePath(body.processedPath, path.join(root, "processed")),
      attachmentsPath: storagePath(body.attachmentsPath, path.join(root, "attachments")),
      backupPath: storagePath(body.backupPath, path.join(root, "backups")),
      errorPath: storagePath(body.errorPath, path.join(root, "error")),
      mailEnabled: Boolean(body.mailEnabled),
      imapHost: String(body.imapHost || ""),
      imapPort: Number(body.imapPort) || 993,
      imapUser: String(body.imapUser || ""),
      imapPass: secret(body.imapPass, current?.imapPass),
      imapMailbox: String(body.imapMailbox || "INBOX"),
      pollSeconds: Math.max(15, Number(body.pollSeconds) || 60),
      postAction,
      moveFolder: String(body.moveFolder || "Processed"),
      retentionDays: Math.max(1, Number(body.retentionDays) || 365),
      mailRetentionDays: Math.max(1, Number(body.mailRetentionDays) || 90),
      backupRetentionDays: Math.max(1, Number(body.backupRetentionDays) || 30),
      errorRetentionDays: Math.max(1, Number(body.errorRetentionDays) || 30),
      alertTo: String(body.alertTo || ""),
      smtpHost: String(body.smtpHost || ""),
      smtpPort: Number(body.smtpPort) || 587,
      smtpUser: String(body.smtpUser || ""),
      smtpPass: secret(body.smtpPass, current?.smtpPass),
      parserPollSeconds: Math.max(5, Number(body.parserPollSeconds) || 30),
      ocrEnabled: Boolean(body.ocrEnabled),
      // Database esterno
      useExternalDb: Boolean(body.useExternalDb),
      extDbHost: String(body.extDbHost || "localhost"),
      extDbPort: Number(body.extDbPort) || 5432,
      extDbName: String(body.extDbName || ""),
      extDbUser: String(body.extDbUser || ""),
      extDbPass: secret(body.extDbPass, current?.extDbPass),
      extDbSsl: Boolean(body.extDbSsl),
    };

    const folders = [data.mailInboxPath, data.manualInboxPath, data.processedPath, data.attachmentsPath, data.backupPath, data.errorPath];
    if (new Set(folders).size !== folders.length) {
      return NextResponse.json({ error: "Ogni destinazione deve usare una cartella diversa" }, { status: 400 });
    }
    for (const folder of folders) {
      await mkdir(folder, { recursive: true });
      await access(folder, constants.R_OK | constants.W_OK);
    }

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
        details: JSON.stringify({ storageFolders: folders, mailEnabled: data.mailEnabled, imapHost: data.imapHost, imapUser: data.imapUser, useExternalDb: data.useExternalDb }),
        userId: auth.id,
      },
    });

    return NextResponse.json({ ok: true, message: "Configurazione, cartelle e posta aggiornate" });
  } catch (e) {
    console.error("[API admin/config] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
