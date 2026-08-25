import crypto from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.CONFIG_ENCRYPTION_KEY;
  if (!raw) throw new Error("CONFIG_ENCRYPTION_KEY non configurata");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error("CONFIG_ENCRYPTION_KEY deve contenere 32 byte in base64");
  return decoded;
}

export function encryptSecret(value: string): string {
  if (!value || value.startsWith(PREFIX)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${encrypted.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptSecret(value: string): string {
  if (!value?.startsWith(PREFIX)) return value || "";
  const [ivB64, encryptedB64, tagB64] = value.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedB64, "base64url")), decipher.final()]).toString("utf8");
}
