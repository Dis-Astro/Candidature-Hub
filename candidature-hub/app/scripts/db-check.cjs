/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

(async () => {
  const n = await db.candidate.count();
  console.log("DB OK candidates:", n);
  await db.$disconnect();
})().catch(async (e) => {
  console.error("DB ERROR:", e);
  await db.$disconnect();
  process.exit(1);
});
