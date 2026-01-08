/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  await prisma.tag.createMany({
    data: [{ name: "Carpentiere" }, { name: "Saldatura" }, { name: "Autocad" }],
    skipDuplicates: true,
  });

  const cands = [
    { firstName: "Mario", lastName: "Rossi", mansione: "Operaio", rating: 4, winningSkill: "Precisione", notes: "Disponibile a trasferte" },
    { firstName: "Luca", lastName: "Bianchi", mansione: "Tecnico", rating: 3, winningSkill: "Autocad", notes: "Buona esperienza ufficio tecnico" },
    { firstName: "Giulia", lastName: "Verdi", mansione: "Amministrazione", rating: 5, winningSkill: "Organizzazione", notes: "Molto precisa" },
  ];

  for (const c of cands) {
    const cand = await prisma.candidate.create({ data: c });
    const tags = await prisma.tag.findMany({ take: 2 });
    for (const tg of tags) {
      await prisma.candidateTag.upsert({
        where: { candidateId_tagId: { candidateId: cand.id, tagId: tg.id } },
        create: { candidateId: cand.id, tagId: tg.id },
        update: {},
      });
    }
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("SEED ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
