import crypto from "node:crypto";
import pg from "pg";

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const name = (process.env.ADMIN_NAME || "Amministratore").trim();
if (!email || password.length < 12) {
  throw new Error("Impostare ADMIN_EMAIL e ADMIN_PASSWORD (almeno 12 caratteri)");
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const passwordHash = `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
  `INSERT INTO users (id, "createdAt", email, "passwordHash", name, role)
   VALUES ($1, now(), $2, $3, $4, 'ADMIN')
   ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", name = EXCLUDED.name, role = 'ADMIN'`,
  [`usr_${crypto.randomBytes(12).toString("hex")}`, email, passwordHash, name]
);
await pool.end();
console.log(`Amministratore configurato: ${email}`);
