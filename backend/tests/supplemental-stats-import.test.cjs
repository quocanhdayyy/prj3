const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prisma } = require('../src/config/prisma.ts');
const { getPlayerStatsById } = require('../src/services/player-stats.service.ts');
const { scoreForm } = require('../src/services/matching/matching-scoring.service.ts');
const { matchingTemplate } = require('../src/config/matching-rules.ts');
const { FIELDS, BASE } = require('../scripts/import-supplemental-stats.cjs');
const { scopeStats, assertProtected } = require('./top5-baseline.cjs');
const root = path.join(__dirname, '../data/supplemental-stats');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

(async () => {
  const before = read('before-import.json'), report = read('import-report.json'), bundle = read('prepared.json');
  const stats = await prisma.playerStats.findMany({ orderBy: { id: 'asc' } });
  const scopedBefore = scopeStats(before.stats);
  assert.equal(stats.length, scopedBefore.length);
  const originalById = new Map(before.stats.map(r=>[r.id,r]));
  const updated = new Map(report.updatedPlayers.map(p => [p.statsId, p]));
  const entries = new Map(bundle.entries.map(e => [e.transfermarktId, e]));
  const laterLogs = await prisma.auditLog.findMany({ where: { entityType: 'PlayerStats', action: 'UPDATE',
    newValue: { path: ['importProvenance', 'pipeline'], equals: 'STATS_ENRICHMENT_V1' } }, orderBy: { id: 'asc' } });
  const later = new Map(laterLogs.map(r => [r.entityId, r.newValue]));
  for (let i = 0; i < stats.length; i++) {
    const row = stats[i], old = originalById.get(row.id), target = updated.get(row.id);
    assert.equal(row.id, old.id);
    if (!target) {
      const expected = { ...old };
      if (later.has(row.id)) for (const key of FIELDS) expected[key] = later.get(row.id)[key];
      assert.deepEqual(row, scopeStats([expected])[0]); continue;
    }
    const entry = entries.get(target.transfermarktId);
    for (const key of ['id', 'playerId', 'season', ...BASE]) assert.equal(row[key], old[key], `baseline changed: ${row.id}/${key}`);
    for (const key of FIELDS) assert.equal(row[key], later.has(row.id) ? later.get(row.id)[key] : old[key] === null ? entry.statistics[key] : old[key]);
  }
  for (const [model, baseline] of Object.entries(before.protectedModels)) {
    await assertProtected(prisma, model, baseline);
  }
  const logs = await prisma.auditLog.findMany({ where: { entityType: 'PlayerStats', action: 'UPDATE',
    newValue: { path: ['importProvenance', 'preparedSha256'], equals: report.preparedSha256 } } });
  assert.equal(logs.length, report.rowsUpdated);
  for (const log of logs) {
    assert(updated.has(log.entityId));
    const provenance = log.newValue.importProvenance;
    assert.equal(provenance.reliability, 'UNKNOWN');
    assert.equal(provenance.sourceSha256, report.sourceSha256);
    assert.equal(provenance.retainedMinutesPlayed, log.oldValue.minutesPlayed);
    assert.equal(provenance.sourceMinutesPlayed - provenance.retainedMinutesPlayed, provenance.minutesDifference);
  }
  for (const tmId of [418560, 342229, 139208, 433177, 148455, 371998, 581678]) {
    const player = await prisma.player.findUniqueOrThrow({ where: { transfermarktId: tmId } });
    const row = stats.find(s => s.playerId === player.id && s.season === bundle.season);
    assert(FIELDS.every(f => row[f] !== null), player.name);
    const response = await getPlayerStatsById(row.id);
    assert.equal(response.passAccuracy, Number((row.passesCompleted / row.passesAttempted * 100).toFixed(2)));
    const form = scoreForm(row, player.position, matchingTemplate().parameters);
    assert(form.score !== null && form.score.gte(0) && form.score.lte(100), 'Supplemented outfield form can be calculated');
  }
  console.log(`PASS: ${report.rowsUpdated} supplemented rows match source; all other stats and ${Object.keys(before.protectedModels).length} domain tables unchanged; one provenance audit per update; seven star players readable with pass accuracy.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
