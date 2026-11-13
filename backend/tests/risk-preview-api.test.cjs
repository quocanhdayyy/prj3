const assert = require('node:assert/strict');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');
const { shiftCalendarMonths } = require('../src/services/matching/matching-scoring.service.ts');

(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/matching/risk`;
  let user, player; const tag = Date.now();
  const call = async (operation, body, token) => {
    const r = await fetch(base + '/' + operation, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json(), cache: r.headers.get('cache-control') };
  };
  try {
    const configsBefore = await prisma.scoringConfig.findMany({ orderBy: { id: 'asc' } }), resultsBefore = await prisma.matchResult.count();
    for (const op of ['evaluate', 'preview']) assert.equal((await call(op, {})).status, 401);
    user = await createUser({ username: 'risk_' + tag, email: `risk_${tag}@example.com`, password: 'RiskPreviewTest123' });
    const login = await fetch(base.replace('/matching/risk', '/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'RiskPreviewTest123' }) });
    assert.equal(login.status, 200); const token = (await login.json()).data.accessToken;
    const sample = { age: 23, daysMissed: 45, ongoing: false, currentValue: '24000000', priorValue: '20000000', weights: { injury: 50, resale: 50 } };
    const r = await call('preview', sample, token); assert.equal(r.status, 200); assert.equal(r.cache, 'no-store');
    assert.equal(r.data.data.mode, 'SIMULATION'); assert.equal(r.data.data.player, null); assert.equal(r.data.data.riskScore, 85);
    assert.deepEqual(r.data.data.scores, { injury: 80, resale: 90 }); assert.equal(r.data.data.resale.changePercent, 20); assert.equal(r.data.data.saved, false);
    assert.equal((await call('preview', { ...sample, ongoing: true }, token)).data.data.riskScore, 70);
    for (const [days, score] of [[0,100],[30,100],[31,80],[90,80],[91,60],[180,60],[181,40],[270,40],[271,20]]) {
      assert.equal((await call('preview', { ...sample, daysMissed: days }, token)).data.data.scores.injury, score);
    }
    for (const patch of [{ priorValue: '0' }, { priorValue: null }, { currentValue: null }, { age: null }]) {
      const d = (await call('preview', { ...sample, ...patch }, token)).data.data;
      assert.equal(d.riskScore, null); assert.equal(d.scores.resale, null);
    }
    assert.equal((await call('preview', { ...sample, currentValue: '0' }, token)).data.data.resale.trendScore, 0);
    const unknownInjury = (await call('preview', { ...sample, daysMissed: null }, token)).data.data;
    assert.equal(unknownInjury.scores.injury, null); assert.equal(unknownInjury.riskScore, null);
    const { weights, ...unweighted } = sample;
    assert.equal((await call('preview', unweighted, token)).data.data.riskScore, null);
    for (const patch of [{ age: 14 }, { daysMissed: 732 }, { daysMissed: -1 }, { daysMissed: 1.5 }, { ongoing: 'false' },
      { currentValue: '-1' }, { weights: { injury: 60, resale: 60 } }, { weights: { injury: 100 } }, { save: true }]) {
      assert.equal((await call('preview', { ...sample, ...patch }, token)).status, 400);
    }
    const day = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}T00:00:00Z`);
    player = await prisma.player.create({ data: { name: `Risk fixture ${tag}`, dateOfBirth: shiftCalendarMonths(day, -23*12), nationality: 'Vietnam', position: 'CM' } });
    await prisma.playerMarketValueHistory.createMany({ data: [
      { playerId: player.id, valuedAt: shiftCalendarMonths(day, -12), marketValue: 20000000, source: 'Risk fixture' },
      { playerId: player.id, valuedAt: day, marketValue: 24000000, source: 'Risk fixture' },
    ] });
    const stored = { playerId: player.id, weights: sample.weights };
    const missing = (await call('evaluate', stored, token)).data.data;
    assert.equal(missing.player.name, player.name); assert.equal(missing.scores.injury, null); assert.equal(missing.scores.resale, 90); assert.equal(missing.riskScore, null);
    await prisma.playerDataVerification.create({ data: { playerId: player.id, injuryCoveredFrom: shiftCalendarMonths(day, -24), injuryCoveredThrough: day, injuryVerifiedAt: new Date(), injuryVerifiedById: user.id, injurySource: 'Test complete coverage' } });
    const daysAgo = n => new Date(day.getTime() - n * 86400000);
    await prisma.injuryHistory.createMany({ data: [
      { playerId: player.id, injuryType: 'Fixture A', startDate: daysAgo(45), endDate: day },
      { playerId: player.id, injuryType: 'Fixture overlap', startDate: daysAgo(10), endDate: daysAgo(5) },
    ] });
    const full = (await call('evaluate', stored, token)).data.data;
    assert.equal(full.mode, 'DATABASE'); assert.equal(full.injury.daysMissed, 45); assert.equal(full.riskScore, 85); assert.equal(full.resale.source, 'Risk fixture');
    await prisma.playerMarketValueHistory.createMany({ data: [
      { playerId: player.id, valuedAt: shiftCalendarMonths(day, -12), marketValue: 20000000, source: 'Other fixture' },
      { playerId: player.id, valuedAt: day, marketValue: 24000000, source: 'Other fixture' },
    ] });
    assert.equal((await call('evaluate', stored, token)).data.data.resale.reason, 'AMBIGUOUS_VALUATION_SOURCES');
    assert.equal((await call('evaluate', { ...stored, valuationSource: 'Risk fixture' }, token)).data.data.riskScore, 85);
    for (const body of [{ playerId: 0 }, { playerId: player.id, daysMissed: 0 }, { playerId: player.id, save: true }, { playerId: player.id, weights: { injury: '50', resale: 50 } }]) assert.equal((await call('evaluate', body, token)).status, 400);
    assert.equal((await call('evaluate', { playerId: 2147483647 }, token)).status, 404);
    const haaland = await prisma.player.findUnique({ where: { transfermarktId: 418560 } });
    if (haaland) {
      const live = await call('evaluate', { playerId: haaland.id }, token); assert.equal(live.status, 200);
      assert.equal(live.data.data.player.name, haaland.name); assert.equal(live.data.data.saved, false);
      console.log(JSON.stringify({ name: live.data.data.player.name, scores: live.data.data.scores, currentDate: live.data.data.resale.currentDate, priorDate: live.data.data.resale.priorDate }));
    }
    assert.equal((await fetch(base + '/demo')).status, 401);
    const demoListResponse = await fetch(base + '/demo', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(demoListResponse.status, 200);
    const demos = (await demoListResponse.json()).data;
    assert.equal(demos.length, 10); assert.equal(new Set(demos.map(d => d.id)).size, 10);
    const injuriesBeforeDemo = await prisma.injuryHistory.findMany({ orderBy: { id: 'asc' } });
    const verificationBeforeDemo = await prisma.playerDataVerification.findMany({ orderBy: { playerId: 'asc' } });
    const demoResults = [];
    for (const demo of demos) {
      assert.equal(demo.simulated, true);
      if (!demo.available) continue;
      const result = await call('demo', { demoId: demo.id, weights: sample.weights }, token);
      assert.equal(result.status, 200); const d = result.data.data;
      assert.equal(d.mode, 'DEMO'); assert.equal(d.player.name, demo.name); assert.equal(d.player.id, demo.playerId);
      assert.equal(d.injury.daysMissed, demo.daysMissed); assert.equal(d.injury.ongoing, demo.ongoing);
      assert.equal(d.injury.simulated, true); assert.equal(d.injury.coverageVerified, false); assert.equal(d.saved, false);
      assert(d.warnings.some(w => w.includes('DEMO')));
      const normal = (await call('evaluate', { playerId: demo.playerId, weights: sample.weights }, token)).data.data;
      assert.equal(normal.mode, 'DATABASE'); assert.equal(normal.demo, null); assert.equal(normal.scores.resale, d.scores.resale);
      demoResults.push({ name: d.player.name, injuryDemo: d.scores.injury, resale: d.scores.resale, riskDemo: d.riskScore });
    }
    assert.equal((await call('demo', { demoId: 'unknown' }, token)).status, 404);
    assert.equal((await call('demo', { demoId: 'haaland', daysMissed: 0 }, token)).status, 400);
    assert.equal((await call('evaluate', { playerId: player.id, demoId: 'haaland' }, token)).status, 400);
    assert.deepEqual(await prisma.injuryHistory.findMany({ orderBy: { id: 'asc' } }), injuriesBeforeDemo);
    assert.deepEqual(await prisma.playerDataVerification.findMany({ orderBy: { playerId: 'asc' } }), verificationBeforeDemo);
    console.log(JSON.stringify({ demoPlayersTested: demoResults.length, demoResults }));
    assert.deepEqual(await prisma.scoringConfig.findMany({ orderBy: { id: 'asc' } }), configsBefore); assert.equal(await prisma.matchResult.count(), resultsBefore);
    console.log('PASS: R preview/auth, shared engine formulas, injury thresholds/overlap, same-source valuation, missing/zero, trial weights and no saved config/results.');
  } finally {
    if (player) {
      await prisma.injuryHistory.deleteMany({ where: { playerId: player.id } });
      await prisma.playerMarketValueHistory.deleteMany({ where: { playerId: player.id } });
      await prisma.playerDataVerification.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
    if (user) { await prisma.auditLog.deleteMany({ where: { actorId: user.id } }); await prisma.user.delete({ where: { id: user.id } }); }
    await new Promise(resolve => server.close(resolve)); await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
