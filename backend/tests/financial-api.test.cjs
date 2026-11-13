const assert = require('node:assert/strict');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/matching/financial`;
  const users = []; const tag = Date.now(); let club, player;
  const password = 'FinancialTest123';
  const call = async (operation, body, token) => {
    const response = await fetch(`${base}/${operation}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, body: JSON.stringify(body) });
    return { status: response.status, payload: await response.json() };
  };
  const expect = async (status, operation, body, token) => {
    const response = await call(operation, body, token);
    assert.equal(response.status, status, JSON.stringify(response.payload)); return response.payload.data;
  };
  const example = { budget: '200000000', salaryLimit: '30000000', estimatedFee: '180000000', expectedSalaryPerYear: '27000000', remainingMonths: 48 };
  try {
    for (const [index, role] of [[1, 'ADMIN'], [2, 'SCOUT'], [3, 'SCOUT']]) users.push(await createUser({ username: `ftest${index}_${tag}`, email: `ftest${index}_${tag}@example.com`, password, role }));
    const tokens = [];
    for (const user of users) {
      const response = await fetch(base.replace('/matching/financial', '/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
      assert.equal(response.status, 200); tokens.push((await response.json()).data.accessToken);
    }
    const [admin, a, b] = tokens;
    await expect(401, 'preview', example);
    await expect(401, 'evaluate', { playerId: 1, requirementId: 1 });
    assert.equal((await expect(200, 'preview', example, a)).financialScore, 79);
    assert.equal((await expect(200, 'preview', { ...example, remainingMonths: 7.5 }, admin)).components.contract.score, 87.5);
    for (const changes of [{ budget: '0' }, { salaryLimit: '0' }, { estimatedFee: '-1' }, { expectedSalaryPerYear: '-1' }, { remainingMonths: -1 }, { remainingMonths: '48' }, { totalScore: 100 }, { userId: users[1].id }]) {
      await expect(400, 'preview', { ...example, ...changes }, a);
    }
    const partial = await expect(200, 'preview', { budget: '100', salaryLimit: '100', estimatedFee: '0' }, a);
    assert.equal(partial.financialScore, null); assert.equal(partial.components.fee.score, 100);
    assert.deepEqual(partial.missing, ['expectedSalaryPerYear', 'remainingMonths']);
    club = await prisma.club.create({ data: { name: 'F Test Club', country: 'Vietnam', league: 'Test', foundedYear: 2000 } });
    player = await prisma.player.create({ data: { name: 'F-only fixture', dateOfBirth: new Date('2000-01-01'), nationality: 'Vietnam', position: 'ST', marketValue: 99999999, height: 180, preferredFoot: 'RIGHT' } });
    const requirement = await prisma.clubRequirement.create({ data: { userId: users[1].id, clubId: club.id, minAge: 18, maxAge: 30, position: 'ST', priority: 1, budget: 200000000, salaryLimit: 30000000 } });
    const ids = { playerId: player.id, requirementId: requirement.id };
    await expect(404, 'evaluate', ids, b);
    await expect(404, 'evaluate', { ...ids, playerId: 2147483647 }, a);
    await expect(400, 'evaluate', { ...ids, remainingMonths: 0 }, a);
    const absent = await expect(200, 'evaluate', ids, a);
    assert.deepEqual(absent.missing, ['estimatedFee', 'expectedSalaryPerYear', 'remainingMonths']);
    assert.equal(absent.financialScore, null);
    const estimate = await prisma.matchingInput.create({ data: { ...ids, userId: users[1].id, estimatedFee: 180000000, expectedSalaryPerYear: 27000000, feeSource: 'Test quote', salarySource: 'Test salary quote' } });
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const today = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(today); end.setUTCFullYear(end.getUTCFullYear() + 4);
    // Keep a distinct existing salary to prove there is no fallback to that value.
    const contract = await prisma.contract.create({ data: { playerId: player.id, clubId: club.id, startDate: today, endDate: end, salaryPerYear: 1, status: 'ACTIVE' } });
    const result = await expect(200, 'evaluate', ids, a);
    assert.equal(result.financialScore, 79);
    assert.equal(result.inputs.expectedSalaryPerYear, '27000000'); assert.equal(result.inputs.estimatedFee, '180000000');
    assert.equal(result.inputs.remainingMonths, '48'); assert.equal(result.sources.contractId, contract.id);
    assert.equal(result.saved, false); assert(!('totalScore' in result)); assert(!('squadScore' in result)); assert(!('riskScore' in result));
    assert.equal((await expect(200, 'evaluate', ids, admin)).financialScore, 79);
    await prisma.matchingInput.update({ where: { id: estimate.id }, data: { expectedSalaryPerYear: null, salarySource: null } });
    const unknownSalary = await expect(200, 'evaluate', ids, a);
    assert.equal(unknownSalary.financialScore, null); assert.deepEqual(unknownSalary.missing, ['expectedSalaryPerYear']);
    await prisma.matchingInput.update({ where: { id: estimate.id }, data: { estimatedFee: 0, expectedSalaryPerYear: 0, salarySource: 'Explicit test zero' } });
    await prisma.contract.delete({ where: { id: contract.id } });
    const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const verification = { registrationStatus: 'FREE_AGENT', registrationAsOf: yesterday, registrationVerifiedAt: new Date(), registrationVerifiedById: users[0].id, registrationSource: 'Test status confirmation' };
    await prisma.playerDataVerification.create({ data: { playerId: player.id, ...verification } });
    assert.equal((await expect(200, 'evaluate', ids, a)).financialScore, null);
    await prisma.playerDataVerification.update({ where: { playerId: player.id }, data: { registrationAsOf: today } });
    const free = await expect(200, 'evaluate', ids, a);
    assert.equal(free.financialScore, 100); assert.equal(free.sources.contractBasis, 'VERIFIED_FREE_AGENT_TODAY');
    await prisma.clubRequirement.update({ where: { id: requirement.id }, data: { budget: 0 } });
    await expect(400, 'evaluate', ids, a);
    assert.equal(await prisma.matchResult.count({ where: { userId: { in: users.map(user => user.id) } } }), 0);
    console.log('PASS: F-only API, example 79, RBAC/ownership, strict inputs, no hidden financial fallback, incomplete data, contract months, verified free agent and no MatchResult writes.');
  } finally {
    const userIds = users.map(user => user.id);
    if (player) {
      await prisma.playerDataVerification.deleteMany({ where: { playerId: player.id } });
      await prisma.contract.deleteMany({ where: { playerId: player.id } });
      await prisma.matchingInput.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
    if (userIds.length) {
      await prisma.clubRequirement.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (club) await prisma.club.delete({ where: { id: club.id } });
    await new Promise(resolve => server.close(resolve)); await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
