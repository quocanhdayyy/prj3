const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const source = fs.readFileSync(path.join(__dirname, '../public/login.js'), 'utf8');
  const users = [];
  const storage = new Map();
  let requestCount = 0;
  const mount = () => {
    const nodes = new Map();
    const element = () => ({ children: [], value: '', textContent: '', append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } });
    const node = id => {
      if (!nodes.has(id)) nodes.set(id, {
        ...element(),
        value: id === 'api-endpoint' ? '/api/transfers' : '',
        type: id === 'password' ? 'password' : '', hidden: id === 'account-panel' || id === 'api-result',
        disabled: false, textContent: '', className: '', events: {},
        addEventListener(name, listener) { this.events[name] = listener; },
        setAttribute() {},
      });
      return nodes.get(id);
    };
    vm.runInNewContext(source, {
      document: { getElementById: node, createElement: element },
      sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
      fetch: (url, options) => { requestCount++; return fetch(base + url, options); },
      Date, JSON, Error, Set,
    });
    return node;
  };
  const login = async (node, user) => {
    node('email').value = user.email; node('password').value = 'PageTestPass123';
    await node('login-form').events.submit({ preventDefault() {} });
    assert.equal(node('account-panel').hidden, false);
  };
  try {
    const html = await fetch(base + '/login');
    assert.equal(html.status, 200); assert((await html.text()).includes('id="api-test-button"'));
    for (const asset of ['login.css', 'login.js']) assert.equal((await fetch(base + '/login-assets/' + asset)).status, 200);
    const tag = Date.now();
    for (const role of ['ADMIN', 'SCOUT']) users.push(await createUser({ username: `page_${role}_${tag}`, email: `page_${role.toLowerCase()}_${tag}@example.com`, password: 'PageTestPass123', role }));
    let node = mount();
    await login(node, users[0]);
    await node('api-test-button').events.click();
    assert(node('api-status').textContent.includes('HTTP 200'));
    assert.equal(JSON.parse(node('api-result').textContent).status, 'success');
    const saved = JSON.parse([...storage.values()][0]);
    assert(!node('api-result').textContent.includes(saved.accessToken));
    const beforeInvalidMatching = requestCount;
    await node('matching-form').events.submit({ preventDefault() {} });
    assert.equal(requestCount, beforeInvalidMatching);
    for (const [id, value] of Object.entries({ 'matching-player-id': '2147483647', 'matching-requirement-id': '2147483647', 'matching-season': '2025/2026', 'matching-form-role': 'PRIMARY' })) node(id).value = value;
    await node('matching-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('matching-result').textContent).status, 'error');
    assert(!node('matching-result').textContent.includes(saved.accessToken));
    assert.equal(node('account-panel').hidden, false);
    const fillFinancial = () => {
      for (const [id, value] of Object.entries({ 'financial-budget': '200000000', 'financial-fee': '180000000', 'financial-salary-limit': '30000000', 'financial-salary': '27000000', 'financial-months': '48' })) node(id).value = value;
    };
    fillFinancial();
    await node('financial-form').events.submit({ preventDefault() {} });
    assert(node('financial-status').textContent.includes('79/100'));
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, 79);
    assert(!node('financial-result').textContent.includes(saved.accessToken));
    node('financial-fee').value = '220000000';
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, 68.2);
    node('financial-fee').value = '';
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, null);
    assert(node('financial-status').textContent.includes('Chưa đủ dữ liệu'));
    const beforeInvalidFinancialId = requestCount;
    node('financial-player-id').value = 'abc'; node('financial-requirement-id').value = '1';
    await node('financial-evaluate-button').events.click();
    assert.equal(requestCount, beforeInvalidFinancialId);
    node('financial-player-id').value = '2147483647'; node('financial-requirement-id').value = '2147483647';
    await node('financial-evaluate-button').events.click();
    assert.equal(JSON.parse(node('financial-result').textContent).status, 'error');
    assert.equal(node('account-panel').hidden, false);
    node('api-endpoint').value = '/api/players'; node('api-record-id').value = '2147483647';
    await node('api-test-button').events.click(); assert(node('api-status').textContent.includes('HTTP 404'));
    const before = requestCount;
    node('api-record-id').value = 'abc'; await node('api-test-button').events.click(); assert.equal(requestCount, before);
    node('api-record-id').value = ''; node('api-endpoint').value = '/api/auth/login';
    await node('api-test-button').events.click(); assert.equal(requestCount, before);
    node = mount();
    for (let i = 0; i < 200 && (node('account-panel').hidden || node('login-button').disabled); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(node('account-panel').hidden, false); // Restores the existing tab session, no new login.
    await node('logout-button').events.click();
    assert.equal(node('api-result').hidden, true); assert.equal(storage.size, 0);
    assert.equal(node('financial-result').hidden, true); assert.equal(node('financial-result').textContent, '');
    assert.equal(node('matching-result').hidden, true); assert.equal(node('matching-result').textContent, '');
    await login(node, users[1]);
    node('api-endpoint').value = '/api/audit-logs';
    await node('api-test-button').events.click(); assert(node('api-status').textContent.includes('HTTP 403'));
    assert.equal(node('account-panel').hidden, false);
    await prisma.authSession.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
    node('api-endpoint').value = '/api/transfers';
    await node('api-test-button').events.click();
    assert.equal(node('account-panel').hidden, true); assert.equal(storage.size, 0); assert.equal(node('api-result').textContent, '');
    await login(node, users[1]); fillFinancial();
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(JSON.parse(node('financial-result').textContent).data.financialScore, 79);
    await prisma.authSession.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
    await node('financial-form').events.submit({ preventDefault() {} });
    assert.equal(node('account-panel').hidden, true); assert.equal(storage.size, 0);
    assert.equal(node('financial-result').textContent, '');
    await login(node, users[1]);
    for (const [id, value] of Object.entries({ 'matching-player-id': '2147483647', 'matching-requirement-id': '2147483647', 'matching-season': '2025/2026', 'matching-form-role': 'PRIMARY' })) node(id).value = value;
    await prisma.authSession.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
    await node('matching-form').events.submit({ preventDefault() {} });
    assert.equal(node('account-panel').hidden, true); assert.equal(storage.size, 0);
    assert.equal(node('matching-result').textContent, '');
    console.log('PASS: Existing-session GET/F/Matching testers: validation, sample F=79, changed inputs, missing data, invalid IDs, RBAC, reload, logout and expiry (DOM simulation + real API).');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
