const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prisma } = require('../src/config/prisma.ts');
const { getPlayerStatsById } = require('../src/services/player-stats.service.ts');
const { FIELDS } = require('../scripts/import-stats-enrichment.cjs');
const { scopeStats, assertProtected } = require('./top5-baseline.cjs');
const root = path.join(__dirname, '../data/stats-enrichment');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
  const report = read('import-report.json'), before = read(report.checkpointFile);
  const stats = await prisma.playerStats.findMany({ orderBy: { id: 'asc' } });
  const updates = new Map(report.updated.map(r => [r.statsId, r]));
  const expectedRows=scopeStats(before.stats.map(old=>({...old,...(updates.get(old.id)?.data||{})})));
  const originals=new Map(before.stats.map(r=>[r.id,r]));
  assert.equal(stats.length, expectedRows.length);
  for (let i = 0; i < stats.length; i++) {
    const current = stats[i], old = originals.get(current.id), update = updates.get(old.id);
    assert.equal(current.id, old.id);
    assert.deepEqual(current, expectedRows[i]);
    if (update) for (const [field, value] of Object.entries(update.data)) {
      assert(FIELDS.includes(field)); assert.equal(old[field], null); assert(Number.isInteger(value) && value >= 0);
    }
    if (current.passesCompleted !== null && current.passesAttempted !== null) assert(current.passesCompleted <= current.passesAttempted);
  }
  for (const [model, original] of Object.entries(before.protectedModels)) {
    await assertProtected(prisma, model, original);
  }
  const logs = await prisma.auditLog.findMany({ where: { entityType: 'PlayerStats', action: 'UPDATE',
    newValue: { path: ['importProvenance', 'planSha256'], equals: report.planSha256 } } });
  assert.equal(logs.length, report.rowsUpdated);
  for (const log of logs) {
    const update = updates.get(log.entityId); assert(update);
    assert.deepEqual(Object.keys(log.newValue.importProvenance.fields).sort(), Object.keys(update.data).sort());
    for (const proof of Object.values(log.newValue.importProvenance.fields)) assert.equal(proof.reliability, 'UNKNOWN');
  }
  const example = report.updated.find(r => stats.some(s=>s.id===r.statsId) && Object.keys(r.data).length < 5) || report.updated.find(r=>stats.some(s=>s.id===r.statsId));
  const result = await getPlayerStatsById(example.statsId);
  for (const [field, value] of Object.entries(example.data)) assert.equal(result[field], value);
  console.log(`PASS: ${report.rowsUpdated} rows fill NULL fields only; all other values and 14 tables unchanged; per-field provenance; partial stats readable.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
