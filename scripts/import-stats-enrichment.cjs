const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const BACKEND = path.join(__dirname, '..');
const ROOT = path.join(BACKEND, 'data/stats-enrichment');
const FIELDS = ['tacklesWon', 'interceptions', 'keyPasses', 'passesCompleted', 'passesAttempted'];
const BASE = ['appearances', 'minutesPlayed', 'goals', 'assists', 'yellowCards', 'redCards'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));

function planChange(current, entry) {
  if (!current || current.season !== entry.season || BASE.some(k => current[k] !== entry.expectedBaseline[k])) return {};
  const data = {};
  for (const field of FIELDS) if (current[field] === null && entry.data[field] !== undefined && entry.data[field] !== null) data[field] = entry.data[field];
  // A denominator from another provider must not silently change the meaning of an existing numerator.
  const passing = FIELDS.slice(3);
  if (passing.some(f => current[f] !== null && entry.data[f] !== undefined && entry.data[f] !== current[f]) ||
      passing.some(f => current[f] !== null && entry.data[f] === undefined && passing.some(k => k !== f && data[k] !== undefined))) {
    for (const field of passing) delete data[field];
  }
  if ((data.passesCompleted ?? current.passesCompleted) !== null && (data.passesAttempted ?? current.passesAttempted) !== null &&
      (data.passesCompleted ?? current.passesCompleted) > (data.passesAttempted ?? current.passesAttempted)) {
    delete data.passesCompleted; delete data.passesAttempted;
  }
  return data;
}

