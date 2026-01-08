import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST() {
  try {
    // Avvia parser.service via systemctl (one-shot)
    await execAsync("systemctl start parser.service", { timeout: 10000 });
    return NextResponse.json({ ok: true, message: "Parser avviato con successo" });
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    return NextResponse.json(
      { error: err.stderr || err.message || String(e) },
      { status: 500 }
    );
  }
}
