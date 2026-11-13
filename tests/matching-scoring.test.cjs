const assert = require('node:assert/strict');
const { Prisma } = require('../src/generated/prisma/client.ts');
const { matchingTemplate } = require('../src/config/matching-rules.ts');
const { validateMatchingConfig } = require('../src/services/matching/matching-config.ts');
const { scoreBenchmark, scoreForm, scoreInjury, scorePosition, scoreResale, scoreBand, playerAge, combine, display } = require('../src/services/matching/matching-scoring.service.ts');
const d = value => new Prisma.Decimal(value);
const day = value => new Date(`${value}T00:00:00Z`);
const template = matchingTemplate();
// Test-only weights/groups; these are NOT seeded or treated as user-approved defaults.
template.criteriaWeights.squad = { position: 0.2, age: 0.2, form: 0.6 };
template.criteriaWeights.risk = { injury: 0.6, resale: 0.4 };
template.parameters.positionGroups = [['ST', 'LW', 'RW'], ['CAM', 'CM', 'CDM'], ['CB', 'RB', 'LB']];
template.parameters.completedSeasons = ['2025/2026'];
const record = { ...template, id: 1, financialWeight: d(0.4), squadWeight: d(0.4), riskWeight: d(0.2) };
const config = validateMatchingConfig(record); const rules = config.rules;
assert.throws(() => validateMatchingConfig({ ...record, criteriaWeights: matchingTemplate().criteriaWeights }));
for (const mutate of [
  data => { data.parameters.roles.ST.metrics.goals.b = 0.1; },
  data => { data.parameters.roles.ST.minutesWeight = 0.3; },
  data => { data.parameters.positionGroups = [['ST', 'ST']]; },
  data => { data.parameters.minutes.reverse(); },
  data => { data.parameters.injury[0].max = -1; },
  data => { data.parameters.resale.ageWeight = 0.5; },
  data => { delete data.criteriaWeights.squad.form; },
]) {
  const data = structuredClone(template); mutate(data);
  assert.throws(() => validateMatchingConfig({ ...data, id: 1, financialWeight: d(0.4), squadWeight: d(0.4), riskWeight: d(0.2) }));
}
assert.equal(display(scoreBenchmark(d(0.3), 0.6, 1, 80)), 40);
assert.equal(display(scoreBenchmark(d(0.6), 0.6, 1, 80)), 80);
assert.equal(display(scoreBenchmark(d(0.8), 0.6, 1, 80)), 90);
assert.equal(display(scoreBenchmark(d(2), 0.6, 1, 80)), 100);
assert.equal(display(scorePosition('CM', ['CDM'], 'CM', rules).score), 100);
assert.equal(display(scorePosition('CM', ['CDM'], 'CDM', rules).score), 80);
assert.equal(display(scorePosition('CB', [], 'RB', rules).score), 50);
assert.equal(display(scorePosition('CB', [], 'ST', rules).score), 0);
assert.equal(scorePosition('CB', [], 'RB', { ...rules, positionGroups: [] }).score, null);
assert.equal(display(scorePosition('GK', [], 'GK', rules).score), 100);
for (const [source, target] of [['RWB','RB'],['LWB','LB'],['RCM','CM'],['LCM','CM'],['CF','ST'],['SS','ST']]) {
  assert.equal(display(scorePosition(source, [], target, rules).score), 100);
}
for (const [age, expected] of [[15,80],[19,80],[20,90],[24,90],[25,100],[30,100],[31,80],[34,80],[35,70]]) assert.equal(display(scoreBand(age, rules.squadAge)), expected);
assert.equal(scoreBand(14, rules.squadAge), null);
assert.equal(playerAge(day('2001-10-16'), day('2026-10-15')), 24);
assert.equal(playerAge(day('2001-10-15'), day('2026-10-15')), 25);
for (const [minutes, expected] of [[1,60],[449,60],[450,70],[899,70],[900,80],[1499,80],[1500,90],[1999,90],[2000,100]]) assert.equal(display(scoreBand(minutes, rules.minutes)), expected);
const stats = { minutesPlayed: 2250, goals: 15, assists: 5, keyPasses: 25, tacklesWon: 50, interceptions: 50, passesCompleted: 1250, passesAttempted: 1500, yellowCards: 4, redCards: 0 };
assert.equal(display(scoreForm(stats, 'ST', rules).score), 84);
assert.equal(scoreForm(stats, 'ST', rules).details.passAccuracy, 83.33);
assert.equal(scoreForm(stats, 'ST', rules).details.per90.goals, 0.6);
const low = scoreForm({ ...stats, minutesPlayed: 90, goals: 2, assists: 2, keyPasses: 4 }, 'ST', rules);
assert.equal(display(low.score), 80); assert.equal(low.details.capApplied, true);
assert.equal(display(scoreForm({ ...stats, minutesPlayed: 450, goals: 20, assists: 20, keyPasses: 50 }, 'ST', rules).score), 90);
assert.equal(scoreForm({ ...stats, minutesPlayed: 0 }, 'ST', rules).score, null);
assert.equal(scoreForm(null, 'ST', rules).score, null);
assert.equal(scoreForm({ ...stats, keyPasses: null }, 'ST', rules).score, null);
assert.equal(scoreForm({ ...stats, interceptions: null }, 'ST', rules).score.toNumber(), 84); // unused metric is not required
for (const position of ['ST','LW','RW','CAM','CM','CDM','CB','RB','LB']) {
  const form = scoreForm(stats, position, rules);
  assert(form.score !== null && form.score.gte(0) && form.score.lte(100), position);
}
assert.equal(scoreForm(stats, 'GK', rules).score, null);
assert.equal(display(scoreForm(stats, 'LW', rules).score), display(scoreForm(stats, 'RW', rules).score));
assert.equal(display(scoreForm(stats, 'LB', rules).score), display(scoreForm(stats, 'RB', rules).score));
const asOf = day('2026-10-15'); const evaluatedAt = new Date('2026-10-15T12:00:00Z');
const verification = { injuryCoveredFrom: day('2024-10-15'), injuryCoveredThrough: asOf, injuryVerifiedAt: evaluatedAt, injuryVerifiedById: 1, injurySource: 'Fixture review' };
const injury = (start, end) => ({ startDate: day(start), endDate: end === null ? null : day(end) });
const merged = scoreInjury([injury('2025-01-01','2025-01-31'), injury('2025-01-15','2025-02-15'), injury('2025-02-15','2025-02-15')], verification, asOf, evaluatedAt, rules);
assert.equal(merged.details.daysMissed, 45); assert.equal(display(merged.score), 80);
assert.equal(display(scoreInjury([], verification, asOf, evaluatedAt, rules).score), 100);
assert.equal(scoreInjury([], null, asOf, evaluatedAt, rules).score, null);
assert.equal(scoreInjury([], { ...verification, injuryCoveredFrom: day('2025-01-01') }, asOf, evaluatedAt, rules).score, null);
assert.equal(display(scoreInjury([injury('2026-10-14',null)], verification, asOf, evaluatedAt, rules).score), 50);
assert.equal(scoreInjury([injury('2026-10-14','2026-10-15')], verification, asOf, evaluatedAt, rules).details.ongoing, false);
assert.equal(scoreInjury([injury('2024-10-01','2024-10-20')], verification, asOf, evaluatedAt, rules).details.daysMissed, 5);
for (const [days, expected] of [[30,100],[31,80],[90,80],[91,60],[180,60],[181,40],[270,40],[271,20]]) {
  const start = new Date(asOf); start.setUTCDate(start.getUTCDate() - days);
  assert.equal(display(scoreInjury([{ startDate: start, endDate: asOf }], verification, asOf, evaluatedAt, rules).score), expected);
}
const valuations = [
  { id: 1, valuedAt: day('2025-10-15'), marketValue: d(20), source: 'Fixture', recordedAt: evaluatedAt },
  { id: 2, valuedAt: asOf, marketValue: d(24), source: 'Fixture', recordedAt: evaluatedAt },
];
const resale = scoreResale(valuations, 25, asOf, evaluatedAt, rules);
assert.equal(resale.details.changePercent, 20); assert.equal(resale.details.trendScore, 90); assert.equal(display(resale.score), 86);
assert.equal(scoreResale([], 25, asOf, evaluatedAt, rules).score, null);
assert.equal(scoreResale([{ ...valuations[0], marketValue: d(0) }, valuations[1]], 25, asOf, evaluatedAt, rules).score, null);
assert.equal(display(scoreResale([{ ...valuations[0], valuedAt: day('2025-10-14') }, valuations[1]], 25, asOf, evaluatedAt, rules).score), 86);
const approximate = scoreResale([{ ...valuations[0], valuedAt: day('2025-09-01') }, { ...valuations[1], valuedAt: day('2026-06-01') },
  { ...valuations[1], id: 3, valuedAt: day('2026-10-16'), marketValue: d(999) }], 25, asOf, evaluatedAt, rules);
