import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const CONFIG_DIR = process.env.CONFIG_DIR || "/var/lib/candidature-hub";
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

type Config = {
  nasPath: string;
  processedPath: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  pollSeconds: number;
  postAction: string;
  moveFolder: string;
  retentionDays: number;
  alertTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  parserTimerSec: number;
  ocrEnabled: boolean;
};

const DEFAULT_CONFIG: Config = {
  nasPath: "/mnt/nas_curriculum/mail2pdf",
  processedPath: "/mnt/nas_curriculum/mail2pdf/processed",
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPass: "",
  imapMailbox: "INBOX",
  pollSeconds: 60,
  postAction: "move",
  moveFolder: "Processed",
  retentionDays: 90,
  alertTo: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  parserTimerSec: 60,
  ocrEnabled: false,
};

async function loadConfig(): Promise<Config> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return DEFAULT_CONFIG;
    }
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(cfg: Config): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
}

export async function GET() {
  const cfg = await loadConfig();
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
    const current = await loadConfig();

    // Se password è mascherata, mantieni quella esistente
    const newCfg: Config = {
      ...DEFAULT_CONFIG,
      ...body,
      imapPass: body.imapPass === "********" ? current.imapPass : (body.imapPass || ""),
      smtpPass: body.smtpPass === "********" ? current.smtpPass : (body.smtpPass || ""),
    };

    await saveConfig(newCfg);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
