const assert = require('node:assert/strict');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, body: payload };
  };
  const expect = async (status, method, path, body, token) => {
    const response = await call(method, path, body, token);
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(response.body)}`);
    return response.body?.data;
  };
  const users = [], players = [], tag = Date.now();
  const password = 'MatchingApiTest123';
  let club;
  try {
    for (const [index, role] of [[1, 'ADMIN'], [2, 'SCOUT'], [3, 'SCOUT']]) {
      users.push(await createUser({ username: `matapi${index}_${tag}`, email: `matapi${index}_${tag}@example.com`, password, role }));
    }
    const tokens = [];
    for (const user of users) tokens.push((await expect(200, 'POST', '/auth/login', { email: user.email, password })).accessToken);
    const [admin, a, b] = tokens;
    club = await prisma.club.create({ data: { name: 'Matching API Test', country: 'Vietnam', league: 'Test', foundedYear: 2000 } });
    const playerBody = { name: 'Matching API Player', dateOfBirth: '2000-01-01', nationality: 'Vietnam', position: 'CM', marketValue: '100', height: 180, preferredFoot: 'RIGHT' };
    const player = await expect(201, 'POST', '/players', playerBody, admin); players.push(player.id);
    assert.deepEqual(player.secondaryPositions, []);
    const ppath = `/players/${player.id}`;
    await expect(403, 'PATCH', ppath, { secondaryPositions: ['CDM'] }, a);
    assert.deepEqual((await expect(200, 'PATCH', ppath, { secondaryPositions: ['cdm', ' CAM '] }, admin)).secondaryPositions, ['CDM', 'CAM']);
    for (const value of [null, 'CDM', ['CDM', 'cdm'], ['CM'], [''], [4]]) {
      await expect(400, 'PATCH', ppath, { secondaryPositions: value }, admin);
    }
    await expect(400, 'PATCH', ppath, { position: 'CDM' }, admin);
    assert.equal((await expect(200, 'GET', ppath, undefined, a)).position, 'CM');
    assert.equal((await expect(200, 'PATCH', ppath, { position: 'CDM', secondaryPositions: ['CM'] }, admin)).position, 'CDM');
    await expect(200, 'PATCH', ppath, { position: 'CM', secondaryPositions: [] }, admin);
    for (const [source, target] of [['RWB','RB'],['LWB','LB'],['RCM','CM'],['LCM','CM'],['CF','ST'],['SS','ST'],['LM','LW'],['RM','RW'],[' gk ','GK']]) {
      assert.equal((await expect(200, 'PATCH', ppath, { position: source }, admin)).position, target);
    }
    await expect(200, 'PATCH', ppath, { position: 'ST', secondaryPositions: ['RCM', 'RWB'] }, admin);
    await expect(400, 'PATCH', ppath, { secondaryPositions: ['RCM', 'LCM'] }, admin);
    await expect(400, 'PATCH', ppath, { secondaryPositions: ['CF'] }, admin);
    for (const invalid of ['DF','FWD','MIDDLE','NOT_A_POSITION']) {
      await expect(400, 'PATCH', ppath, { position: invalid }, admin);
      await expect(400, 'PATCH', ppath, { secondaryPositions: [invalid] }, admin);
    }
    await expect(200, 'PATCH', ppath, { position: 'CM', secondaryPositions: [] }, admin);
    const secondaryPlayer = await expect(201, 'POST', '/players', { ...playerBody, secondaryPositions: ['CDM'] }, admin); players.push(secondaryPlayer.id);
    assert.deepEqual(secondaryPlayer.secondaryPositions, ['CDM']);
    console.log('PASS: Player APIs accept optional secondary positions, merge updates safely, reject duplicates and primary conflicts.');

    for (const path of ['/market-value-history', '/matching-inputs', '/player-data-verifications']) {
      await expect(401, 'GET', path);
      await expect(401, 'GET', `${path}/1`);
      await expect(400, 'GET', `${path}?pageSize=101`, undefined, admin);
    }
    const history = { playerId: player.id, valuedAt: '2025-01-01', marketValue: '20000000', source: 'Simulated test source', reliability: 'UNKNOWN' };
    await expect(403, 'POST', '/market-value-history', history, a);
    for (const patch of [{ valuedAt: '2025-02-30' }, { valuedAt: '2099-01-01' }, { marketValue: '-1' }, { source: '' }, { reliability: 'FAKE' }, { recordedAt: '2025-01-01' }]) {
      await expect(400, 'POST', '/market-value-history', { ...history, ...patch }, admin);
    }
    const valuation = await expect(201, 'POST', '/market-value-history', history, admin);
    await expect(409, 'POST', '/market-value-history', history, admin);
    const valuation2 = await expect(201, 'POST', '/market-value-history', { ...history, valuedAt: '2026-01-01', marketValue: '24000000' }, admin);
    const historyList = await call('GET', `/market-value-history?playerId=${player.id}&pageSize=1`, undefined, a);
    assert.equal(historyList.body.meta.total, 2);
    assert.equal(historyList.body.data[0].id, valuation2.id);
    assert.equal((await expect(200, 'GET', ppath, undefined, a)).marketValue, '100');
    const vpath = `/market-value-history/${valuation.id}`;
    await expect(403, 'PATCH', vpath, { marketValue: '21000000' }, a);
    await expect(403, 'DELETE', vpath, undefined, a);
    await expect(400, 'PATCH', vpath, { playerId: secondaryPlayer.id }, admin);
    await expect(200, 'PATCH', vpath, { marketValue: '21000000' }, admin);
    await expect(200, 'GET', vpath, undefined, b);
    await expect(409, 'DELETE', ppath, undefined, admin);
    console.log('PASS: Valuation CRUD, RBAC, pagination, source/date checks and independence from current market value.');

    const requirements = [];
    for (const user of users.slice(1)) requirements.push(await prisma.clubRequirement.create({ data: {
      clubId: club.id, userId: user.id, minAge: 18, maxAge: 30, budget: 60000000, salaryLimit: 10000000, position: 'CM', priority: 1,
    }}));
    const requirementPath = `/club-requirements/${requirements[0].id}`;
    for (const [source, target] of [['RWB','RB'],['LWB','LB'],['RCM','CM'],['LCM','CM'],['CF','ST'],['SS','ST'],['GK','GK']]) {
      assert.equal((await expect(200, 'PATCH', requirementPath, { position: source }, a)).position, target);
    }
    await expect(400, 'PATCH', requirementPath, { position: 'FWD' }, a);
    await expect(404, 'PATCH', requirementPath, { position: 'GK' }, b);
    await expect(200, 'PATCH', requirementPath, { position: 'CM' }, a);
    const estimate = { playerId: player.id, requirementId: requirements[0].id, estimatedFee: '0', feeSource: 'Test free-transfer estimate' };
    await expect(400, 'POST', '/matching-inputs', { ...estimate, userId: users[2].id }, a);
    await expect(404, 'POST', '/matching-inputs', { ...estimate, requirementId: requirements[1].id }, a);
    await expect(404, 'POST', '/matching-inputs', { ...estimate, requirementId: 2147483647 }, a);
    await expect(400, 'POST', '/matching-inputs', { playerId: player.id, requirementId: requirements[0].id }, a);
    for (const patch of [{ estimatedFee: '-1' }, { feeSource: null }, { feeSource: ' ' }, { expectedSalaryPerYear: '100' }, { createdAt: '2025-01-01' }]) {
      await expect(400, 'POST', '/matching-inputs', { ...estimate, ...patch }, a);
    }
    const e = await expect(201, 'POST', '/matching-inputs', estimate, a);
    assert.equal(e.userId, users[1].id); assert.equal(e.estimatedFee, '0'); assert.equal(e.expectedSalaryPerYear, null);
    const epath = `/matching-inputs/${e.id}`;
    await expect(409, 'POST', '/matching-inputs', estimate, a);
    for (const method of ['GET', 'PATCH', 'DELETE']) await expect(404, method, epath, method === 'PATCH' ? { estimatedFee: '10' } : undefined, b);
    const outsiderList = await call('GET', `/matching-inputs?requirementId=${requirements[0].id}`, undefined, b);
    assert.equal(outsiderList.body.meta.total, 0);
    await expect(400, 'PATCH', epath, { estimatedFee: null }, a);
    await expect(400, 'PATCH', epath, { playerId: secondaryPlayer.id }, a);
    await expect(200, 'PATCH', epath, { expectedSalaryPerYear: '11000000', salarySource: 'Test salary request' }, a);
    await expect(200, 'PATCH', epath, { estimatedFee: null, feeSource: null }, a);
    await expect(400, 'PATCH', epath, { expectedSalaryPerYear: null, salarySource: null }, a);
    await expect(200, 'PATCH', epath, { estimatedFee: '70000000', feeSource: 'Negotiable test quote' }, admin);
    const ownedByB = await expect(201, 'POST', '/matching-inputs', { ...estimate, requirementId: requirements[1].id }, admin);
    assert.equal(ownedByB.userId, users[2].id);
    await expect(200, 'GET', `/matching-inputs/${ownedByB.id}`, undefined, b);
    await expect(404, 'GET', `/matching-inputs/${ownedByB.id}`, undefined, a);
    await expect(204, 'DELETE', epath, undefined, a);
    await expect(404, 'GET', epath, undefined, a);
    console.log('PASS: Matching estimates retain explicit zero/unknown, accept above-budget quotes, isolate ownership and forbid owner/candidate reassignment.');

    const verifyPath = `/player-data-verifications/${player.id}`;
    const verification = {
      injuryHistory: { coveredFrom: '2023-01-01', coveredThrough: '2025-01-01', source: 'Test injury review' },
      registration: { status: 'CONTRACTED', asOf: '2025-01-01', source: 'Test registration evidence' },
    };
    await expect(404, 'GET', verifyPath, undefined, a);
    await expect(403, 'PATCH', verifyPath, verification, a);
    await expect(403, 'DELETE', verifyPath, undefined, a);
    for (const invalid of [
      {}, { injuryHistory: {} }, { injuryHistory: { ...verification.injuryHistory, coveredFrom: '2026-01-01' } },
      { injuryHistory: { ...verification.injuryHistory, coveredThrough: '2099-01-01' } },
      { injuryHistory: { ...verification.injuryHistory, coveredFrom: '1999-01-01' } },
      { registration: { ...verification.registration, status: 'UNKNOWN' } },
      { registration: { ...verification.registration, asOf: '2099-01-01' } },
      { registration: { ...verification.registration, verifiedById: users[1].id } },
      { injuryVerifiedById: users[1].id },
    ]) await expect(400, 'PATCH', verifyPath, invalid, admin);
    const verified = await expect(200, 'PATCH', verifyPath, verification, admin);
    assert.equal(verified.injuryVerifiedById, users[0].id);
    assert.equal(verified.registrationVerifiedById, users[0].id);
    assert(verified.injuryVerifiedAt);
    const changed = await expect(200, 'PATCH', verifyPath, { injuryHistory: null }, admin);
    assert.equal(changed.injuryCoveredFrom, null);
    assert.equal(changed.registrationStatus, 'CONTRACTED');
    await expect(200, 'PATCH', verifyPath, { registration: null }, admin);
    assert.equal((await expect(200, 'GET', verifyPath, undefined, a)).registrationStatus, 'UNKNOWN');
    await prisma.contract.create({ data: {
      playerId: player.id, clubId: club.id, startDate: new Date('2020-01-01'), endDate: new Date('2030-01-01'), salaryPerYear: 1, status: 'ACTIVE',
    }});
    await expect(409, 'PATCH', verifyPath, { registration: { ...verification.registration, status: 'FREE_AGENT' } }, admin);
    assert.equal((await expect(200, 'GET', verifyPath, undefined, a)).registrationStatus, 'UNKNOWN');
    await expect(404, 'PATCH', '/player-data-verifications/2147483647', { registration: null }, admin);
    await expect(204, 'DELETE', verifyPath, undefined, admin);
    await expect(404, 'GET', verifyPath, undefined, a);
    console.log('PASS: Verification upsert/section reset, server-owned identity/timestamps, dates, RBAC and active-contract conflict.');

    const audit = await call('GET', `/audit-logs?entityType=PlayerMarketValueHistory&entityId=${valuation.id}`, undefined, admin);
    assert.equal(audit.body.meta.total, 2);
    assert.equal(audit.body.data[0].oldValue.marketValue, '20000000');
    assert.equal(audit.body.data[0].newValue.marketValue, '21000000');
    const inputLogs = await call('GET', `/audit-logs?entityType=MatchingInput&entityId=${e.id}`, undefined, admin);
    assert(inputLogs.body.data.some(log => log.action === 'DELETE'));
    await expect(204, 'DELETE', vpath, undefined, admin);
    await expect(404, 'GET', vpath, undefined, a);
    const loginPage = await (await fetch(`${base}/login`)).text();
    const loginScript = await (await fetch(`${base}/login-assets/login.js`)).text();
    for (const route of ['market-value-history', 'matching-inputs', 'player-data-verifications']) {
      assert(loginPage.includes(`/api/${route}`)); assert(loginScript.includes(`/api/${route}`));
    }
    console.log('PASS: Audit snapshots and all new GET routes available in the existing login-page tester.');
  } finally {
    const ids = users.map(user => user.id);
    if (ids.length) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
      await prisma.matchingInput.deleteMany({ where: { userId: { in: ids } } });
    }
    if (players.length) {
      await prisma.playerDataVerification.deleteMany({ where: { playerId: { in: players } } });
      await prisma.playerMarketValueHistory.deleteMany({ where: { playerId: { in: players } } });
      await prisma.contract.deleteMany({ where: { playerId: { in: players } } });
      await prisma.player.deleteMany({ where: { id: { in: players } } });
    }
    if (ids.length) {
      await prisma.clubRequirement.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (club) await prisma.club.delete({ where: { id: club.id } });
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
