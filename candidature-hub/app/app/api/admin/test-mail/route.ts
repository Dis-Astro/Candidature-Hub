import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { decryptSecret } from "../../../../lib/secret-box";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;

  let imap: ImapFlow | null = null;
  try {
    const body = await req.json();
    const saved = await prisma.systemConfig.findUnique({ where: { id: "main" } });
    const password = (incoming: unknown, stored: string | undefined) =>
      incoming && incoming !== "********" ? String(incoming) : decryptSecret(stored || "");

    if (!body.imapHost || !body.imapUser) {
      return NextResponse.json({ error: "Host IMAP e utente sono obbligatori" }, { status: 400 });
    }

    imap = new ImapFlow({
      host: String(body.imapHost),
      port: Number(body.imapPort) || 993,
      secure: true,
      auth: { user: String(body.imapUser), pass: password(body.imapPass, saved?.imapPass) },
      logger: false,
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
    });
    await imap.connect();
    const mailbox = String(body.imapMailbox || "INBOX");
    const info = await imap.mailboxOpen(mailbox, { readOnly: true });
    await imap.logout();
    imap = null;

    let smtpMessage = "SMTP non configurato: verificata solo la posta in arrivo.";
    if (body.smtpHost && body.smtpUser) {
      const smtpPort = Number(body.smtpPort) || 587;
      const transporter = nodemailer.createTransport({
        host: String(body.smtpHost),
        port: smtpPort,
        secure: smtpPort === 465,
        requireTLS: smtpPort !== 465,
        auth: { user: String(body.smtpUser), pass: password(body.smtpPass, saved?.smtpPass) },
        connectionTimeout: 12_000,
        greetingTimeout: 12_000,
        socketTimeout: 20_000,
      });
      await transporter.verify();
      transporter.close();
      smtpMessage = "Anche l'invio degli avvisi SMTP è configurato correttamente.";
    }

    await prisma.auditLog.create({
      data: { action: "MAIL_CONNECTION_TEST", entity: "SystemConfig", entityId: "main", userId: auth.id, details: JSON.stringify({ imapHost: body.imapHost, mailbox }) },
    });

    return NextResponse.json({ ok: true, message: `Collegamento riuscito. Cartella ${mailbox}: ${info.exists} messaggi. ${smtpMessage}` });
  } catch (error) {
    if (imap) await imap.logout().catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Collegamento email non riuscito: ${message}` }, { status: 400 });
  }
}
