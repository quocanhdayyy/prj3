// Read only: narrow the next public-profile lookup to players still missing fields.
const fs = require('node:fs/promises');
const path = require('node:path');
const { prisma } = require('../src/config/prisma.ts');
(async () => {
  const rows = await prisma.playerStats.findMany({
    where: { season: '2025/2026', player: { transfermarktId: { not: null } } },
    select: { tacklesWon: true, interceptions: true, keyPasses: true, passesCompleted: true,
      passesAttempted: true, player: { select: { transfermarktId: true } } },
  });
  await fs.writeFile(path.join(__dirname, '../data/stats-enrichment/current-known.json'), JSON.stringify(rows));
  console.log(`Read coverage for ${rows.length} existing player seasons.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