assert.equal(display(approximate.score), 86);
assert.equal(approximate.details.currentDate, '2026-06-01'); assert.equal(approximate.details.priorDate, '2025-09-01');
assert(approximate.details.quoteAgeDays > 0 && approximate.details.comparisonDays < 365);
assert.equal(scoreResale([valuations[0]], 25, asOf, evaluatedAt, rules).score, null); // do not reuse the same stale row twice
assert.equal(scoreResale([{ ...valuations[0], source: 'Different' }, valuations[1]], 25, asOf, evaluatedAt, rules).score, null);
assert.equal(scoreResale(valuations.map(row => ({ ...row, recordedAt: day('2026-10-16') })), 25, asOf, evaluatedAt, rules).score, null);
const multiple = [...valuations, ...valuations.map(item => ({ ...item, source: 'Other' }))];
assert.equal(scoreResale(multiple, 25, asOf, evaluatedAt, rules).score, null);
assert.equal(display(scoreResale(multiple, 25, asOf, evaluatedAt, rules, 'Fixture').score), 86);
assert.equal(display(combine({ financial: d(79), squad: d(90.4), risk: d(94.4) }, config.pillarWeights)), 86.64);
assert.equal(combine({ financial: null, squad: d(90), risk: d(90) }, config.pillarWeights), null);
assert.equal(display(combine({ known: d(80), missing: null }, { known: 1, missing: 0 })), 80);
console.log('PASS: Matching config validation; all agreed position/age/minute/injury boundaries; 7 role formulas; per90 and cap; missing/zero; overlap/clipped injury days; exact-source valuation trend and weighted total. Test-only S/R weights, no database writes.');
