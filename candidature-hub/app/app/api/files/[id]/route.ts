import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  // ⬅️ differenza importante: params è una Promise
  const { id: token } = await ctx.params;

  // token può essere:
  // - id del cv_files: "cvf_xxx..."
  // - oppure un identificatore basato su sha1: "sha1<hash>"
  // - oppure, per compatibilità, direttamente lo sha1

  let cv = null;

  if (token.startsWith("cvf_")) {
    // caso standard: id del record
    cv = await prisma.cvFile.findUnique({
      where: { id: token },
    });
  } else if (token.startsWith("sha1")) {
    // compat vecchi link: "sha1" + hash
    const sha1 = token.slice(4);

    // sha1 NON è più UNIQUE → usiamo findFirst
    cv = await prisma.cvFile.findFirst({
      where: { sha1 },
      orderBy: { createdAt: "desc" },
    });
  } else {
    // fallback: considera tutto il token come sha1
    cv = await prisma.cvFile.findFirst({
      where: { sha1: token },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!cv) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const filePath = cv.path;

  try {
    const data = await fs.promises.readFile(filePath);
    const filename = path.basename(filePath);

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Errore lettura file CV:", err);
    return NextResponse.json(
      { error: "unable to read file" },
      { status: 500 }
    );
  }
}
