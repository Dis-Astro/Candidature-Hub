import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { prisma } from "../../lib/prisma";
import { scanBuffer } from "../../lib/antivirus";

export async function GET() {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { id: "main" }, select: { storageRoot: true } });
    await prisma.$queryRaw`SELECT 1`;
    await access(config?.storageRoot || "/data", constants.R_OK | constants.W_OK);
    await scanBuffer(Buffer.from("candidature-hub health check"));
    return Response.json({ ok: true, database: "ok", storage: "ok", antivirus: "ok" });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "health check failed" }, { status: 503 });
  }
}
