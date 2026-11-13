const assert = require('node:assert/strict');
const { Prisma } = require('../src/generated/prisma/client.ts');
const { calculateFinancialFit, remainingContractMonths } = require('../src/services/matching/financial-scoring.service.ts');
const d = value => value === null ? null : new Prisma.Decimal(value);
const score = (changes = {}) => calculateFinancialFit(Object.fromEntries(Object.entries({
  budget: '200000000', salaryLimit: '30000000', estimatedFee: '180000000',
  expectedSalaryPerYear: '27000000', remainingMonths: '48', ...changes,
}).map(([key, value]) => [key, d(value)])));

const example = score();
assert.equal(example.financialScore, 79);
assert.deepEqual(Object.fromEntries(Object.entries(example.components).map(([key, component]) => [key, component.score])), { fee: 92, salary: 96, contract: 20 });
assert.deepEqual(Object.values(example.components).map(component => component.contribution), [41.4, 33.6, 4]);
assert.equal(example.saved, false);
assert.equal(score({ estimatedFee: 0, expectedSalaryPerYear: 0, remainingMonths: 0 }).financialScore, 100);
assert.equal(score({ estimatedFee: '400000000', expectedSalaryPerYear: '45000000', remainingMonths: 60 }).financialScore, 0);
assert.equal(score({ estimatedFee: '200000000', expectedSalaryPerYear: '30000000' }).components.fee.score, 80);
assert.equal(score({ expectedSalaryPerYear: '30000000' }).components.salary.score, 80);
assert.equal(score({ expectedSalaryPerYear: '45000000' }).components.salary.score, 0);
assert.equal(score({ budget: 60, salaryLimit: 10, estimatedFee: 50, expectedSalaryPerYear: 9, remainingMonths: 7.5 }).financialScore, 96.1);
assert.equal(score({ remainingMonths: 9.5 }).components.contract.score, 84.17);
assert.equal(score({ remainingMonths: 11.25 }).components.contract.score, 81.25);
assert.equal(score({ remainingMonths: 120 }).components.contract.score, 0);
for (const field of ['estimatedFee', 'expectedSalaryPerYear', 'remainingMonths']) {
  const result = score({ [field]: null });
  assert.equal(result.complete, false); assert.equal(result.financialScore, null); assert.deepEqual(result.missing, [field]);
}
for (const changes of [{ budget: 0 }, { salaryLimit: 0 }, { budget: -1 }, { estimatedFee: -1 }, { remainingMonths: -1 }, { expectedSalaryPerYear: 'Infinity' }]) {
  assert.throws(() => score(changes));
}
for (const [field, scale] of [['estimatedFee', 2000000], ['expectedSalaryPerYear', 300000], ['remainingMonths', 1]]) {
  let previous = 100;
  for (let i = 0; i <= 200; i++) {
    const value = score({ [field]: i * scale }).financialScore;
    assert(value >= 0 && value <= 100); assert(value <= previous, `${field} must not increase F when it increases`); previous = value;
  }
}
// Candidate-independent and invariant to changing the monetary unit consistently.
assert.equal(score({ budget: 200, salaryLimit: 30, estimatedFee: 180, expectedSalaryPerYear: 27 }).financialScore, example.financialScore);
const months = (from, to) => remainingContractMonths(new Date(from), new Date(to));
assert(months('2025-01-31', '2025-02-28').equals(1));
assert(months('2024-01-31', '2024-02-29').equals(1));
assert(months('2025-12-15', '2026-01-15').equals(1));
assert(months('2026-10-15', '2030-10-15').equals(48));
assert(months('2025-01-31', '2025-03-15').equals(new Prisma.Decimal(1).add(new Prisma.Decimal(15).div(31))));
assert(months('2026-10-15', '2026-10-15').isZero());
assert(months('2026-10-15', '2020-01-01').isZero());
assert.throws(() => months('invalid', '2026-01-01'));
console.log('PASS: F example 79, formula boundaries, clamping, fractional months, unknown/zero distinction, monotonicity, scale independence and calendar month ends. No database writes.');
