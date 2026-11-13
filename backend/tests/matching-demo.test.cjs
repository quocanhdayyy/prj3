// Read the persistent demo through real authenticated HTTP and submit the existing test form.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomBytes } = require('node:crypto');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');
const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/testing/matching-demo-data.json'), 'utf8'));

(async () => {
  if (demo.removed) { console.log('SKIP: persistent demo was explicitly removed; run seed:matching only if you want to recreate it.'); await prisma.$disconnect(); return; }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let user;
  try {
    const password = randomBytes(24).toString('hex');
    const tag = randomBytes(8).toString('hex');
    user = await createUser({ username: `demo_verify_${tag}`, email: `demo_verify_${tag}@example.com`, password, role: 'ADMIN' });
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    assert.equal(login.status, 200);
    const session = (await login.json()).data;
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const get = async url => {
      const response = await fetch(base + url, { headers });
      assert.equal(response.status, 200, url);
      return response.json();
    };
    const ids = demo.ids;
    const paths = [
      `/api/users/${ids.ownerId}`, `/api/players/${ids.playerId}`,
      ...[ids.formerClubId, ids.currentClubId, ids.buyerClubId].map(id => `/api/clubs/${id}`),
      ...ids.contractIds.map(id => `/api/contracts/${id}`),
      `/api/player-stats/${ids.statsId}`, `/api/injury-history/${ids.injuryId}`,
      `/api/club-requirements/${ids.requirementId}`, `/api/matching-inputs/${ids.matchingInputId}`,
      `/api/player-data-verifications/${ids.playerId}`, `/api/market-value-history?playerId=${ids.playerId}`,
      `/api/shortlist-lists/${ids.shortlistId}`, `/api/shortlist-items/${ids.shortlistItemId}`,
      `/api/transfers/${ids.transferId}`, `/api/notifications/${ids.notificationId}`,
      `/api/scoring-configs/${ids.configId}`, `/api/match-results/${demo.resultId}`,
      `/api/audit-logs?entityType=Player&entityId=${ids.playerId}`,
    ];
    for (const url of paths) await get(url);
    const config = (await get(`/api/scoring-configs/${ids.configId}`)).data;
    assert.equal(config.isActive, false);
    const stats = (await get(`/api/player-stats/${ids.statsId}`)).data;
    for (const field of ['appearances', 'minutesPlayed', 'goals', 'assists', 'yellowCards', 'redCards', 'tacklesWon', 'interceptions', 'keyPasses', 'passesCompleted', 'passesAttempted']) assert.equal(typeof stats[field], 'number', field);
    const html = await (await fetch(base + '/login')).text();
    for (const id of ['matching-player-id', 'matching-requirement-id', 'matching-config-id', 'matching-season', 'matching-form-role']) assert(html.includes(`id="${id}"`));

    // Exercise login.js against the API; no browser rendering or stored user credentials needed.
    const nodes = new Map();
    const node = id => {
      if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, hidden: true, events: {}, textContent: '', className: '',
        addEventListener(event, listener) { this.events[event] = listener; }, setAttribute() {} });
      return nodes.get(id);
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/login.js'), 'utf8'), {
      document: { getElementById: node }, sessionStorage: { getItem: () => JSON.stringify({ accessToken: session.accessToken, expiresAt: session.expiresAt }), setItem() {}, removeItem() {} },
      fetch: (url, options) => fetch(base + url, options), Date, JSON, Error, Set,
    });
    for (let i = 0; i < 200 && node('account-panel').hidden; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(node('account-panel').hidden, false);
    for (const [id, value] of Object.entries({ 'matching-player-id': ids.playerId, 'matching-requirement-id': ids.requirementId,
      'matching-config-id': ids.configId, 'matching-season': demo.request.season, 'matching-form-role': demo.request.formRole,
      'matching-valuation-source': demo.request.valuationSource })) node(id).value = String(value);
    const before = await prisma.matchResult.count({ where: { configId: ids.configId } });
    await node('matching-form').events.submit({ preventDefault() {} });
    const result = JSON.parse(node('matching-result').textContent).data;
    assert.equal(result.complete, true); assert.deepEqual(result.missing, []);
    assert.equal(result.saved, false);
    assert.equal(result.financialScore, demo.scores.F); assert.equal(result.squadScore, demo.scores.S);
    assert.equal(result.riskScore, demo.scores.R); assert.equal(result.totalScore, demo.scores.total);
    assert.equal(result.criteria.squad.form.per90.goals, 0.6);
    assert.equal(result.criteria.squad.form.per90.assists, 0.2);
    assert.equal(result.criteria.squad.form.per90.keyPasses, 1);
    assert.equal(result.criteria.squad.scores.form, 84);
    assert.equal(result.criteria.risk.injury.observedDays, 20);
    assert.equal(result.criteria.risk.resale.changePercent, 25);
    assert.equal(result.criteria.risk.scores.resale, 92);
    assert.equal(await prisma.matchResult.count({ where: { configId: ids.configId } }), before);
    assert(!node('matching-result').textContent.includes(session.accessToken));
    console.log(`PASS: ${paths.length} authenticated demo reads, every stored stat, inactive demo config, existing login form -> complete F/S/R ${result.totalScore}; no new history on preview. Temporary verification account removed.`);
  } finally {
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
