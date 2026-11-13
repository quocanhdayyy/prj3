const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.join(__dirname, '../data/supplemental-stats');
const PROVIDER = 'https://github.com/m-mahadi/top5-football-dataset';
const COMMIT = '8940299c2c56c2c0932d3caf292336f5e1689893';
const SOURCE_HASH = 'acf7b7aa303c8de040de30ad2f367ea7c30b61e75d6d10dac2611f36963bbcc6';
const FIELDS = ['tacklesWon', 'interceptions', 'keyPasses', 'passesCompleted', 'passesAttempted'];
const BASE = ['appearances', 'minutesPlayed', 'goals', 'assists', 'yellowCards', 'redCards'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));
const positive = n => Number.isInteger(n) && n > 0 && n <= 2147483647;

function validateBundle(bundle) {
  assert.equal(bundle.provider, PROVIDER); assert.equal(bundle.commit, COMMIT);
  assert.equal(bundle.sourceSha256, SOURCE_HASH); assert.equal(bundle.season, '2025/2026');
  assert.equal(bundle.matchingPolicy, 'EXACT_NAME_CLUB_COUNTS_MINUTES_V1');
  assert.deepEqual(bundle.fields, FIELDS); assert.equal(bundle.reliability, 'UNKNOWN');
  assert(bundle.entries.length > 0);
  const ids = new Set();
  for (const entry of bundle.entries) {
    assert(positive(entry.transfermarktId) && !ids.has(entry.transfermarktId)); ids.add(entry.transfermarktId);
    assert.equal(entry.season, bundle.season);
    assert.deepEqual(Object.keys(entry.statistics), FIELDS);
    assert.deepEqual(Object.keys(entry.expectedBaseline), BASE);
    for (const n of [...Object.values(entry.statistics), ...Object.values(entry.expectedBaseline)]) assert(Number.isInteger(n) && n >= 0 && n <= 2147483647);
    assert(entry.statistics.passesCompleted <= entry.statistics.passesAttempted);
    const p = entry.provenance, b = entry.expectedBaseline;
    assert(positive(p.sourcePlayerId)); assert.equal(p.sourceAppearances, b.appearances); assert.equal(p.sourceGoals, b.goals);
    assert(b.minutesPlayed > 0 && p.sourceMinutesPlayed > 0);
    assert.equal(p.minutesDifference, p.sourceMinutesPlayed - b.minutesPlayed);
    assert(Math.abs(p.minutesDifference) <= Math.min(b.appearances, Math.floor(b.minutesPlayed / 100)));
    assert.equal(p.retainedMinutesPlayed, b.minutesPlayed);
  }
}

function planChange(current, entry) {
  if (!current) return { skip: 'missing_local_stats' };
  if (current.season !== entry.season || BASE.some(k => current[k] !== entry.expectedBaseline[k])) return { skip: 'local_baseline_changed' };
  if (FIELDS.some(k => current[k] !== null && current[k] !== entry.statistics[k])) return { skip: 'existing_statistics_conflict' };
  const data = Object.fromEntries(FIELDS.filter(k => current[k] === null).map(k => [k, entry.statistics[k]]));
  return Object.keys(data).length ? { data } : { skip: 'already_present' };
}

