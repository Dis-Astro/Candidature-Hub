/* Aggiunge 1 colloquio e 1 CV fittizio al primo candidato trovato */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.candidate.findFirst({ orderBy: { createdAt: "asc" } });
  if (!c) {
    console.log("Nessun candidato trovato.");
    return;
  }
  console.log("Aggiorno candidato:", c.id, c.lastName, c.firstName);

  // colloquio
  await prisma.interview.create({
    data: {
      candidateId: c.id,
      date: new Date(),
      interviewer: "Responsabile HR",
      score: 4,
      notes: "Colloquio di prova — seed.",
    },
  });

  // cv fake
  await prisma.cvFile.create({
    data: {
      candidateId: c.id,
      path: "/mnt/nas_curriculum/mail2pdf/fake-seed.pdf",
      size: 123456,
      sha1: "seed" + Math.random().toString(16).slice(2),
    },
  });

  console.log("Fatto.");
}

main().catch((e)=>{console.error(e); process.exit(1)}).finally(()=>prisma.$disconnect());
