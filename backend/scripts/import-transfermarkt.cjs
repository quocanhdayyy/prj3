// Import only the single, explicitly selected publisher. No scraping, credentials, or synthetic fill.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { prisma } = require('../src/config/prisma.ts');
const { writeAudit } = require('../src/services/audit-log.service.ts');
const { playerPositions } = require('../src/config/player-positions.ts');
const ROOT = path.join(__dirname, '../data/transfermarkt');
const SOURCE = 'https://github.com/dcaribou/transfermarkt-datasets';
const chunks = (rows, size = 500) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
const json = value => JSON.parse(JSON.stringify(value));
const date = value => new Date(value + 'T00:00:00Z');
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date(value).getTime()) && date(value).toISOString().slice(0, 10) === value;
const id = value => Number.isInteger(value) && value > 0 && value <= 2147483647;
const money = value => typeof value === 'string' && /^\d{1,13}(\.\d{1,2})?$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const knownStats = ['appearances', 'minutesPlayed', 'goals', 'assists', 'yellowCards', 'redCards'];
const missingStats = ['tacklesWon', 'interceptions', 'keyPasses', 'passesCompleted', 'passesAttempted'];

function validateBundle(bundle) {
  assert.equal(bundle.provider, SOURCE); assert.equal(bundle.season, '2025/2026');
  assert.deepEqual(bundle.report.coverage.map(r => r.competitionId).sort(), ['ES1', 'FR1', 'GB1', 'IT1', 'L1']);
  assert(validDate(bundle.asOf));
  assert(bundle.asOf <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }));
  assert.deepEqual(bundle.report.missingStatistics, missingStats);
  assert(Array.isArray(bundle.clubs) && bundle.clubs.length);
  assert(Array.isArray(bundle.players) && bundle.players.length);
  assert.equal(new Set(bundle.clubs.map(row => row.transfermarktId)).size, bundle.clubs.length);
  assert.equal(new Set(bundle.players.map(row => row.player.transfermarktId)).size, bundle.players.length);
  for (const club of bundle.clubs) {
    assert(id(club.transfermarktId) && text(club.name, 100) && text(club.country, 100) && text(club.league, 100));
    assert.equal(club.foundedYear, null);
  }
  const playerIds = new Set();
  for (const { player, stats } of bundle.players) {
    assert(id(player.transfermarktId)); playerIds.add(player.transfermarktId);
    assert(text(player.name, 100) && text(player.nationality, 100));
    assert(validDate(player.dateOfBirth) && player.dateOfBirth <= bundle.asOf);
    assert(playerPositions.includes(player.position));
    assert.deepEqual(player.secondaryPositions, []);
    assert(player.height === null || id(player.height));
    assert([null, 'LEFT', 'RIGHT', 'BOTH'].includes(player.preferredFoot));
    assert(player.marketValue === null || money(player.marketValue));
    assert.equal(stats.season, bundle.season);
    for (const field of knownStats) assert(Number.isInteger(stats[field]) && stats[field] >= 0 && stats[field] <= 2147483647, field);
    assert(stats.appearances > 0 && stats.minutesPlayed > 0);
    for (const field of missingStats) assert.equal(stats[field], null);
  }
  const valuationKeys = new Set();
  for (const value of bundle.valuations) {
    assert(playerIds.has(value.transfermarktId)); assert(validDate(value.valuedAt) && value.valuedAt <= bundle.asOf);
    assert(money(value.marketValue)); assert.equal(value.source, SOURCE); assert.equal(value.reliability, 'UNKNOWN');
    const key = value.transfermarktId + ':' + value.valuedAt;
    assert(!valuationKeys.has(key)); valuationKeys.add(key);
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 2 && args[0] === '--actor-id' && id(Number(args[1])), 'Dùng: npm run data:import -- --actor-id <admin ID>');
  const actorId = Number(args[1]);
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { id: true, role: true } });
  assert.equal(actor.role, 'ADMIN');
  const raw = await fs.readFile(path.join(ROOT, 'prepared.json'));
  const bundle = JSON.parse(raw.toString('utf8')); validateBundle(bundle);
  // Check that preparation refers to the exact bytes that remain in the raw cache.
  for (const item of bundle.download.tables) {
    assert(['competitions', 'clubs', 'players', 'games', 'appearances', 'player_valuations', 'transfers'].includes(item.table));
    const bytes = await fs.readFile(path.join(ROOT, 'raw', item.table + '.csv.gz'));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, item.table + ' checksum');
  }
  const context = { actorId, ipAddress: null };
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
    const counts = { clubsCreated: 0, playersCreated: 0, statsCreated: 0, valuationsCreated: 0 };
    const skipped = { clubsExisting: 0, playersExisting: 0, statsExisting: 0, valuationsExisting: 0, manualProfiles: [] };
    const clubs = await tx.club.findMany({ where: { transfermarktId: { not: null } }, select: { id: true, transfermarktId: true } });
    const clubMap = new Map(clubs.map(row => [row.transfermarktId, row.id]));
    const manualClubs = await tx.club.findMany({ where: { transfermarktId: null }, select: { name: true, country: true } });
    const newClubs = bundle.clubs.filter(row => {
      if (clubMap.has(row.transfermarktId)) { skipped.clubsExisting++; return false; }
      assert(!manualClubs.some(local => local.name === row.name && local.country === row.country), 'CLB cùng tên đã nhập thủ công; đối chiếu ID nguồn trước: ' + row.name);
      return true;
    });
    for (const batch of chunks(newClubs)) {
      const created = await tx.club.createManyAndReturn({ data: batch }); counts.clubsCreated += created.length;
      for (const row of created) clubMap.set(row.transfermarktId, row.id);
      await tx.auditLog.createMany({ data: created.map(row => ({ ...context, entityType: 'Club', entityId: row.id, action: 'CREATE', newValue: json({ ...row, source: SOURCE, scope: bundle.season }) })) });
    }
    const players = await tx.player.findMany({ where: { transfermarktId: { not: null } }, select: { id: true, transfermarktId: true } });
    const playerMap = new Map(players.map(row => [row.transfermarktId, row.id]));
    const manualPlayers = await tx.player.findMany({ where: { transfermarktId: null }, select: { id: true, name: true, dateOfBirth: true } });
    const entries = new Map(bundle.players.map(row => [row.player.transfermarktId, row]));
    const newPlayers = bundle.players.filter(({ player }) => {
      if (playerMap.has(player.transfermarktId)) { skipped.playersExisting++; return false; }
      const manual = manualPlayers.find(row => row.name === player.name && row.dateOfBirth.toISOString().slice(0, 10) === player.dateOfBirth);
      if (manual) { skipped.manualProfiles.push({ transfermarktId: player.transfermarktId, localId: manual.id, name: player.name }); return false; }
      return true;
    });
    for (const batch of chunks(newPlayers)) {
      const created = await tx.player.createManyAndReturn({ data: batch.map(({ player }) => ({ ...player, dateOfBirth: date(player.dateOfBirth) })) });
      counts.playersCreated += created.length;
      for (const row of created) playerMap.set(row.transfermarktId, row.id);
      await tx.auditLog.createMany({ data: created.map(row => ({ ...context, entityType: 'Player', entityId: row.id, action: 'CREATE', newValue: json({ ...row, source: SOURCE, provenance: entries.get(row.transfermarktId).provenance }) })) });
    }
    const localIds = bundle.players.map(({ player }) => playerMap.get(player.transfermarktId)).filter(Boolean);
    const oldStats = await tx.playerStats.findMany({ where: { season: bundle.season, playerId: { in: localIds } }, select: { playerId: true } });
    const statIds = new Set(oldStats.map(row => row.playerId));
    const newStats = [];
    for (const { player, stats } of bundle.players) {
      const playerId = playerMap.get(player.transfermarktId); if (!playerId) continue;
      if (statIds.has(playerId)) { skipped.statsExisting++; continue; }
      newStats.push({ playerId, ...stats });
    }
    for (const batch of chunks(newStats)) {
      const created = await tx.playerStats.createManyAndReturn({ data: batch }); counts.statsCreated += created.length;
      await tx.auditLog.createMany({ data: created.map(row => ({ ...context, entityType: 'PlayerStats', entityId: row.id, action: 'CREATE', newValue: json({ ...row, source: SOURCE, scope: '2025/2026; only the five selected domestic leagues; cup games excluded; transfers within these leagues aggregated once per player/season' }) })) });
    }
    const knownValues = await tx.playerMarketValueHistory.findMany({ where: { source: SOURCE, playerId: { in: localIds } }, select: { playerId: true, valuedAt: true, marketValue: true } });
    const valueMap = new Map(knownValues.map(row => [row.playerId + ':' + row.valuedAt.toISOString().slice(0, 10), row.marketValue.toString()]));
    const newValues = [];
    for (const value of bundle.valuations) {
      const playerId = playerMap.get(value.transfermarktId); if (!playerId) continue;
      const old = valueMap.get(playerId + ':' + value.valuedAt);
      if (old !== undefined) { assert.equal(old, value.marketValue, 'Nguồn thay đổi giá đã lưu; cần đối chiếu, không ghi đè.'); skipped.valuationsExisting++; continue; }
      const { transfermarktId, ...data } = value;
      newValues.push({ ...data, playerId, valuedAt: date(data.valuedAt) });
    }
    for (const batch of chunks(newValues, 1000)) counts.valuationsCreated += (await tx.playerMarketValueHistory.createMany({ data: batch })).count;
    const stars = await tx.player.findMany({ where: { transfermarktId: { in: [418560, 342229, 148455, 139208, 371998, 433177, 581678, 406635] } }, select: { id: true, transfermarktId: true, name: true, position: true } });
    const summary = { provider: SOURCE, season: bundle.season, asOf: bundle.asOf, importedAt: new Date().toISOString(),
      preparedSha256: crypto.createHash('sha256').update(raw).digest('hex'), counts, skipped,
      available: { clubs: bundle.clubs.length, playerProfiles: localIds.length, stats: newStats.length + oldStats.length, valuations: newValues.length + knownValues.length },
      coverage: bundle.report.coverage, coverageBasis: bundle.report.coverageBasis,
      skippedSourceProfiles: bundle.report.skippedProfiles, missingStatistics: bundle.report.missingStatistics,
      notImported: bundle.report.notImported, stars,
      sourceFiles: bundle.download.tables.map(row => ({ table: row.table, sha256: row.sha256, url: row.url })),
    };
    await writeAudit(tx, context, 'TransfermarktImport', 2025, 'CREATE', undefined, summary);
    return summary;
  }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 15000 });
  // This report is written only after the database transaction has committed.
  await fs.writeFile(path.join(ROOT, 'import-report.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(__dirname, '../docs/archive/reports/transfermarkt-import-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { validateBundle };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
