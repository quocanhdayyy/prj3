// Dry-run by default. Only PlayerStatsMetrics and its audit trail are written.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { prisma } = require('../src/config/prisma.ts');
const { metricsInput, metricInputHash } = require('../src/services/player-metrics-input.ts');

const DATA = path.join(__dirname, '../data/v3-metrics');
const SEASON = '2025/2026';
const METHOD = 'V3_PERSONAL_AND_NEIGHBOUR_INPUTS_V1';
const hash = value => metricInputHash(JSON.parse(JSON.stringify(value)));
const payload = row => ({ statsId: row.statsId, method: row.method, inputHash: row.inputHash,
  sourceHash: row.sourceHash, values: row.values, evidence: row.evidence });

async function readInputs(client, transfermarktIds) {
  const rows = await client.playerStats.findMany({
    where: { season: SEASON, player: { transfermarktId: { in: transfermarktIds } } },
    orderBy: { id: 'asc' }, include: { player: true, estimate: true },
  });
  return rows.map(row => {
    const input = metricsInput(row.player, row, row.estimate);
    return { ...input, inputHash: metricInputHash(input) };
  });
}

function validatePrepared(prepared, inputs) {
  assert.equal(prepared.method, METHOD);
  assert.equal(prepared.season, SEASON);
  assert.match(prepared.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(prepared.entries.length, inputs.length);
  const expected = new Map(inputs.map(row => [row.stats.id, row]));
  const seen = new Set();
  for (const entry of prepared.entries) {
    assert(!seen.has(entry.statsId)); seen.add(entry.statsId);
    assert.equal(entry.method, METHOD);
    assert.equal(entry.inputHash, expected.get(entry.statsId)?.inputHash);
    assert.equal(entry.sourceHash, prepared.sourceHash);
    assert.equal(entry.evidence.purpose, 'V3_PROTOTYPE_INPUTS_NOT_VERIFIED_PERFORMANCE');
    assert.deepEqual(Object.keys(entry.values).sort(), [...entry.evidence.requiredMetrics].sort());
    for (const value of Object.values(entry.values)) {
      assert(['OBSERVED', 'DERIVED', 'ESTIMATED', 'MISSING'].includes(value.status));
      assert(['PER_90', 'PERCENT'].includes(value.unit));
      assert.equal(value.value === null, value.status === 'MISSING');
      if (value.value !== null) assert(Number.isFinite(value.value));
      if (value.unit === 'PERCENT' && value.value !== null) assert(value.value >= 0 && value.value <= 100);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert(args[0] === '--actor-id' && /^[1-9]\d*$/.test(args[1] || '') && args.slice(2).every(a => a === '--apply'),
    'Usage: npm run data:metrics -- --actor-id ADMIN_ID [--apply]');
  const actorId = Number(args[1]), apply = args.includes('--apply');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } })).role, 'ADMIN');
  const cohort = JSON.parse(await fs.readFile(path.join(__dirname, '../data/transfermarkt/prepared.json'), 'utf8'));
  const ids = cohort.players.map(p => p.player.transfermarktId);
  const inputs = await readInputs(prisma, ids);
  assert(inputs.length > 0, 'No matching player seasons in the database');
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  const snapshotFile = path.join(DATA, 'snapshot.json');
  await fs.writeFile(snapshotFile, JSON.stringify({ inputs }), { mode: 0o600 });
  const preparedFile = path.join(DATA, 'prepared.json');
  const run = spawnSync('python3', [path.join(__dirname, 'prepare-v3-metrics.py'), '--snapshot', snapshotFile, '--output', preparedFile],
    { encoding: 'utf8', timeout: 180000, maxBuffer: 5 * 1024 * 1024 });
  assert(!run.error && run.status === 0, run.error?.message || run.stderr);
  const prepared = JSON.parse(await fs.readFile(preparedFile, 'utf8'));
  validatePrepared(prepared, inputs);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
    assert.equal(hash(await readInputs(tx, ids)), hash(inputs), 'Player inputs changed while preparing; rerun the import');
    const statsIds = inputs.map(p => p.stats.id);
    const old = await tx.playerStatsMetrics.findMany({ where: { statsId: { in: statsIds } } });
    const previous = new Map(old.map(row => [row.statsId, row]));
    const changed = prepared.entries.filter(row => !previous.has(row.statsId) || hash(payload(previous.get(row.statsId))) !== hash(payload(row)));
    const counts = { planned: changed.length, created: changed.filter(e => !previous.has(e.statsId)).length,
      updated: changed.filter(e => previous.has(e.statsId)).length, unchanged: inputs.length - changed.length };
    if (!apply || !changed.length) return { ...counts, applied: 0, backup: null };
    const backup = path.join(DATA, `before-${Date.now()}.json`);
    await fs.writeFile(backup, JSON.stringify({ createdAt: new Date().toISOString(), observedInputsSha256: hash(inputs),
      statsIds, previousMetrics: old }), { mode: 0o600, flag: 'wx' });
    // A single bulk statement also avoids a long sequence of 2,684 round trips.
    await tx.$executeRaw`
      INSERT INTO player_stats_metrics (stats_id, method, input_hash, source_hash, "values", evidence)
      SELECT x."statsId", x.method, x."inputHash", x."sourceHash", x."values", x.evidence
      FROM jsonb_to_recordset(${JSON.stringify(changed)}::jsonb)
        AS x("statsId" integer, method text, "inputHash" text, "sourceHash" text, "values" jsonb, evidence jsonb)
      ON CONFLICT (stats_id) DO UPDATE SET method = EXCLUDED.method, input_hash = EXCLUDED.input_hash,
        source_hash = EXCLUDED.source_hash, "values" = EXCLUDED."values", evidence = EXCLUDED.evidence,
        generated_at = CURRENT_TIMESTAMP`;
    const audits = changed.map(row => ({ actorId, entityType: 'PlayerStatsMetrics', entityId: row.statsId,
      action: previous.has(row.statsId) ? 'UPDATE' : 'CREATE',
      ...(previous.has(row.statsId) ? { oldValue: payload(previous.get(row.statsId)) } : {}), newValue: payload(row) }));
    for (let i = 0; i < audits.length; i += 100) await tx.auditLog.createMany({ data: audits.slice(i, i + 100) });
    assert.equal(hash(await readInputs(tx, ids)), hash(inputs), 'Observed statistics or original estimates were modified');
    const saved = await tx.playerStatsMetrics.findMany({ where: { statsId: { in: statsIds } }, orderBy: { statsId: 'asc' } });
    assert.equal(hash(saved.map(payload)), hash(prepared.entries.map(payload)), 'Saved metrics differ from the reviewed plan');
    return { ...counts, applied: changed.length, backup: path.relative(path.join(__dirname, '..'), backup) };
  }, { isolationLevel: 'Serializable', timeout: 120000 });
  const { clubAliasEvidence, byMetric, ...summary } = prepared.summary;
  const report = { at: new Date().toISOString(), apply, ...result, summary, byMetric, validation: prepared.validation,
    note: 'Separate prototype inputs. Estimated values and proxy definitions are not verified performance. Matching engine unchanged.' };
  await fs.writeFile(path.join(DATA, apply ? 'import-report.json' : 'dry-run-report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...result, players: summary.players, completePlayers: summary.completePlayers,
    byStatus: summary.byStatus, currentPersonalMatches: summary.currentPersonalMatches, datambPlayerMatches: summary.datambPlayerMatches }, null, 2));
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
module.exports = { validatePrepared };