function validate(bundle) {
  assert.equal(bundle.pipeline, 'STATS_ENRICHMENT_V1'); assert.equal(bundle.season, '2025/2026');
  const ids = new Set();
  for (const e of bundle.entries) {
    assert(Number.isInteger(e.transfermarktId) && e.transfermarktId > 0 && !ids.has(e.transfermarktId)); ids.add(e.transfermarktId);
    assert.equal(e.season, bundle.season);
    for (const [k, v] of Object.entries(e.data)) {
      assert(FIELDS.includes(k) && Number.isInteger(v) && v >= 0 && v <= 2147483647);
      const proof = e.evidence[k], s = proof.sourceBaseline, b = e.expectedBaseline;
      assert.equal(proof.reliability, 'UNKNOWN');
      assert.equal(s.appearances, b.appearances);
      assert(s.minutesPlayed > 0 && b.minutesPlayed > 0);
      assert(Math.abs(s.minutesPlayed - b.minutesPlayed) <= Math.min(b.appearances, Math.floor(b.minutesPlayed / 100)));
      assert(s.goals === null || s.goals === b.goals);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert(args[0] === '--actor-id' && /^\d+$/.test(args[1] || '') && (args.length === 2 || (args.length === 3 && args[2] === '--apply')),
    'Dùng --actor-id <admin ID> [--apply]; mặc định chỉ đọc.');
  const actorId = Number(args[1]), apply = args.includes('--apply');
  const { prisma } = require('../src/config/prisma.ts');
  try {
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } })).role, 'ADMIN');
    const bytes = await fs.readFile(path.join(ROOT, 'prepared.json')), bundle = JSON.parse(bytes), planHash = hash(bytes);
    validate(bundle);
    for (const source of bundle.sources) {
      const file = path.resolve(BACKEND, source.file);
      assert(file.startsWith(path.join(BACKEND, 'data') + path.sep));
      assert.equal(hash(await fs.readFile(file)), source.sha256, 'Source bytes changed: ' + source.file);
    }
    const report = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
      const players = await tx.player.findMany({ where: { transfermarktId: { in: bundle.entries.map(e => e.transfermarktId) } }, include: { stats: { where: { season: bundle.season } } } });
      const index = new Map(players.map(p => [p.transfermarktId, p]));
      const changes = [];
      for (const entry of bundle.entries) {
        const p = index.get(entry.transfermarktId);
        if (!p || p.name !== entry.name || p.dateOfBirth.toISOString().slice(0, 10) !== entry.dateOfBirth) continue;
        const current = p.stats[0], data = planChange(current, entry);
        if (Object.keys(data).length) changes.push({ entry, current, data, name: p.name, playerId: p.id });
      }
      const checkpointFile = 'before-' + planHash + '.json';
      if (apply && changes.length) {
        const checkpoint = { stats: await tx.playerStats.findMany({ orderBy: { id: 'asc' } }), protectedModels: {} };
        for (const model of ['club', 'player', 'contract', 'injuryHistory', 'clubRequirement', 'shortlist', 'shortlistItem', 'transfer', 'notification', 'scoringConfig', 'matchResult', 'playerMarketValueHistory', 'matchingInput', 'playerDataVerification']) {
          const key = model === 'playerDataVerification' ? 'playerId' : 'id';
          const rows = await tx[model].findMany({ orderBy: { [key]: 'asc' } });
          checkpoint.protectedModels[model] = { count: rows.length, sha256: hash(JSON.stringify(rows)) };
        }
        await fs.writeFile(path.join(ROOT, checkpointFile), JSON.stringify(checkpoint), { flag: 'wx' });
        for (const { entry, current, data } of changes) {
          assert.equal((await tx.playerStats.updateMany({ where: current, data })).count, 1);
          await tx.auditLog.create({ data: { actorId, entityType: 'PlayerStats', entityId: current.id, action: 'UPDATE',
            oldValue: json(current), newValue: json({ ...current, ...data, importProvenance: {
              pipeline: bundle.pipeline, planSha256: planHash, policy: bundle.policy,
              fields: Object.fromEntries(Object.keys(data).map(k => [k, entry.evidence[k]])),
            } }) } });
        }
      }
      const coverage = (await tx.playerStats.findMany({ where: { season: bundle.season, player: { transfermarktId: { not: null } } } }))
        .reduce((out, row) => { if (FIELDS.every(f => row[f] !== null)) out.complete++; if (FIELDS.some(f => row[f] !== null)) out.anyKnown++;
          for (const f of FIELDS) if (row[f] !== null) out.knownFields[f]++; return out;
        }, { complete: 0, anyKnown: 0, knownFields: Object.fromEntries(FIELDS.map(f => [f, 0])) });
      const summary = { pipeline: bundle.pipeline, season: bundle.season, planSha256: planHash, checkpointFile,
        runAt: new Date().toISOString(), mode: apply ? 'APPLY' : 'DRY_RUN', candidatePlayers: bundle.entries.length,
        rowsToUpdate: changes.length, rowsUpdated: apply ? changes.length : 0,
        fieldsToFill: changes.reduce((n, r) => n + Object.keys(r.data).length, 0), coverage,
        byLeague: changes.reduce((m, r) => { m[r.entry.league] = (m[r.entry.league] || 0) + 1; return m; }, {}),
        updated: apply ? changes.map(r => ({ statsId: r.current.id, playerId: r.playerId, name: r.name, transfermarktId: r.entry.transfermarktId, data: r.data, league: r.entry.league })) : [] };
      if (apply && changes.length) await tx.auditLog.create({ data: { actorId, entityType: 'StatsEnrichmentImport', entityId: 2025, action: 'CREATE', newValue: json({ ...summary, updated: undefined }) } });
      return summary;
    }, { isolationLevel: 'Serializable', timeout: 180000, maxWait: 15000 });
    const name = apply ? (report.rowsUpdated ? 'import-report.json' : 'last-noop.json') : 'dry-run.json';
    await fs.writeFile(path.join(ROOT, name), JSON.stringify(report, null, 2) + '\n');
    const { updated, ...publicReport } = report;
    if (apply && report.rowsUpdated) await fs.writeFile(path.join(BACKEND, 'docs/archive/reports/stats-enrichment-report.json'), JSON.stringify(publicReport, null, 2) + '\n');
    console.log(JSON.stringify(publicReport, null, 2));
  } finally { await prisma.$disconnect(); }
}

module.exports = { planChange, validate, FIELDS, BASE };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
