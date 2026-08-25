import { NextRequest, NextResponse } from "next/server";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { authorizeRequest, isAuthError } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(req, ["ADMIN", "RECRUITER"], true);
  if (isAuthError(auth)) return auth;
  const { id } = await context.params;
  const [job, config] = await Promise.all([prisma.importJob.findUnique({ where: { id } }), prisma.systemConfig.findUnique({ where: { id: "main" } })]);
  if (!job || job.status !== "ERROR") return NextResponse.json({ error: "Importazione non ripetibile" }, { status: 400 });
  const target = config?.manualInboxPath || "/data/inbox/manual";
  await mkdir(target, { recursive: true });
  const destination = path.join(target, `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${path.basename(job.filename)}`);
  await rename(job.path, destination);
  await prisma.importJob.update({ where: { id }, data: { path: destination, status: "QUEUED", message: "Nuovo tentativo in attesa", threat: null } });
  await prisma.auditLog.create({ data: { action: "IMPORT_RETRY", entity: "ImportJob", entityId: id, userId: auth.id } });
  return NextResponse.redirect(new URL("/imports", req.url), 303);
}
