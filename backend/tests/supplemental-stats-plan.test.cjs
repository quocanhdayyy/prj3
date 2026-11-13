const assert = require('node:assert/strict');
const { planChange, FIELDS } = require('../scripts/import-supplemental-stats.cjs');
const entry = { season: '2025/2026', expectedBaseline: { appearances: 30, minutesPlayed: 2000, goals: 5, assists: 4, yellowCards: 3, redCards: 0 },
  statistics: { tacklesWon: 0, interceptions: 10, keyPasses: 20, passesCompleted: 400, passesAttempted: 500 } };
const current = { id: 1, playerId: 2, season: entry.season, ...entry.expectedBaseline, ...Object.fromEntries(FIELDS.map(k => [k, null])) };
assert.deepEqual(planChange(current, entry), { data: entry.statistics });
assert.deepEqual(planChange({ ...current, ...entry.statistics }, entry), { skip: 'already_present' });
assert.deepEqual(planChange({ ...current, keyPasses: 999 }, entry), { skip: 'existing_statistics_conflict' });
assert.deepEqual(planChange({ ...current, minutesPlayed: 1000 }, entry), { skip: 'local_baseline_changed' });
assert.deepEqual(planChange({ ...current, season: '2024/2025' }, entry), { skip: 'local_baseline_changed' });
assert.deepEqual(planChange(null, entry), { skip: 'missing_local_stats' });
assert.deepEqual(planChange({ ...current, passesCompleted: 400 }, entry).data,
  { tacklesWon: 0, interceptions: 10, keyPasses: 20, passesAttempted: 500 });
console.log('PASS: fill only NULL; explicit zero retained; existing values and modified baselines protected; rerun is a no-op.');
