/* Seed massivo: 200 candidati random + qualche tag.
 * Uso:
 *   node /opt/candidature-hub/app/scripts/seed-mass.cjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIRST = ["Mario","Luca","Giulia","Chiara","Paolo","Sara","Marco","Elisa","Andrea","Laura","Francesca","Giorgio","Simone","Alessia","Davide","Ilaria"];
const LAST  = ["Rossi","Bianchi","Verdi","Neri","Gialli","Esposito","Ferrari","Russo","Romano","Galli","Costa","Greco","Conti","Mancini","Barbieri","Lombardi"];
const MANS  = ["Carpentiere","Saldatore","Disegnatore CAD","Magazziniere","Operaio","Amministrazione","Tecnico","Autista"];

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

async function main(){
  console.log("Seeding massivo...");

  // Assicura 3 tag base
  const baseTags = ["Carpentiere","Saldatura","Autocad"];
  for (const t of baseTags) {
    await prisma.tag.upsert({
      where: { name: t },
      update: {},
      create: { name: t },
    });
  }

  // Crea 200 candidati
  for (let i=0;i<200;i++){
    const firstName = pick(FIRST);
    const lastName  = pick(LAST);
    const mansione  = pick(MANS);
    const rating    = rnd(1,5);

    const c = await prisma.candidate.create({
      data: {
        firstName, lastName, mansione, rating,
        notes: "Seed massivo",
      }
    });

    // attach 0-2 tag a caso
    const attachCount = rnd(0,2);
    const attach = [];
    for (let k=0;k<attachCount;k++){
      const tn = pick(baseTags);
      const t = await prisma.tag.findUnique({ where: { name: tn }});
      if (t) attach.push({ tagId: t.id, candidateId: c.id });
    }
    if (attach.length) {
      await prisma.candidateTag.createMany({ data: attach, skipDuplicates: true });
    }
  }

  console.log("Fatto.");
}

main().finally(()=>prisma.$disconnect());
