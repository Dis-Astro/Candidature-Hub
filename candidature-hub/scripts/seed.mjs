import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const tags = await prisma.tag.createMany({
    data: [{ name: 'Carpentiere' }, { name: 'Saldatura' }, { name: 'Autocad' }],
    skipDuplicates: true
  });

  const cands = [
    { firstName: 'Mario', lastName: 'Rossi', mansione: 'Operaio', rating: 4, winningSkill: 'Precisione', notes: 'Disponibile subito', interviewed: false },
    { firstName: 'Luca', lastName: 'Bianchi', mansione: 'Tecnico', rating: 3, winningSkill: 'Autocad', notes: 'Buona esperienza', interviewed: true },
    { firstName: 'Giulia', lastName: 'Verdi', mansione: 'Amministrazione', rating: 5, winningSkill: 'Organizzazione', notes: 'Ottime referenze', interviewed: false }
  ];

  for (const c of cands) {
    const cand = await prisma.candidate.upsert({
      where: { emailNormalized: null }, // upsert “fake” per evitare unique su null -> useremo create
      create: c,
      update: {}
    });
    // collega 1-2 tag a caso
    const t = await prisma.tag.findMany({ take: 2 });
    for (const tg of t) {
      await prisma.candidateTag.upsert({
        where: { candidateId_tagId: { candidateId: cand.id, tagId: tg.id } },
        create: { candidateId: cand.id, tagId: tg.id },
        update: {}
      });
    }
  }
  console.log('Seed OK');
  await prisma.$disconnect();
}
run().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
