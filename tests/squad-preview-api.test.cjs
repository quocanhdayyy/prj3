const assert = require('node:assert/strict');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');

(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let user; const players = []; const tag = Date.now();
  const call = async (path, body, token) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  try {
    const savedBefore = await prisma.matchResult.count(), configsBefore = await prisma.scoringConfig.findMany({ orderBy: { id: 'asc' } });
    assert.equal((await call('/api/matching/squad/preview', {})).status, 401);
    user = await createUser({ username: 'squad_' + tag, email: `squad_${tag}@example.com`, password: 'SquadPreviewTest123' });
    const login = await call('/api/auth/login', { email: user.email, password: 'SquadPreviewTest123' });
    assert.equal(login.status, 200); const token = login.body.data.accessToken;
    for (const position of ['ST', 'CM', 'GK', 'ST']) {
      const p = await prisma.player.create({ data: { name: `Squad preview ${tag} ${players.length}`, dateOfBirth: new Date('2000-01-01'), nationality: 'Vietnam', position } });
      players.push(p);
      await prisma.playerStats.create({ data: { playerId: p.id, season: '2025/2026', appearances: 25, minutesPlayed: players.length === 4 ? 0 : 2250, goals: 15, assists: 5, yellowCards: 0, redCards: 0, keyPasses: players.length === 2 ? null : 25 } });
    }
    const input = { playerId: players[0].id, season: '2025/2026' };
    const response = await call('/api/matching/squad/preview', input, token);
    assert.equal(response.status, 200); assert.equal(response.cache, 'no-store');
    const d = response.body.data;
    assert.equal(d.player.name, players[0].name); assert.equal(d.formRole, 'ST');
    assert.equal(d.form.per90.goals, 0.6); assert.equal(d.form.minutesScore, 100);
    assert.equal(d.formScore, 84); assert.equal(d.scores.position, 100);
    assert.equal(d.squadScore, null); assert.equal(d.weights, null); assert(d.missing.includes('squad.weights')); assert.equal(d.saved, false);
    const weighted = await call('/api/matching/squad/preview', { ...input, weights: { position: 20, age: 20, form: 60 } }, token);
    assert.equal(weighted.status, 200); assert.equal(weighted.body.data.squadScore, 90.4); assert.equal(weighted.body.data.complete, true);
    const alternate = await call('/api/matching/squad/preview', { ...input, requiredPosition: 'CM', weights: { position: 20, age: 20, form: 60 } }, token);
    assert.equal(alternate.body.data.squadScore, null); assert.equal(alternate.body.data.formRole, 'ST');
    assert.equal(alternate.body.data.positionBasis, 'POSITION_GROUP_NOT_CONFIGURED');
    for (const [index, reason] of [[1, 'MISSING_REQUIRED_STATS'], [2, 'UNSUPPORTED_ROLE'], [3, 'NO_PLAYING_MINUTES']]) {
      const r = await call('/api/matching/squad/preview', { ...input, playerId: players[index].id }, token);
      assert.equal(r.status, 200); assert.equal(r.body.data.formScore, null); assert.equal(r.body.data.form.reason, reason);
    }
    for (const patch of [{ weights: { position: 20, age: 20, form: 50 } }, { weights: { position: 20, age: 80 } },
      { weights: { position: -10, age: 10, form: 100 } }, { weights: { position: '20', age: 20, form: 60 } },
      { playerId: 0 }, { requiredPosition: 'INVALID' }, { save: true }]) {
      assert.equal((await call('/api/matching/squad/preview', { ...input, ...patch }, token)).status, 400);
    }
    assert.equal((await call('/api/matching/squad/preview', { ...input, playerId: 2147483647 }, token)).status, 404);
    assert.equal((await call('/api/matching/squad/preview', { ...input, season: '2026/2027' }, token)).status, 409);
    const haaland = await prisma.player.findUnique({ where: { transfermarktId: 418560 } });
    if (haaland) {
      const r = await call('/api/matching/squad/preview', { ...input, playerId: haaland.id }, token);
      assert.equal(r.status, 200); assert.equal(r.body.data.player.name, haaland.name); assert.notEqual(r.body.data.formScore, null);
      console.log(`Haaland: form ${r.body.data.formScore}/100; ${r.body.data.form.minutesPlayed} minutes.`);
    }
    assert.equal(await prisma.matchResult.count(), savedBefore);
    assert.deepEqual(await prisma.scoringConfig.findMany({ orderBy: { id: 'asc' } }), configsBefore);
    console.log('PASS: authenticated S preview, exact role/per90 score, optional test weights, NULL/GK/zero minutes, validation, no saved results/config changes.');
  } finally {
    await prisma.playerStats.deleteMany({ where: { playerId: { in: players.map(p => p.id) } } });
    await prisma.player.deleteMany({ where: { id: { in: players.map(p => p.id) } } });
    if (user) {
      await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await new Promise(resolve => server.close(resolve)); await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