async function main() {
  const args = process.argv.slice(2);
  assert((args.length === 2 || (args.length === 3 && args[2] === '--apply')) && args[0] === '--actor-id' && positive(Number(args[1])),
    'Dùng: npm run data:stats:import -- --actor-id <admin ID> [--apply]. Mặc định chỉ xem kế hoạch.');
  const apply = args.includes('--apply'), actorId = Number(args[1]);
  const { prisma } = require('../src/config/prisma.ts');
  try {
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } });
    assert.equal(actor.role, 'ADMIN');
    const bytes = await fs.readFile(path.join(ROOT, 'prepared.json'));
    const bundle = JSON.parse(bytes); validateBundle(bundle);
    assert.equal(hash(await fs.readFile(path.join(ROOT, 'raw/sofascore_player_seasons.csv'))), SOURCE_HASH);
    assert.equal(hash(await fs.readFile(path.join(__dirname, '../data/transfermarkt/prepared.json'))), bundle.transfermarktBundleSha256);
    const report = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
      const players = await tx.player.findMany({ where: { transfermarktId: { in: bundle.entries.map(e => e.transfermarktId) } }, include: { stats: { where: { season: bundle.season } } } });
      const byId = new Map(players.map(p => [p.transfermarktId, p]));
      const changes = [], skipped = [];
      for (const entry of bundle.entries) {
        const player = byId.get(entry.transfermarktId);
        if (!player || player.name !== entry.name || player.dateOfBirth.toISOString().slice(0, 10) !== entry.dateOfBirth) {
          skipped.push({ transfermarktId: entry.transfermarktId, reason: 'local_identity_changed_or_missing' }); continue;
        }
        const current = player.stats[0], change = planChange(current, entry);
        if (change.skip) { skipped.push({ transfermarktId: entry.transfermarktId, reason: change.skip }); continue; }
        changes.push({ playerId: player.id, name: player.name, transfermarktId: entry.transfermarktId, current, data: change.data, provenance: entry.provenance });
      }
      // Checkpoint all existing stats and hashes of other domain tables; never include credentials.
      const protectedModels = ['club', 'player', 'contract', 'injuryHistory', 'clubRequirement', 'shortlist', 'shortlistItem',
        'transfer', 'notification', 'scoringConfig', 'matchResult', 'playerMarketValueHistory', 'matchingInput', 'playerDataVerification'];
      if (apply && changes.length) {
        const checkpoint = { createdAt: new Date().toISOString(), stats: await tx.playerStats.findMany({ orderBy: { id: 'asc' } }), protectedModels: {} };
        for (const model of protectedModels) {
          const key = model === 'playerDataVerification' ? 'playerId' : 'id';
          const rows = await tx[model].findMany({ orderBy: { [key]: 'asc' } });
          checkpoint.protectedModels[model] = { count: rows.length, sha256: hash(JSON.stringify(rows)) };
        }
        // Write before mutation, even if a later transaction failure forces review. Never overwrite baseline.
        await fs.writeFile(path.join(ROOT, 'before-import.json'), JSON.stringify(checkpoint, null, 2) + '\n', { flag: 'wx' });
        for (const { current, data, provenance } of changes) {
          // Optimistic comparison also protects against API edits while this transaction is running.
          const updated = await tx.playerStats.updateMany({ where: current, data });
          assert.equal(updated.count, 1, 'Concurrent edit detected; import rolled back');
          await tx.auditLog.create({ data: { actorId, entityType: 'PlayerStats', entityId: current.id, action: 'UPDATE',
            oldValue: json(current), newValue: json({ ...current, ...data, importProvenance: {
              provider: PROVIDER, upstream: bundle.upstream, commit: COMMIT, sourceSha256: SOURCE_HASH,
              preparedSha256: hash(bytes), matchingPolicy: bundle.matchingPolicy, reliability: 'UNKNOWN',
              minutesPolicy: bundle.minutesPolicy, ...provenance,
            } }) } });
        }
      }
      const summary = { provider: PROVIDER, commit: COMMIT, sourceSha256: SOURCE_HASH, season: bundle.season,
        preparedSha256: hash(bytes), mode: apply ? 'APPLY' : 'DRY_RUN', runAt: new Date().toISOString(),
        sourcePreparation: bundle.counts, rowsToUpdate: changes.length, rowsUpdated: apply ? changes.length : 0,
        fieldsUpdated: apply ? changes.reduce((n, row) => n + Object.keys(row.data).length, 0) : 0,
        skippedCounts: skipped.reduce((m, row) => { m[row.reason] = (m[row.reason] || 0) + 1; return m; }, {}),
        skipped, updatedPlayers: apply ? changes.map(({ current, data, provenance, ...p }) => ({ ...p, statsId: current.id, fields: Object.keys(data), sourcePlayerId: provenance.sourcePlayerId })) : [],
        byLeague: changes.reduce((m, row) => { const k = row.provenance.league; m[k] = (m[k] || 0) + 1; return m; }, {}),
        minutesPolicy: bundle.minutesPolicy,
      };
      if (apply && changes.length) await tx.auditLog.create({ data: { actorId, entityType: 'SupplementalStatsImport', entityId: 2025, action: 'CREATE', newValue: json(summary) } });
      return summary;
    }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 15000 });
    const filename = apply ? 'import-report.json' : 'dry-run.json';
    // Preserve the first successful import report on a no-op rerun; keep the no-op separately.
    if (apply && report.rowsUpdated === 0) await fs.writeFile(path.join(ROOT, 'last-noop.json'), JSON.stringify(report, null, 2) + '\n');
    else {
      await fs.writeFile(path.join(ROOT, filename), JSON.stringify(report, null, 2) + '\n');
      if (apply) {
        const { skipped, updatedPlayers, ...publicReport } = report;
        publicReport.stars = updatedPlayers.filter(p => [418560, 342229, 148455, 139208, 371998, 433177, 581678, 406635].includes(p.transfermarktId));
        await fs.writeFile(path.join(__dirname, '../docs/archive/reports/supplemental-stats-import-report.json'), JSON.stringify(publicReport, null, 2) + '\n');
      }
    }
    const { skipped, updatedPlayers, ...summary } = report;
    console.log(JSON.stringify(summary, null, 2));
  } finally { await prisma.$disconnect(); }
}

module.exports = { validateBundle, planChange, FIELDS, BASE };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
