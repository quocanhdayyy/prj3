const assert = require('node:assert/strict');
const { prisma } = require('../src/config/prisma.ts');
const ROLLBACK = 'MATCHING_DATA_TEST_ROLLBACK';
let sequence = 0;

async function fixture(tx) {
  const key = `${Date.now()}_${++sequence}`;
  const user = await tx.user.create({ data: {
    username: `matching_${key}`, email: `matching_${key}@example.com`, passwordHash: 'test-only', role: 'ADMIN',
  }});
  const club = await tx.club.create({ data: { name: 'Matching Test Club', country: 'Vietnam', league: 'Test', foundedYear: 2000 }});
  const player = await tx.player.create({ data: {
    name: 'Matching Test Player', dateOfBirth: new Date('2000-01-01'), nationality: 'Vietnam',
    position: 'CM', marketValue: 20000000, height: 180, preferredFoot: 'RIGHT',
  }});
  const requirement = await tx.clubRequirement.create({ data: {
    userId: user.id, clubId: club.id, minAge: 18, maxAge: 30, salaryLimit: 10000000,
    position: 'CM', priority: 1, budget: 60000000,
  }});
  return { user, player, requirement };
}

async function scenario(name, check) {
  await assert.rejects(prisma.$transaction(async tx => {
    await check(tx, await fixture(tx));
    throw new Error(ROLLBACK);
  }), error => error.message === ROLLBACK, name);
  console.log(`PASS: ${name}`);
}

function checkViolation(operation, constraint) {
  return assert.rejects(operation, error => `${error.message} ${JSON.stringify(error)}`.includes(constraint));
}

const history = playerId => ({
  playerId, valuedAt: new Date('2025-10-01'), marketValue: 20000000,
  source: 'Simulated test valuation', reliability: 'UNKNOWN',
});
const input = f => ({
  playerId: f.player.id, requirementId: f.requirement.id, userId: f.user.id,
  estimatedFee: 0, feeSource: 'Explicit test estimate: no transfer fee',
});

