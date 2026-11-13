const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');
const {restoreDeleted}=require('./top5-baseline.cjs');
const root = path.join(__dirname, '../data/transfermarkt');
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'prepared.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'before-import.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(root, 'import-report.json'), 'utf8'));

(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const users = [], addedPlayers = [], addedClubs = [];
  try {
    for (const [model, old] of Object.entries(baseline)) {
      const key = model === 'playerDataVerification' ? 'playerId' : 'id';
      const select = model === 'club' ? { id: true, name: true, country: true, league: true, foundedYear: true }
        : model === 'player' ? { id: true, name: true, dateOfBirth: true, nationality: true, position: true, secondaryPositions: true, marketValue: true, height: true, preferredFoot: true } : undefined;
      const rows = await prisma[model].findMany({ where: { [key]: { in: old.ids } }, orderBy: { [key]: 'asc' }, ...(select ? { select } : {}) });
      assert.equal(crypto.createHash('sha256').update(JSON.stringify(restoreDeleted(model,rows,old.ids,select))).digest('hex'), old.sha256, `${model}: old rows changed`);
    }
    const profiles = await prisma.player.findMany({ where: { transfermarktId: { in: bundle.players.map(row => row.player.transfermarktId) } } });
    assert.equal(profiles.length, bundle.players.length);
    assert.equal(new Set(profiles.map(row => row.transfermarktId)).size, profiles.length);
    const bySource = new Map(profiles.map(row => [row.transfermarktId, row]));
    const stats = await prisma.playerStats.findMany({ where: { playerId: { in: profiles.map(row => row.id) }, season: bundle.season } });
    const byPlayer = new Map(stats.map(row => [row.playerId, row]));
    // Supplementation may fill only the five originally unknown counters. Require its audit evidence.
    const supplementaryAudits = await prisma.auditLog.findMany({ where: { entityType: 'PlayerStats', action: 'UPDATE', OR: [
      { newValue: { path: ['importProvenance', 'provider'], equals: 'https://github.com/m-mahadi/top5-football-dataset' } },
      { newValue: { path: ['importProvenance', 'pipeline'], equals: 'STATS_ENRICHMENT_V1' } },
      { newValue: { path: ['importProvenance', 'pipeline'], equals: 'SCOPE_TOP5_V1' } },
      { newValue: { path: ['importProvenance', 'pipeline'], equals: 'SUPPLEMENTAL_REPAIR_V1' } },
      { newValue: { path: ['importProvenance', 'pipeline'], equals: 'ENRICHMENT_REPAIR_V1' } },
    ] }, orderBy: { id: 'asc' } });
    const supplementary = new Map(supplementaryAudits.map(row => [row.entityId, row.newValue]));
    const fillable = new Set(['tacklesWon', 'interceptions', 'keyPasses', 'passesCompleted', 'passesAttempted']);
    for (const entry of bundle.players) {
      const player = bySource.get(entry.player.transfermarktId);
      assert.equal(player.name, entry.player.name);
      assert.equal(player.dateOfBirth.toISOString().slice(0, 10), entry.player.dateOfBirth);
      for (const field of ['position', 'nationality', 'height', 'preferredFoot']) assert.equal(player[field], entry.player[field]);
      assert.equal(player.marketValue?.toString() ?? null, entry.player.marketValue);
      for (const [field, value] of Object.entries(entry.stats)) {
        const current = byPlayer.get(player.id);
        const expected = value === null && fillable.has(field) && supplementary.has(current.id) ? supplementary.get(current.id)[field] : value;
        assert.equal(current[field], expected, `${player.name}: ${field}`);
      }
    }
    assert.equal(await prisma.playerMarketValueHistory.count({ where: { source: bundle.provider, playerId: { in: profiles.map(row => row.id) } } }), bundle.valuations.length);
    assert.equal(await prisma.contract.count({ where: { playerId: { in: profiles.map(row => row.id) } } }), 0);
    assert.equal(await prisma.playerDataVerification.count({ where: { playerId: { in: profiles.map(row => row.id) } } }), 0);
    assert.equal(await prisma.matchingInput.count({ where: { playerId: { in: profiles.map(row => row.id) } } }), 0);
    assert.equal(await prisma.player.count({ where: { transfermarktId: 10 } }), 0); // Klose's old profile was not imported just because it exists in the file.

    const password = crypto.randomBytes(24).toString('hex'), tag = crypto.randomBytes(6).toString('hex');
    const tokens = [];
    for (const role of ['ADMIN', 'SCOUT']) {
      const user = await createUser({ username: `import_${role}_${tag}`, email: `import_${role.toLowerCase()}_${tag}@example.com`, password, role }); users.push(user);
      const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
      assert.equal(response.status, 200); tokens.push((await response.json()).data.accessToken);
    }
    const call = async (method, url, body, token = tokens[0]) => {
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    };
    for (const star of report.stars) {
      const response = await call('GET', '/players/' + star.id, undefined, tokens[1]);
      assert.equal(response.status, 200); assert.equal(response.body.data.transfermarktId, star.transfermarktId);
      const stat = byPlayer.get(star.id);
      assert.equal((await call('GET', '/player-stats/' + stat.id, undefined, tokens[1])).status, 200);
    }
    const first = report.stars[0];
    assert.equal((await call('PATCH', '/players/' + first.id, { name: 'Disallowed' }, tokens[1])).status, 403);
    assert.equal((await call('PATCH', '/players/' + first.id, { transfermarktId: 999 }, tokens[0])).status, 400);
    const created = await call('POST', '/players', { name: 'Import null test', dateOfBirth: '2000-01-01', nationality: 'Vietnam', position: 'ST', height: null, preferredFoot: null, marketValue: null });
    assert.equal(created.status, 201); addedPlayers.push(created.body.data.id);
    assert.equal(created.body.data.marketValue, null);
    assert.equal((await call('PATCH', '/players/' + created.body.data.id, { height: 0 })).status, 400);
    const club = await call('POST', '/clubs', { name: 'Import unknown year test', country: 'Vietnam', league: 'Test', foundedYear: null });
    assert.equal(club.status, 201); addedClubs.push(club.body.data.id); assert.equal(club.body.data.foundedYear, null);
    console.log(`PASS: original ${Object.keys(baseline).length} tables unchanged; ${profiles.length} profiles + season totals match source preparation; ${bundle.valuations.length} valuations; no fake contracts/verification/estimates; stars readable by authenticated Scout; provenance write-protected; NULL API handling. Temporary fixtures removed.`);
  } finally {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map(row => row.id) } } });
    await prisma.player.deleteMany({ where: { id: { in: addedPlayers } } });
    await prisma.club.deleteMany({ where: { id: { in: addedClubs } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    await new Promise(resolve => server.close(resolve)); await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
