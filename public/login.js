'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const storageKey = 'football-transfer-session';
  const financialFields = {
    budget: 'financial-budget', estimatedFee: 'financial-fee', salaryLimit: 'financial-salary-limit',
    expectedSalaryPerYear: 'financial-salary', remainingMonths: 'financial-months',
  };
  const matchingFields = ['matching-player-id', 'matching-requirement-id', 'matching-season', 'matching-form-role', 'matching-config-id', 'matching-valuation-source', 'matching-save', 'matching-evaluate-button'];
  const squadFields = ['squad-player-id', 'squad-season', 'squad-position', 'squad-weight-position', 'squad-weight-age', 'squad-weight-form', 'squad-evaluate-button'];
  const riskFields = ['risk-weight-injury', 'risk-weight-resale', 'risk-player-id', 'risk-source', 'risk-evaluate-button', 'risk-age', 'risk-days', 'risk-ongoing', 'risk-prior-value', 'risk-current-value', 'risk-simulate-button', 'risk-demo-player', 'risk-demo-button'];
  const strategyLabels = {
    MONEYBALL: { name: 'Tiết kiệm / Moneyball', description: 'Ưu tiên chi phí chuyển nhượng và mức lương phù hợp.' },
    BALANCED: { name: 'Cân bằng', description: 'Ưu tiên chuyên môn, kết hợp khả năng tài chính và tương lai.' },
    LONG_TERM: { name: 'Đầu tư dài hạn', description: 'Ưu tiên sức khỏe và khả năng bán lại trong tương lai.' },
    IMMEDIATE_ROLE: { name: 'Cần ngay vai trò', description: 'Ưu tiên đáp ứng ngay vai trò chuyên môn đội bóng cần.' },
  };
  let v3Strategies = null;
  let session = null;
  let busy = false;
  try { session = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { session = null; }
  if (!session || typeof session.accessToken !== 'string' || typeof session.expiresAt !== 'string') session = null;
  const saveSession = value => {
    session = value;
    try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* Keep the session in memory when storage is unavailable. */ }
  };
  const message = (text, error = false) => {
    byId('message').textContent = text;
    byId('message').className = 'message ' + (error ? 'error' : 'success');
  };
  const setBusy = value => {
    busy = value;
    for (const id of ['login-button', 'refresh-button', 'logout-button', 'api-test-button', 'api-endpoint', 'api-record-id',
      ...Object.values(financialFields), ...matchingFields, ...squadFields, ...riskFields, 'v3-reload-button', 'financial-player-id', 'financial-requirement-id', 'financial-preview-button', 'financial-evaluate-button']) byId(id).disabled = value;
    byId('v3-strategy').disabled = value || !v3Strategies;
    byId('login-button').textContent = value ? 'Đang xử lý…' : 'Đăng nhập →';
  };
  const showLogin = () => {
    saveSession(null);
    clearV3Strategies();
    byId('login-panel').hidden = false;
    byId('account-panel').hidden = true;
    byId('password').value = '';
    byId('api-result').textContent = '';
    byId('api-result').hidden = true;
    byId('api-status').textContent = '';
    byId('api-record-id').value = '';
    byId('financial-result').textContent = '';
    byId('financial-result').hidden = true;
    byId('financial-status').textContent = '';
    byId('financial-player-id').value = '';
    byId('financial-requirement-id').value = '';
    byId('matching-result').textContent = ''; byId('matching-result').hidden = true;
    byId('matching-status').textContent = '';
    for (const id of matchingFields) if (id !== 'matching-evaluate-button' && id !== 'matching-save') byId(id).value = '';
    byId('matching-save').checked = false;
    byId('squad-result').textContent = ''; byId('squad-result').hidden = true;
    byId('squad-status').textContent = ''; byId('squad-breakdown').replaceChildren(); byId('squad-breakdown').hidden = true;
    byId('squad-player-id').value = '1700'; byId('squad-position').value = '';
    for (const key of ['position', 'age', 'form']) byId('squad-weight-' + key).value = '';
    byId('risk-result').textContent = ''; byId('risk-result').hidden = true; byId('risk-status').textContent = '';
    byId('risk-breakdown').replaceChildren(); byId('risk-breakdown').hidden = true;
    byId('risk-demo-player').value = 'haaland';
    for (const [key, value] of Object.entries({ 'weight-injury': '', 'weight-resale': '', 'player-id': '1700', source: '', age: '23', days: '45', ongoing: 'false', 'prior-value': '20000000', 'current-value': '24000000' })) byId('risk-' + key).value = value;
    for (const [field, value] of Object.entries({ budget: '200000000', estimatedFee: '180000000', salaryLimit: '30000000', expectedSalaryPerYear: '27000000', remainingMonths: '48' })) {
      byId(financialFields[field]).value = value;
    }
  };
  const showAccount = user => {
    byId('login-panel').hidden = true;
    byId('account-panel').hidden = false;
    byId('account-name').textContent = user.username;
    byId('account-email').textContent = user.email;
    byId('account-role').textContent = user.role === 'ADMIN' ? 'Quản trị viên (Admin)' : 'Người dùng (Scout)';
    byId('account-expiry').textContent = new Date(session.expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    byId('password').value = '';
  };
  const clearV3Strategies = () => {
    v3Strategies = null;
    byId('v3-strategy').replaceChildren(); byId('v3-strategy').value = ''; byId('v3-strategy').disabled = true;
    byId('v3-weights').hidden = true; byId('v3-strategy-description').textContent = '';
    byId('v3-status').textContent = '';
    for (const key of ['financial', 'squad', 'risk']) byId('v3-weight-' + key).textContent = '';
  };
  const renderV3Strategy = () => {
    const key = byId('v3-strategy').value;
    const weights = v3Strategies && Object.hasOwn(v3Strategies, key) && Object.hasOwn(strategyLabels, key) ? v3Strategies[key] : null;
    byId('v3-weights').hidden = !weights;
    byId('v3-strategy-description').textContent = weights ? strategyLabels[key].description : '';
    for (const field of ['financial', 'squad', 'risk']) byId('v3-weight-' + field).textContent = weights ? (weights[field] * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%' : '';
    if (weights) {
      byId('v3-status').textContent = strategyLabels[key].name + ' · Tổng trọng số 100%. Chỉ xem cấu hình, chưa tính hoặc lưu điểm.';
      byId('v3-status').className = 'message success';
    }
  };
  const loadV3Strategies = async () => {
    const accessToken = session?.accessToken;
    if (!accessToken) return;
    const previous = byId('v3-strategy').value;
    clearV3Strategies(); byId('v3-status').textContent = 'Đang tải chiến lược V3…'; byId('v3-status').className = 'message';
    try {
      const response = await fetch('/api/matching/v3/template', { headers: { Authorization: 'Bearer ' + accessToken }, cache: 'no-store' });
      const payload = await response.json();
      if (session?.accessToken !== accessToken) return;
      if (response.status === 401) { showLogin(); message('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true); return; }
      if (!response.ok) throw new Error(payload.message || 'Không tải được cấu hình V3.');
      const strategies = payload.data?.strategies;
      if (!strategies || Object.keys(strategies).length !== Object.keys(strategyLabels).length || Object.keys(strategyLabels).some(key => {
        const w = strategies[key];
        return !w || ['financial', 'squad', 'risk'].some(field => typeof w[field] !== 'number' || !Number.isFinite(w[field]) || w[field] < 0 || w[field] > 1)
          || Math.abs(w.financial + w.squad + w.risk - 1) > 1e-8;
      })) throw new Error('Cấu hình chiến lược V3 chưa hợp lệ.');
      v3Strategies = strategies;
      for (const [key, label] of Object.entries(strategyLabels)) {
        const option = document.createElement('option'); option.value = key; option.textContent = label.name;
        byId('v3-strategy').append(option);
      }
      byId('v3-strategy').value = Object.hasOwn(strategies, previous) ? previous : 'BALANCED';
      renderV3Strategy();
    } catch (error) {
      byId('v3-status').textContent = error.message || 'Không tải được cấu hình V3. Bấm tải lại để thử lại.';
      byId('v3-status').className = 'message error';
    }
  };
  byId('v3-strategy').addEventListener('change', renderV3Strategy);
  byId('v3-reload-button').addEventListener('click', async () => {
    if (busy || !session) return;
    setBusy(true); try { await loadV3Strategies(); } finally { setBusy(false); }
  });
  const request = async (path, options = {}, authenticated = false) => {
    const response = await fetch('/api/auth' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(authenticated && session ? { Authorization: 'Bearer ' + session.accessToken } : {}) },
      cache: 'no-store',
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
      error.status = response.status;
      throw error;
    }
    return payload;
  };
  const checkSession = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const payload = await request('/me', {}, true);
      showAccount(payload.data);
      await loadV3Strategies();
      if (session) message('Phiên đăng nhập đang hoạt động.');
    } catch (error) {
      if (error.status === 401) showLogin();
      message(error.message || 'Không kết nối được backend.', true);
    } finally { setBusy(false); }
  };
  byId('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); message('');
    try {
      const payload = await request('/login', {
        method: 'POST',
        body: JSON.stringify({ email: byId('email').value.trim(), password: byId('password').value }),
      });
      saveSession({ accessToken: payload.data.accessToken, expiresAt: payload.data.expiresAt });
      showAccount(payload.data.user);
      await loadV3Strategies();
      if (session) message('Đăng nhập thành công.');
    } catch (error) { message(error.message || 'Không kết nối được backend.', true); }
    finally { setBusy(false); }
  });
  byId('logout-button').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try { await request('/logout', { method: 'POST' }, true); showLogin(); message('Bạn đã đăng xuất.'); }
    catch (error) {
      if (error.status === 401) showLogin();
      message(error.message || 'Không thể đăng xuất. Vui lòng thử lại.', true);
    } finally { setBusy(false); }
  });
  byId('refresh-button').addEventListener('click', checkSession);
  const runFinancial = async (operation, body) => {
    if (busy) return;
    if (!session) { showLogin(); message('Bạn cần đăng nhập để thử điểm F.', true); return; }
    setBusy(true);
    byId('financial-result').hidden = true;
    byId('financial-result').textContent = '';
    byId('financial-status').className = 'message';
    byId('financial-status').textContent = 'Đang tính điểm tài chính…';
    try {
      const response = await fetch('/api/matching/financial/' + operation, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken },
        body: JSON.stringify(body), cache: 'no-store',
      });
      const payload = await response.json();
      if (response.status === 401) { showLogin(); message('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true); return; }
      const result = payload.data;
      byId('financial-status').textContent = !response.ok ? payload.message || 'Không tính được điểm F.'
        : result.complete ? 'Financial Fit: ' + result.financialScore + '/100 — chỉ tính F, chưa lưu lịch sử.'
        : 'Chưa đủ dữ liệu để tính F. Xem các mục còn thiếu bên dưới.';
      byId('financial-status').className = 'message ' + (response.ok && result.complete ? 'success' : 'error');
      byId('financial-result').textContent = JSON.stringify(payload, null, 2);
      byId('financial-result').hidden = false;
    } catch {
      byId('financial-status').className = 'message error';
      byId('financial-status').textContent = 'Không đọc được kết quả. Kiểm tra backend rồi thử lại.';
    } finally { setBusy(false); }
  };
  byId('financial-form').addEventListener('submit', async event => {
    event.preventDefault();
    const body = {};
    for (const [field, id] of Object.entries(financialFields)) {
      const value = byId(id).value.trim();
      body[field] = field === 'remainingMonths' ? value === '' ? null : Number(value) : value === '' ? null : value;
    }
    await runFinancial('preview', body);
  });
  byId('financial-evaluate-button').addEventListener('click', async () => {
    if (busy) return;
    const player = byId('financial-player-id').value.trim(); const requirement = byId('financial-requirement-id').value.trim();
    if ([player, requirement].some(id => !/^[0-9]+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647)) {
      byId('financial-status').className = 'message error';
      byId('financial-status').textContent = 'Nhập ID cầu thủ và ID yêu cầu CLB nguyên dương.';
      byId('financial-result').textContent = ''; byId('financial-result').hidden = true;
      return;
    }
    await runFinancial('evaluate', { playerId: Number(player), requirementId: Number(requirement) });
  });
  const apiPaths = new Set([
    '/api/transfers', '/api/shortlist-lists', '/api/shortlist-items',
    '/api/notifications', '/api/scoring-configs', '/api/match-results',
    '/api/audit-logs', '/api/players', '/api/clubs', '/api/contracts',
    '/api/player-stats', '/api/injury-history', '/api/club-requirements', '/api/users',
    '/api/market-value-history', '/api/matching-inputs', '/api/player-data-verifications',
    '/api/matching/template',
  ]);
  const runRisk = async mode => {
    if (busy) return;
    if (!session) { showLogin(); message('Bạn cần đăng nhập để thử R.', true); return; }
    const container = byId('risk-breakdown'); container.replaceChildren(); container.hidden = true;
    byId('risk-result').textContent = ''; byId('risk-result').hidden = true;
    const weights = Object.fromEntries(['injury', 'resale'].map(k => [k, byId('risk-weight-' + k).value.trim()]));
    const hasWeights = Object.values(weights).some(v => v !== '');
    if (hasWeights && Object.values(weights).some(v => v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100)) {
      byId('risk-status').textContent = 'Để trống cả hai trọng số hoặc điền đủ hai số từ 0 đến 100, tổng 100%.';
      byId('risk-status').className = 'message error'; return;
    }
    let body;
    if (mode === 'evaluate') {
      const id = byId('risk-player-id').value.trim(); const source = byId('risk-source').value.trim();
      if (!/^[0-9]+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647) { byId('risk-status').textContent = 'Nhập ID cầu thủ hợp lệ.'; byId('risk-status').className = 'message error'; return; }
      body = { playerId: Number(id), ...(source ? { valuationSource: source } : {}) };
    } else if (mode === 'demo') {
      body = { demoId: byId('risk-demo-player').value };
    } else {
      const optionalNumber = id => byId(id).value.trim() === '' ? null : Number(byId(id).value);
      body = { age: optionalNumber('risk-age'), daysMissed: optionalNumber('risk-days'), ongoing: byId('risk-ongoing').value === 'true',
        priorValue: byId('risk-prior-value').value.trim() || null, currentValue: byId('risk-current-value').value.trim() || null };
    }
    if (hasWeights) body.weights = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Number(v)]));
    setBusy(true); byId('risk-status').textContent = 'Đang tính R…'; byId('risk-status').className = 'message';
    try {
      const response = await fetch('/api/matching/risk/' + (mode === 'evaluate' ? 'evaluate' : mode === 'demo' ? 'demo' : 'preview'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken }, cache: 'no-store', body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (response.status === 401) { showLogin(); message('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true); return; }
      byId('risk-result').textContent = JSON.stringify(payload, null, 2); byId('risk-result').hidden = false;
      if (!response.ok) { byId('risk-status').textContent = payload.message || 'Không tính được R.'; byId('risk-status').className = 'message error'; return; }
      const data = payload.data; const score = v => v == null ? 'Chưa đủ dữ liệu' : v + '/100';
      byId('risk-status').textContent = (data.mode === 'DATABASE' ? data.player.name + ' · tuổi ' + data.player.age : data.mode === 'DEMO' ? 'DEMO — ' + data.player.name + ' · chấn thương giả lập' : 'GIẢ LẬP — không gắn với cầu thủ thật') + ' — R: ' + (data.weights ? score(data.riskScore) : 'Chưa nhập trọng số thử');
      byId('risk-status').className = 'message ' + (data.complete ? 'success' : '');
      container.hidden = false;
      const line = text => { const p = document.createElement('p'); p.textContent = text; container.append(p); };
      line('Điểm chấn thương: ' + score(data.scores.injury) + ' · Điểm bán lại: ' + score(data.scores.resale));
      const injury = data.injury, resale = data.resale;
      line((data.mode === 'DEMO' ? 'Số ngày nghỉ GIẢ LẬP: ' : 'Số ngày nghỉ: ') + (injury.daysMissed ?? 'Chưa xác minh / chưa biết') + ' · Đang chấn thương' + (data.mode === 'DEMO' ? ' (GIẢ LẬP)' : '') + ': ' + (data.mode === 'DATABASE' && !injury.coverageVerified && !injury.ongoing ? 'Chưa xác minh' : injury.ongoing ? 'Có' : 'Không'));
      if (injury.windowStart) line((data.mode === 'DEMO' ? 'Cửa sổ giả lập: ' : 'Cửa sổ chấn thương: ') + injury.windowStart + ' → ' + injury.windowEnd + (data.mode === 'DEMO' ? ' · Đây là tổng ngày nghỉ tự đặt cho tình huống demo.' : ' · Đã ghi nhận ' + injury.observedDays + ' ngày (chưa đồng nghĩa dữ liệu đầy đủ).'));
      line('Điểm chấn thương cơ sở: ' + score(injury.scoreBeforeCap) + (injury.cap === null ? '' : ' · Trần khi đang chấn thương: ' + injury.cap));
      const money = v => v === null ? 'Chưa có' : Number(v).toLocaleString('vi-VN') + ' EUR';
      line('Giá cũ: ' + money(resale.priorValue) + (resale.priorDate ? ' (' + resale.priorDate + ')' : '') + ' → Giá mới: ' + money(resale.currentValue) + (resale.currentDate ? ' (' + resale.currentDate + ')' : ''));
      if (resale.source) line('Nguồn định giá: ' + resale.source);
      line('Biến động: ' + (resale.changePercent === null ? 'Chưa tính được' : resale.changePercent + '%') + ' · Điểm biến động: ' + score(resale.trendScore) + ' · Điểm tuổi bán lại: ' + score(resale.ageScore));
      line('Điểm bán lại = 60% điểm biến động + 40% điểm tuổi bán lại.');
      if (data.weights) line('R = ' + data.weights.injury + '% điểm chấn thương + ' + data.weights.resale + '% điểm bán lại.');
      if (resale.reason === 'AMBIGUOUS_VALUATION_SOURCES') line('Có nhiều nguồn giá phù hợp; nhập rõ nguồn định giá: ' + data.availableValuationSources.join(' · '));
      else if (resale.reason) line('Chưa đủ hai mốc giá hợp lệ hoặc tuổi để tính điểm bán lại; xem chi tiết bên dưới.');
      for (const warning of data.warnings) line(warning);
      line('Chỉ thử tính, không lưu kết quả hoặc thay cấu hình.');
    } catch {
      byId('risk-status').textContent = 'Không đọc được kết quả. Kiểm tra backend rồi thử lại.'; byId('risk-status').className = 'message error';
    } finally { setBusy(false); }
  };
  byId('risk-database-form').addEventListener('submit', event => { event.preventDefault(); void runRisk('evaluate'); });
  byId('risk-simulation-form').addEventListener('submit', event => { event.preventDefault(); void runRisk('preview'); });
  byId('risk-demo-form').addEventListener('submit', event => { event.preventDefault(); void runRisk('demo'); });
  byId('squad-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!session) { showLogin(); message('Bạn cần đăng nhập để thử điểm S.', true); return; }
    const player = byId('squad-player-id').value.trim();
    const weights = Object.fromEntries(['position', 'age', 'form'].map(key => [key, byId('squad-weight-' + key).value.trim()]));
    const hasWeights = Object.values(weights).some(value => value !== '');
    byId('squad-breakdown').replaceChildren(); byId('squad-breakdown').hidden = true;
    byId('squad-result').textContent = ''; byId('squad-result').hidden = true;
    if (!/^[0-9]+$/.test(player) || Number(player) < 1 || Number(player) > 2147483647 ||
        (hasWeights && Object.values(weights).some(value => value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100))) {
      byId('squad-status').textContent = 'Nhập ID cầu thủ hợp lệ. Trọng số: để trống cả ba hoặc điền đủ ba ô, tổng 100%.';
      byId('squad-status').className = 'message error'; return;
    }
    setBusy(true); byId('squad-status').textContent = 'Đang lấy thống kê và tính điểm…'; byId('squad-status').className = 'message';
    try {
      const position = byId('squad-position').value;
      const response = await fetch('/api/matching/squad/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken }, cache: 'no-store',
        body: JSON.stringify({ playerId: Number(player), season: byId('squad-season').value,
          ...(position ? { requiredPosition: position } : {}),
          ...(hasWeights ? { weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Number(v)])) } : {}) }),
      });
      const payload = await response.json();
      if (response.status === 401) { showLogin(); message('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true); return; }
      byId('squad-result').textContent = JSON.stringify(payload, null, 2); byId('squad-result').hidden = false;
      if (!response.ok) { byId('squad-status').textContent = payload.message || 'Không tính được điểm.'; byId('squad-status').className = 'message error'; return; }
      const data = payload.data;
      const score = value => value === null || value === undefined ? 'Chưa đủ dữ liệu' : value + '/100';
      byId('squad-status').textContent = data.player.name + ' · ' + data.player.position + ' · ' + data.season + ' — Phong độ: ' + score(data.formScore);
      byId('squad-status').className = 'message ' + (data.formScore !== null ? 'success' : 'error');
      const container = byId('squad-breakdown'); container.hidden = false;
      const line = text => { const p = document.createElement('p'); p.textContent = text; container.append(p); };
      line('Vị trí: ' + score(data.scores.position) + ' · Tuổi (' + data.player.age + '): ' + score(data.scores.age));
      line(data.weights ? 'Điểm S theo trọng số thử: ' + score(data.squadScore) : 'Chưa ghép điểm S: bạn chưa nhập ba trọng số thử.');
      const labels = { goals: 'Bàn thắng', assists: 'Kiến tạo', keyPasses: 'Tạo cơ hội', tacklesWon: 'Tắc bóng thành công', interceptions: 'Cắt bóng', passesCompleted: 'Chuyền thành công' };
      const table = document.createElement('table'); table.className = 'squad-table';
      const row = (values, header = false) => { const tr = document.createElement('tr'); for (const value of values) { const cell = document.createElement(header ? 'th' : 'td'); cell.textContent = String(value); tr.append(cell); } table.append(tr); };
      row(['Chỉ số', 'Tổng mùa', '/90 phút', 'Điểm', 'Trọng số phong độ'], true);
      row(['Thời gian thi đấu', data.form.minutesPlayed === null ? 'null' : data.form.minutesPlayed + ' phút', '—', score(data.form.minutesScore), (data.form.weights.minutes * 100).toFixed(0) + '%']);
      for (const [key, value] of Object.entries(data.form.metricScores)) row([labels[key] || key, data.stats?.[key] ?? 'null', data.form.per90[key] ?? 'null', score(value), (data.form.weights[key] * 100).toFixed(0) + '%']);
      container.append(table);
      line('Điểm trước giới hạn: ' + score(data.form.scoreBeforeCap) + ' · Trần theo số phút: ' + score(data.form.cap) + ' · Điểm phong độ cuối: ' + score(data.formScore));
      if (data.form.reason) line('Chưa tính được phong độ: ' + ({ MISSING_SEASON_STATS: 'Chưa có thống kê mùa này.', UNSUPPORTED_ROLE: 'Chưa có công thức cho vị trí này (GK).', NO_PLAYING_MINUTES: 'Chưa có số phút thi đấu dương.', MISSING_REQUIRED_STATS: 'Thiếu chỉ số cần cho vai trò; giữ null.' }[data.form.reason] || data.form.reason));
      if (data.positionBasis === 'POSITION_GROUP_NOT_CONFIGURED') line('Chưa khai báo nhóm vị trí để chấm mức khớp này.');
      line('Chỉ thử tính, không lưu lịch sử hoặc thay cấu hình Matching.');
    } catch {
      byId('squad-status').textContent = 'Không đọc được kết quả. Kiểm tra backend rồi thử lại.'; byId('squad-status').className = 'message error';
    } finally { setBusy(false); }
  });
  byId('matching-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!session) { showLogin(); message('Bạn cần đăng nhập để thử Matching.', true); return; }
    const player = byId('matching-player-id').value.trim(); const requirement = byId('matching-requirement-id').value.trim();
    const configId = byId('matching-config-id').value.trim(); const season = byId('matching-season').value.trim();
    const formRole = byId('matching-form-role').value; const valuationSource = byId('matching-valuation-source').value.trim();
    const validId = id => /^[0-9]+$/.test(id) && Number(id) >= 1 && Number(id) <= 2147483647;
    if (!validId(player) || !validId(requirement) || (configId && !validId(configId)) || !/^\d{4}\/\d{4}$/.test(season) || Number(season.slice(5)) !== Number(season.slice(0, 4)) + 1 || !['PRIMARY', 'REQUIRED'].includes(formRole)) {
      byId('matching-status').textContent = 'Nhập ID hợp lệ, mùa liên tiếp YYYY/YYYY và chọn vai trò chấm phong độ.';
      byId('matching-status').className = 'message error'; byId('matching-result').textContent = ''; byId('matching-result').hidden = true; return;
    }
    setBusy(true); byId('matching-result').textContent = ''; byId('matching-result').hidden = true;
    byId('matching-status').textContent = 'Đang tính Matching…'; byId('matching-status').className = 'message';
    try {
      const response = await fetch('/api/matching/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.accessToken }, cache: 'no-store',
        body: JSON.stringify({ playerId: Number(player), requirementId: Number(requirement), season, formRole, save: byId('matching-save').checked === true,
          ...(configId ? { configId: Number(configId) } : {}), ...(valuationSource ? { valuationSource } : {}) }),
      });
      const payload = await response.json();
      if (response.status === 401) { showLogin(); message('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true); return; }
      const data = payload.data;
      byId('matching-status').textContent = !response.ok ? payload.message || 'Không tính được Matching.'
        : data.complete ? 'Matching: ' + data.totalScore + '/100 · F ' + data.financialScore + ' · S ' + data.squadScore + ' · R ' + data.riskScore + (data.saved ? ' · Đã lưu lịch sử #' + data.resultId : ' · Chưa lưu lịch sử.')
        : 'Chưa đủ dữ liệu để tính điểm tổng. Xem missing và chi tiết bên dưới; chưa lưu lịch sử.';
      byId('matching-status').className = 'message ' + (response.ok && data.complete ? 'success' : 'error');
      byId('matching-result').textContent = JSON.stringify(payload, null, 2); byId('matching-result').hidden = false;
    } catch {
      byId('matching-status').textContent = 'Không đọc được kết quả. Kiểm tra backend rồi thử lại.'; byId('matching-status').className = 'message error';
    } finally { setBusy(false); }
  });
  byId('api-test-button').addEventListener('click', async () => {
    if (busy) return;
    if (!session) { showLogin(); message('Bạn cần đăng nhập để thử API.', true); return; }
    const path = byId('api-endpoint').value;
    const id = byId('api-record-id').value.trim();
    if (!apiPaths.has(path) || (id && (!/^[0-9]+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647))) {
      byId('api-status').textContent = 'Chọn API hợp lệ và nhập ID nguyên dương hoặc để trống.';
      byId('api-status').className = 'message error';
      byId('api-result').hidden = true;
      return;
    }
    const url = path + (id ? '/' + id : '');
    setBusy(true);
    byId('api-result').hidden = true;
    byId('api-result').textContent = '';
    byId('api-status').className = 'message';
    byId('api-status').textContent = 'Đang gửi GET ' + url + '…';
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + session.accessToken },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (response.status === 401) {
        showLogin(); message('Phiên đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.', true);
        return;
      }
      const empty = response.ok && Array.isArray(payload.data) && payload.data.length === 0;
      byId('api-status').textContent = 'GET ' + url + ' — HTTP ' + response.status +
        (empty ? ' · Thành công, chưa có dữ liệu.' : response.ok ? ' · Thành công.' : ' · ' + (payload.message || 'Yêu cầu không thành công.'));
      byId('api-status').className = 'message ' + (response.ok ? 'success' : 'error');
      byId('api-result').textContent = JSON.stringify(payload, null, 2);
      byId('api-result').hidden = false;
    } catch {
      byId('api-status').textContent = 'Không đọc được kết quả. Kiểm tra backend đang chạy rồi thử lại.';
      byId('api-status').className = 'message error';
    } finally { setBusy(false); }
  });
  byId('toggle-password').addEventListener('click', () => {
    const visible = byId('password').type === 'password';
    byId('password').type = visible ? 'text' : 'password';
    byId('toggle-password').textContent = visible ? 'Ẩn' : 'Hiện';
    byId('toggle-password').setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    byId('toggle-password').setAttribute('aria-pressed', String(visible));
  });
  if (session) checkSession();
})();
