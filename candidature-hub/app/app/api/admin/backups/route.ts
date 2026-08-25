import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, isAuthError } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { spawn } from "node:child_process";

async function backupRoot() {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" } });
  const root = path.resolve(cfg?.storageRoot || "/data");
  const backup = path.resolve(cfg?.backupPath || "/data/backups");
  if (!backup.startsWith(root + path.sep)) throw new Error("Percorso backup non sicuro");
  await mkdir(backup, { recursive: true });
  return backup;
}

function safeName(value: string) {
  return /^candidature-hub-[A-Za-z0-9T_-]+\.tar\.gz$/.test(value);
}

async function listBackups(root: string) {
  const names = (await readdir(root)).filter(safeName).sort().reverse();
  return Promise.all(names.map(async name => ({ name, size: (await stat(path.join(root, name))).size })));
}

async function cleanupBackups(root: string) {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: "main" }, select: { backupRetentionDays: true } });
  const cutoff = Date.now() - (cfg?.backupRetentionDays || 30) * 86_400_000;
  for (const item of await listBackups(root)) {
    const file = path.join(root, item.name);
    if ((await stat(file)).mtimeMs < cutoff) await unlink(file);
  }
}

export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"]);
  if (isAuthError(auth)) return auth;
  const root = await backupRoot();
  await cleanupBackups(root);
  const name = new URL(req.url).searchParams.get("download");
  if (!name) return NextResponse.json({ backups: await listBackups(root) });
  if (!safeName(name)) return NextResponse.json({ error: "Nome backup non valido" }, { status: 400 });
  const file = path.join(root, name);
  const info = await stat(file).catch(() => null);
  if (!info) return NextResponse.json({ error: "Backup non trovato" }, { status: 404 });
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new NextResponse(stream, { headers: { "content-type": "application/gzip", "content-length": String(info.size), "content-disposition": `attachment; filename="${name}"` } });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req, ["ADMIN"], true);
  if (isAuthError(auth)) return auth;
  const root = await backupRoot();
  const uploadName = req.headers.get("x-backup-name");
  if (uploadName) {
    if (!safeName(uploadName) || !req.body) return NextResponse.json({ error: "Archivio non valido" }, { status: 400 });
    const staged = path.join(root, `.upload-${Date.now()}`);
    await pipeline(Readable.fromWeb(req.body as never), createWriteStream(staged, { flags: "wx" }));
    await rename(staged, path.join(root, uploadName));
    return NextResponse.json({ ok: true, staged: uploadName });
  }
  const script = process.env.BACKUP_SCRIPT || "/opt/candidature-hub/scripts/backup.sh";
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(script, [root], { env: process.env });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `backup exit ${code}`)));
  });
  await prisma.auditLog.create({ data: { action: "BACKUP_CREATE", entity: "System", details: output, userId: auth.id } });
  return NextResponse.json({ ok: true, path: output, backups: await listBackups(root) });
}
