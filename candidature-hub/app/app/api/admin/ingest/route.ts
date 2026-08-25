import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { scanBuffer } from "../../../../lib/antivirus";

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER"], true);
  if (isAuthError(auth)) return auth;
  const form = await req.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length < 1 || files.length > 50) return NextResponse.json({ error: "Selezionare da 1 a 50 PDF" }, { status: 400 });
  const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" } });
  const root = path.resolve(cfg?.storageRoot || "/data");
  const target = path.resolve(cfg?.manualInboxPath || "/data/inbox/manual");
  if (!target.startsWith(root + path.sep)) return NextResponse.json({ error: "Cartella manuale non sicura" }, { status: 500 });
  await mkdir(target, { recursive: true });
  const saved: string[] = [];
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: `${file.name}: massimo 25 MB` }, { status: 413 });
    const data = Buffer.from(await file.arrayBuffer());
    if (data.subarray(0, 5).toString() !== "%PDF-") return NextResponse.json({ error: `${file.name}: non è un PDF valido` }, { status: 400 });
    const scan = await scanBuffer(data);
    if (!scan.clean) {
      await prisma.auditLog.create({ data: { action: "ANTIVIRUS_BLOCK", entity: "CvFile", details: JSON.stringify({ filename: file.name, threat: scan.threat }), userId: auth.id } });
      return NextResponse.json({ error: `${file.name}: file bloccato dall'antivirus (${scan.threat})` }, { status: 422 });
    }
    const base = path.basename(file.name, path.extname(file.name)).replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 100) || "curriculum";
    const name = `${Date.now()}_${crypto.randomBytes(5).toString("hex")}_${base}.pdf`;
    const filePath = path.join(target, name);
    await writeFile(filePath, data, { flag: "wx" });
    await prisma.importJob.create({ data: { source: "MANUAL", status: "QUEUED", filename: file.name, path: filePath, message: "In attesa del parser" } });
    saved.push(name);
  }
  await prisma.auditLog.create({ data: { action: "MANUAL_CV_UPLOAD", entity: "CvFile", details: JSON.stringify({ files: saved }), userId: auth.id } });
  return NextResponse.json({ ok: true, saved, message: `${saved.length} CV messi in coda` });
}