(async () => {
  await scenario('Old player creation remains valid; unverified is not free or injury-free', async (tx, f) => {
    assert.deepEqual(f.player.secondaryPositions, []);
    assert.equal(await tx.playerDataVerification.findUnique({ where: { playerId: f.player.id }}), null);
    const row = await tx.playerDataVerification.create({ data: { playerId: f.player.id }});
    assert.equal(row.registrationStatus, 'UNKNOWN');
    assert.equal(row.injuryCoveredFrom, null);
  });
  await scenario('Secondary positions preserve multiple distinct playable roles', async (tx, f) => {
    const row = await tx.player.update({ where: { id: f.player.id }, data: { secondaryPositions: ['CDM', 'CAM'] }});
    assert.deepEqual(row.secondaryPositions, ['CDM', 'CAM']);
  });
  for (const secondaryPositions of [['CM'], ['CDM', 'CDM'], ['cdm'], [''], ['RCM'], ['FWD']]) {
    await scenario(`Reject invalid secondary positions ${JSON.stringify(secondaryPositions)}`, (tx, f) =>
      checkViolation(tx.player.update({ where: { id: f.player.id }, data: { secondaryPositions }}), 'player_secondary_positions_valid'));
  }
  for (const position of ['LM', 'RWB', 'LCM', 'CF', 'FWD', ' cm ']) {
    await scenario(`DB only stores canonical primary code ${position}`, (tx, f) =>
      checkViolation(tx.player.update({ where: { id: f.player.id }, data: { position } }), 'player_primary_position_valid'));
  }
  await scenario('DB only stores canonical requirement position', (tx, f) =>
    checkViolation(tx.clubRequirement.update({ where: { id: f.requirement.id }, data: { position: 'LCM' } }), 'requirement_position_valid'));
  await scenario('Valuation history retains date, source and past values independently of current value', async (tx, f) => {
    await tx.playerMarketValueHistory.create({ data: history(f.player.id) });
    await tx.playerMarketValueHistory.create({ data: { ...history(f.player.id), valuedAt: new Date('2026-10-01'), marketValue: 24000000 }});
    await tx.player.update({ where: { id: f.player.id }, data: { marketValue: 25000000 }});
    const rows = await tx.playerMarketValueHistory.findMany({ where: { playerId: f.player.id }, orderBy: { valuedAt: 'asc' }});
    assert.deepEqual(rows.map(row => row.marketValue.toString()), ['20000000', '24000000']);
  });
  await scenario('Reject duplicate valuations from the same source and date', async (tx, f) => {
    await tx.playerMarketValueHistory.create({ data: history(f.player.id) });
    await assert.rejects(tx.playerMarketValueHistory.create({ data: history(f.player.id) }), error => error.code === 'P2002');
  });
  for (const changes of [{ marketValue: -1 }, { source: ' ' }, { valuedAt: new Date('2099-01-01') }]) {
    await scenario(`Reject invalid valuation ${JSON.stringify(changes)}`, (tx, f) =>
      checkViolation(tx.playerMarketValueHistory.create({ data: { ...history(f.player.id), ...changes }}), 'market_value_history_valid'));
  }
  await scenario('Expected fee zero differs from unknown salary; each requirement has independent inputs', async (tx, f) => {
    const row = await tx.matchingInput.create({ data: input(f) });
    assert.equal(row.estimatedFee.toString(), '0');
    assert.equal(row.expectedSalaryPerYear, null);
    const other = await tx.clubRequirement.create({ data: {
      clubId: f.requirement.clubId, userId: f.user.id, minAge: 20, maxAge: 28,
      budget: 50000000, salaryLimit: 8000000, position: 'CM', priority: 1,
    }});
    await tx.matchingInput.create({ data: {
      ...input(f), requirementId: other.id, estimatedFee: 45000000,
      expectedSalaryPerYear: 9000000, salarySource: 'Simulated salary negotiation',
    }});
    assert.equal(await tx.matchingInput.count({ where: { playerId: f.player.id }}), 2);
  });
  await scenario('Reject duplicate candidate/requirement input', async (tx, f) => {
    await tx.matchingInput.create({ data: input(f) });
    await assert.rejects(tx.matchingInput.create({ data: input(f) }), error => error.code === 'P2002');
  });
  await scenario('Matching input cannot claim a requirement owned by another user', async (tx, f) => {
    const other = await tx.user.create({ data: {
      username: `outsider_${Date.now()}`, email: `outsider_${Date.now()}@example.com`, passwordHash: 'test-only',
    }});
    await assert.rejects(tx.matchingInput.create({ data: { ...input(f), userId: other.id }}), error => error.code === 'P2003');
  });
  for (const changes of [{ estimatedFee: -1 }, { expectedSalaryPerYear: -1, salarySource: 'test' }, { estimatedFee: null, feeSource: null }]) {
    await scenario(`Reject invalid matching money ${JSON.stringify(changes)}`, (tx, f) =>
      checkViolation(tx.matchingInput.create({ data: { ...input(f), ...changes }}), 'matching_input_money_valid'));
  }
  await scenario('Known estimates require a nonblank source', (tx, f) =>
    checkViolation(tx.matchingInput.create({ data: { ...input(f), feeSource: ' ' }}), 'matching_input_sources_valid'));
  await scenario('Verified injury coverage and registration retain verifier and as-of dates', async (tx, f) => {
    const row = await tx.playerDataVerification.create({ data: {
      playerId: f.player.id,
      injuryCoveredFrom: new Date('2024-10-01'), injuryCoveredThrough: new Date('2026-10-01'),
      injuryVerifiedAt: new Date('2026-10-02T12:00:00Z'), injuryVerifiedById: f.user.id, injurySource: 'Test review',
      registrationStatus: 'FREE_AGENT', registrationAsOf: new Date('2026-10-01'),
      registrationVerifiedAt: new Date('2026-10-02T12:00:00Z'), registrationVerifiedById: f.user.id, registrationSource: 'Test confirmation',
    }});
    assert.equal(row.registrationStatus, 'FREE_AGENT');
    assert.equal(row.injuryCoveredThrough.toISOString().slice(0, 10), '2026-10-01');
  });
  await scenario('Reject partial injury verification', (tx, f) =>
    checkViolation(tx.playerDataVerification.create({ data: { playerId: f.player.id, injuryCoveredFrom: new Date('2024-10-01') }}), 'injury_coverage_verification_valid'));
  await scenario('Reject reversed coverage dates', (tx, f) =>
    checkViolation(tx.playerDataVerification.create({ data: {
      playerId: f.player.id, injuryCoveredFrom: new Date('2026-10-01'), injuryCoveredThrough: new Date('2024-10-01'),
      injuryVerifiedAt: new Date('2026-10-02T12:00:00Z'), injuryVerifiedById: f.user.id, injurySource: 'Test review',
    }}), 'injury_coverage_verification_valid'));
  await scenario('Free agent status requires dated evidence and a verifier', (tx, f) =>
    checkViolation(tx.playerDataVerification.create({ data: { playerId: f.player.id, registrationStatus: 'FREE_AGENT' }}), 'registration_verification_valid'));
  console.log('PASS: Matching database constraints verified. Every fixture transaction rolled back.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
