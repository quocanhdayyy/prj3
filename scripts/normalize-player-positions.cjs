const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { prisma } = require('../src/config/prisma.ts');
const { readPosition, playerPositions } = require('../src/config/player-positions.ts');
const { writeAudit } = require('../src/services/audit-log.service.ts');

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 2 && args[0] === '--actor-id' && /^[1-9]\d*$/.test(args[1]), 'Dùng: npm run data:positions -- --actor-id <admin ID>');
  const actorId = Number(args[1]);
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } });
  assert.equal(actor.role, 'ADMIN');
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
    const players = await tx.player.findMany({ select: { id: true, position: true, secondaryPositions: true }, orderBy: { id: 'asc' } });
    const requirements = await tx.clubRequirement.findMany({ select: { id: true, position: true }, orderBy: { id: 'asc' } });
    // Validate the complete plan before changing any row; unknown codes must be reviewed.
    const playerChanges = players.map(old => {
      const position = readPosition(old.position);
      const secondaryPositions = [...new Set(old.secondaryPositions.map(value => readPosition(value)))].filter(value => value !== position);
      return { old, data: { position, secondaryPositions } };
    }).filter(({ old, data }) => old.position !== data.position || JSON.stringify(old.secondaryPositions) !== JSON.stringify(data.secondaryPositions));
    const requirementChanges = requirements.map(old => ({ old, data: { position: readPosition(old.position) } })).filter(({ old, data }) => old.position !== data.position);
    const context = { actorId, ipAddress: null };
    for (const { old, data } of playerChanges) {
      await tx.player.update({ where: { id: old.id }, data });
      await writeAudit(tx, context, 'Player', old.id, 'UPDATE', old, { id: old.id, ...data, positionPolicy: 'TEN_ROLES_V1' });
    }
    for (const { old, data } of requirementChanges) {
      await tx.clubRequirement.update({ where: { id: old.id }, data });
      await writeAudit(tx, context, 'ClubRequirement', old.id, 'UPDATE', old, { id: old.id, ...data, positionPolicy: 'TEN_ROLES_V1' });
    }
    return { canonicalPositions: playerPositions, changedPlayers: playerChanges.length, changedRequirements: requirementChanges.length,
      changes: playerChanges.map(({ old, data }) => ({ id: old.id, oldPosition: old.position, position: data.position })),
      distribution: await tx.player.groupBy({ by: ['position'], _count: { _all: true }, orderBy: { position: 'asc' } }) };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
  const file = path.join(__dirname, '../data/transfermarkt/position-normalization.json');
  // Retain an earlier nonempty change report when a repeated run is a no-op.
  if (result.changedPlayers || result.changedRequirements) await fs.writeFile(file, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
