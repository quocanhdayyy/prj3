const assert = require('node:assert/strict');
const { planChange } = require('../scripts/import-stats-enrichment.cjs');
const current = { season: '2025/2026', appearances: 30, minutesPlayed: 2000, goals: 5, assists: 4, yellowCards: 3, redCards: 0,
  tacklesWon: null, interceptions: null, keyPasses: null, passesCompleted: null, passesAttempted: null };
const entry = { season: current.season, expectedBaseline: Object.fromEntries(['appearances','minutesPlayed','goals','assists','yellowCards','redCards'].map(k => [k, current[k]])), data: { keyPasses: 0 } };
assert.deepEqual(planChange(current, entry), { keyPasses: 0 });
assert.deepEqual(planChange({ ...current, keyPasses: 9 }, entry), {});
assert.deepEqual(planChange(current, { ...entry, data: {} }), {});
assert.deepEqual(planChange({ ...current, minutesPlayed: 1900 }, entry), {});
assert.deepEqual(planChange(current, { ...entry, data: { passesAttempted: 500 } }), { passesAttempted: 500 });
assert.deepEqual(planChange({ ...current, passesCompleted: 400 }, { ...entry, data: { passesAttempted: 500 } }), {});
assert.deepEqual(planChange({ ...current, passesCompleted: 400 }, { ...entry, data: { passesCompleted: 400, passesAttempted: 500 } }), { passesAttempted: 500 });
assert.deepEqual(planChange({ ...current, passesCompleted: 400 }, { ...entry, data: { passesCompleted: 450, passesAttempted: 500, interceptions: 4 } }), { interceptions: 4 });
assert.deepEqual(planChange(current, { ...entry, data: { passesCompleted: 500, passesAttempted: 400 } }), {});
assert.deepEqual(planChange({ ...current, keyPasses: 0 }, entry), {});
console.log('PASS: partial fills, explicit zero, preserved existing values/baselines, no fabricated passing ratio, repeat no-op.');
