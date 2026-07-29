/**
 * 서버 API 클라이언트.
 *
 * 모든 호출은 JSON. 서버가 오류를 주면 message/detail 을 담은 Error 로 바꿔 던진다.
 * 화면 코드가 HTTP 를 몰라도 되게 하는 것이 목적이다.
 */

async function call(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error(`서버에 연결할 수 없습니다 (${e.message}). 서버가 떠 있는지 확인하세요.`);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      return text;
    }
  }
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = (data && data.error && data.error.detail) || null;
    throw err;
  }
  return data;
}

const get = (p) => call('GET', p);
const post = (p, b) => call('POST', p, b || {});
const del = (p) => call('DELETE', p);

/** 현재 접속 세션 ID — 모든 DB 호출에 자동으로 붙는다. */
export const session = {
  id: null,
  meta: null,
  capabilities: null,
  get connected() { return !!this.id; }
};

function withSession(body = {}) {
  return { ...body, sessionId: body.sessionId || session.id };
}

export const api = {
  // 상태·설정
  health: () => get('/api/health'),
  getConfig: () => get('/api/config'),
  saveConfig: (settings) => post('/api/config', { settings }),
  javaHomes: () => get('/api/config/java-homes'),
  rescanDrivers: () => post('/api/config/rescan-drivers'),
  restartBridge: () => post('/api/bridge/restart'),
  buildBridge: (force) => post('/api/bridge/build', { force: !!force }),

  // 접속
  listConnections: () => get('/api/connections'),
  saveConnection: (c) => post('/api/connections', c),
  removeConnection: (id) => del(`/api/connections/${encodeURIComponent(id)}`),
  testConnection: (b) => post('/api/connections/test', b),

  async connect(b) {
    const r = await post('/api/connect', b);
    session.id = r.sessionId;
    session.meta = r.meta;
    session.capabilities = r.capabilities;
    // 브라우저 새로고침(F5)에도 접속을 유지하기 위해 세션 id 를 저장한다.
    // 실제 DB 세션은 서버(Java 브리지)에 살아 있으므로 id 만 있으면 복원할 수 있다.
    try { sessionStorage.setItem('ot.sid', r.sessionId); } catch (e) { /* noop */ }
    return r;
  },
  async disconnect() {
    try { sessionStorage.removeItem('ot.sid'); } catch (e) { /* noop */ }
    if (!session.id) return { closed: false };
    const sid = session.id;
    session.id = null;
    session.meta = null;
    session.capabilities = null;
    return post('/api/disconnect', { sessionId: sid });
  },

  /** 새로고침 후 저장된 세션이 아직 살아있으면 복원한다. 성공 시 true. */
  async restoreSession() {
    let sid = null;
    try { sid = sessionStorage.getItem('ot.sid'); } catch (e) { /* noop */ }
    if (!sid) return false;
    try {
      const r = await get('/api/sessions');
      const found = (r.sessions || []).find((s) => s.sessionId === sid && s.alive);
      if (!found) { try { sessionStorage.removeItem('ot.sid'); } catch (e) { /* noop */ } return false; }
      session.id = sid;
      session.meta = found.meta || null;
      session.capabilities = found.meta ? found.meta.capabilities : null;
      return true;
    } catch (e) {
      return false;
    }
  },
  capabilities: (force) => post('/api/capabilities', withSession({ force })),
  serverInfo: () => post('/api/server-info', withSession()),

  // SQL (DB 불필요)
  parse: (sql) => post('/api/sql/parse', { sql }),
  statementAt: (sql, offset) => post('/api/sql/statement-at', { sql, offset }),
  format: (sql) => post('/api/sql/format', { sql }),
  addHint: (sql, hint) => post('/api/sql/add-hint', { sql, hint }),

  // SQL (DB 필요)
  execute: (b) => post('/api/sql/execute', withSession(b)),
  explain: (sql) => post('/api/sql/explain', withSession({ sql })),
  displayCursor: (format) => post('/api/sql/display-cursor', withSession({ format })),
  sqlStats: (sqlId) => post('/api/sql/sql-stats', withSession({ sqlId })),
  describe: (sql) => post('/api/sql/describe', withSession({ sql })),
  cancel: () => post('/api/sql/cancel', withSession()),
  benchmark: (b) => post('/api/sql/benchmark', withSession(b)),
  compare: (b) => post('/api/sql/compare', withSession(b)),
  analyze: (b) => post('/api/sql/analyze', withSession(b)),
  expandStar: (b) => post('/api/sql/expand-star', withSession(b)),

  // 튜닝 후보 생성 · 토너먼트 (여러 후보를 실제로 돌려 최적안을 고른다)
  generateCandidates: (b) => post('/api/sql/candidates', withSession(b)),
  tournament: (b) => post('/api/sql/tournament', withSession(b)),

  // 메타데이터
  schemas: () => post('/api/meta/schemas', withSession()),
  objects: (b) => post('/api/meta/objects', withSession(b)),
  columns: (b) => post('/api/meta/columns', withSession(b)),
  indexes: (b) => post('/api/meta/indexes', withSession(b)),
  constraints: (b) => post('/api/meta/constraints', withSession(b)),
  tableStats: (b) => post('/api/meta/table-stats', withSession(b)),
  columnStats: (b) => post('/api/meta/column-stats', withSession(b)),
  ddl: (b) => post('/api/meta/ddl', withSession(b)),
  estimateRows: (b) => post('/api/meta/estimate-rows', withSession(b)),

  // 튜닝 이력 (특정 SQL 의 이력만 보려면 sqlName 지정 — 접속 scope 는 sessionId 로 유도)
  listTunings: (q) => {
    const p = new URLSearchParams(q || {});
    if (session.id) p.set('sessionId', session.id);
    const qs = p.toString();
    return get(`/api/tunings${qs ? '?' + qs : ''}`);
  },
  getTuning: (id) => get(`/api/tunings/${encodeURIComponent(id)}`),
  saveTuning: (rec) => post('/api/tunings', withSession(rec)),
  removeTuning: (id) => del(`/api/tunings/${encodeURIComponent(id)}`),
  exportUrl: (id, format) => `/api/tunings/${encodeURIComponent(id)}/export?format=${format}`,

  // SQL 라이브러리(스니펫) — 접속별로 나뉜다. sessionId 로 서버가 스코프를 유도한다.
  listSnippets: (q) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (session.id) p.set('sessionId', session.id);
    return get(`/api/snippets${p.toString() ? '?' + p.toString() : ''}`);
  },
  getSnippet: (name) => {
    const p = session.id ? `?sessionId=${encodeURIComponent(session.id)}` : '';
    return get(`/api/snippets/${encodeURIComponent(name)}${p}`);
  },
  saveSnippet: (rec) => post('/api/snippets', withSession(rec)),
  removeSnippet: (name) => {
    const p = session.id ? `?sessionId=${encodeURIComponent(session.id)}` : '';
    return del(`/api/snippets/${encodeURIComponent(name)}${p}`);
  },
  snippetScopes: () => get('/api/snippet-scopes'),
  installDemo: () => post('/api/snippets/install-demo', withSession({})),
  runScript: (b) => post('/api/sql/run-script', withSession(b)),
  demoSetup: () => post('/api/demo/setup', withSession({}))
};
