'use strict';
/**
 * REST API 라우팅.
 *
 * <p>계층 분리 원칙: 이 파일은 <b>입출력 변환과 흐름 제어</b>만 한다.
 * SQL 판정 로직은 analyzer, DB 접근은 bridge(Java), 저장은 tuning-store/connections 가 맡는다.
 * 여기에 업무 규칙을 넣지 않는다.
 *
 * <p>모든 응답은 JSON. 오류는 HTTP 상태 + `{error:{message, detail}}`.
 */

const fs = require('fs');
const path = require('path');
const P = require('./paths');
const config = require('./config');
const bridge = require('./bridge');
const connections = require('./connections');
const store = require('./tuning-store');
const snippets = require('./snippet-store');
const analyzer = require('./analyzer');
const candidates = require('./candidates');
const T = require('../shared/sql-tokenizer');
const logger = require('./logger');

const log = logger.forComponent('api');

/** 접속 세션 부가정보(브리지의 sessionId → 화면 표시용 메타). */
const sessionMeta = new Map();

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status || 400;
    this.detail = detail || null;
  }
}

function need(body, key) {
  const v = body[key];
  if (v === undefined || v === null || v === '') throw new ApiError(`필수 항목이 없습니다: ${key}`, 400);
  return v;
}

function sessionId(body) {
  const sid = body.sessionId;
  if (!sid) throw new ApiError('DB 에 접속되어 있지 않습니다. 먼저 접속하세요.', 409);
  return sid;
}

/**
 * 세션의 DB 메이저 버전을 알아낸다(숫자|null). 접속(connect) 시 캐시해 둔 sessionMeta 만 읽는다 —
 * capabilities/serverInfo 를 후보 생성마다 새로 호출하지 않는다(느려짐).
 */
function dbMajorVersionFor(sid) {
  if (!sid) return null;
  const meta = sessionMeta.get(sid);
  const server = meta && meta.server;
  if (!server) return null;
  return candidates.parseDbMajorVersion(server.databaseVersion || server.banner || null);
}

// ── 라우트 테이블 ───────────────────────────────────────────────────────────

const routes = [];

function route(method, pattern, handler) {
  // pattern: '/api/tunings/:id' → 정규식
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:([A-Za-z_]+)/g, (_, n) => {
    names.push(n);
    return '([^/]+)';
  }) + '$');
  routes.push({ method, re, names, handler });
}

async function dispatch(req, res, url, body) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    return await r.handler({ req, res, url, body, params, query: url.searchParams });
  }
  throw new ApiError(`알 수 없는 API: ${req.method} ${url.pathname}`, 404);
}

// ── 상태 / 설정 ────────────────────────────────────────────────────────────

route('GET', '/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
  bridge: bridge.status(),
  node: process.version
}));

route('GET', '/api/config', async () => ({
  settings: config.load(true),
  diagnostics: config.diagnose(),
  defaults: config.defaults(),
  bridge: bridge.status()
}));

route('POST', '/api/config', async ({ body }) => {
  const before = config.load(true);
  const saved = config.save(body.settings || {});
  const javaChanged = JSON.stringify(before.java) !== JSON.stringify(saved.java);
  const jdbcChanged = JSON.stringify(before.jdbc) !== JSON.stringify(saved.jdbc);
  let restarted = false;
  let restartError = null;
  if (javaChanged || jdbcChanged) {
    log.info('Java/JDBC 설정이 바뀌어 브리지를 재기동합니다.');
    try {
      await bridge.restart();
      restarted = true;
      sessionMeta.clear();
    } catch (e) {
      restartError = e.message;
    }
  }
  return { settings: saved, diagnostics: config.diagnose(), restarted, restartError };
});

route('GET', '/api/config/java-homes', async () => ({ homes: config.discoverJavaHomes() }));

route('POST', '/api/config/rescan-drivers', async () => ({
  jars: config.resolveDriverJars(config.load(true)),
  discovered: config.discoverDriverJars()
}));

route('POST', '/api/bridge/restart', async () => {
  await bridge.restart();
  sessionMeta.clear();
  return { ok: true, bridge: bridge.status() };
});

route('POST', '/api/bridge/build', async ({ body }) => {
  const { build } = require('../java/build');
  const r = build({ force: !!body.force });
  return r;
});

// ── 접속 프로필 ────────────────────────────────────────────────────────────

route('GET', '/api/connections', async () => ({ connections: connections.list() }));

route('POST', '/api/connections', async ({ body }) => ({ connection: connections.save(body || {}) }));

route('DELETE', '/api/connections/:id', async ({ params }) => ({ removed: connections.remove(params.id) }));

route('POST', '/api/connections/test', async ({ body }) => {
  // 저장하지 않고 즉석 접속 시험 — 프로필 등록 전 확인용
  const params = body.connectionId
    ? connections.connectParams(body.connectionId, body.password)
    : { ...body, password: body.password || '' };
  let sid = null;
  try {
    const r = await bridge.request('connect', { ...params, probeCapabilities: false }, 60000);
    sid = r.sessionId;
    return { ok: true, server: r.server };
  } catch (e) {
    return { ok: false, error: e.message, detail: e.detail || null };
  } finally {
    if (sid) {
      try { await bridge.request('disconnect', { sessionId: sid }, 10000); } catch (e) { /* noop */ }
    }
  }
});

// ── 접속 / 세션 ────────────────────────────────────────────────────────────

route('POST', '/api/connect', async ({ body }) => {
  const cfg = config.load();
  const params = body.connectionId
    ? connections.connectParams(body.connectionId, body.password)
    : { ...body, password: body.password || '' };
  params.loginTimeoutSec = cfg.jdbc.loginTimeoutSec;

  const r = await bridge.request('connect', { ...params, probeCapabilities: true }, 90000);
  if (body.connectionId) connections.touch(body.connectionId);

  sessionMeta.set(r.sessionId, {
    connectionId: body.connectionId || null,
    connectionName: params.profileName || `${params.user}@${params.host || params.url}`,
    production: !!params.production,
    connectedAt: new Date().toISOString(),
    capabilities: r.capabilities || null,
    server: r.server || null
  });
  log.info(`접속 성공 ${r.sessionId} (${params.profileName || params.user})`);
  return { sessionId: r.sessionId, server: r.server, capabilities: r.capabilities, meta: sessionMeta.get(r.sessionId) };
});

route('POST', '/api/disconnect', async ({ body }) => {
  const sid = body.sessionId;
  if (!sid) return { closed: false };
  try {
    await bridge.request('disconnect', { sessionId: sid }, 15000);
  } finally {
    sessionMeta.delete(sid);
  }
  return { closed: true };
});

route('GET', '/api/sessions', async () => {
  const r = await bridge.request('sessions', {}, 10000).catch(() => ({ sessions: [] }));
  return {
    sessions: (r.sessions || []).map((s) => ({ ...s, meta: sessionMeta.get(s.sessionId) || null }))
  };
});

route('POST', '/api/capabilities', async ({ body }) => {
  const sid = sessionId(body);
  const caps = await bridge.request('capabilities', { sessionId: sid, force: !!body.force }, 60000);
  const meta = sessionMeta.get(sid);
  if (meta) meta.capabilities = caps;
  return caps;
});

route('POST', '/api/server-info', async ({ body }) => bridge.request('serverInfo', { sessionId: sessionId(body) }, 30000));

// ── SQL: DB 없이 되는 것들 ─────────────────────────────────────────────────

route('POST', '/api/sql/parse', async ({ body }) => {
  const sql = String(body.sql || '');
  const statements = T.splitStatements(sql).map((s) => ({
    ...s,
    fingerprint: T.fingerprint(s.sql),
    binds: T.extractBinds(s.sql)
  }));
  return {
    statements,
    count: statements.length,
    binds: T.extractBinds(sql),
    substitutions: T.extractSubstitutions(sql)
  };
});

route('POST', '/api/sql/statement-at', async ({ body }) => {
  const st = T.statementAt(String(body.sql || ''), Number(body.offset) || 0);
  return { statement: st };
});

route('POST', '/api/sql/format', async ({ body }) => ({
  sql: T.format(String(body.sql || ''), { indent: body.indent || '  ' })
}));

route('POST', '/api/sql/expand-star', async ({ body }) => {
  const sql = String(body.sql || '');
  let names = body.columns;
  if (!Array.isArray(names) || !names.length) {
    // 컬럼을 안 주면 DB 에 물어본다(실행 없이 서술만)
    const sid = sessionId(body);
    const d = await bridge.request('describeQuery', { sessionId: sid, sql }, 30000);
    if (!d.ok) throw new ApiError(`컬럼 구조를 얻지 못했습니다: ${d.error}`, 400);
    names = d.columns.map((c) => c.name);
  }
  return analyzer.expandStar(sql, names, { perLine: body.perLine !== false });
});

route('POST', '/api/sql/add-hint', async ({ body }) => analyzer.addHint(String(body.sql || ''), String(body.hint || '')));

// ── SQL: DB 필요 ──────────────────────────────────────────────────────────

route('POST', '/api/sql/execute', async ({ body }) => {
  const cfg = config.load();
  const sid = sessionId(body);
  const params = {
    sessionId: sid,
    sql: String(body.sql || ''),
    binds: body.binds || null,
    maxRows: body.maxRows || cfg.execution.maxRows,
    fetchSize: body.fetchSize || cfg.execution.fetchSize,
    timeoutSec: body.timeoutSec || cfg.execution.timeoutSec,
    collectStats: body.collectStats !== false,
    hashResult: body.hashResult !== false,
    keepRows: body.keepRows !== false,
    keepRowsMax: Number(body.keepRowsMax) || cfg.execution.keepRowsMax,
    gatherPlanStats: !!body.gatherPlanStats,
    safeMode: body.safeMode !== undefined ? !!body.safeMode : cfg.execution.safeMode
  };
  const timeout = (params.timeoutSec + 30) * 1000;
  const r = await bridge.request('execute', params, timeout);
  delete r._rowDigests; // 내부용 — 화면으로 보내지 않는다
  return r;
});

/**
 * 스크립트 전체 실행 — 여러 문장을 순서대로 돌린다(데모 설치·DDL 스크립트용).
 *
 * <p>단일 문장 실행(execute)과 다른 점:
 * <ul>
 *   <li>토크나이저로 문장을 나눠 <b>차례대로</b> 실행하고 각 결과를 돌려준다.</li>
 *   <li>{@code continueOnError} 면 실패해도 다음 문장을 계속한다
 *       (없는 표를 DROP 하는 첫 줄처럼 "실패가 정상"인 문장이 있기 때문).</li>
 *   <li>{@code commit=true} 면 이 실행에 한해 안전모드를 풀고 실제로 반영한다.
 *       전역 설정을 건드리지 않고 <b>한 번만</b> 허용하는 방식이라 사고 위험이 낮다.</li>
 * </ul>
 */
route('POST', '/api/sql/run-script', async ({ body }) => {
  const cfg = config.load();
  const sid = sessionId(body);
  const script = String(body.sql || '');
  if (!script.trim()) throw new ApiError('실행할 스크립트가 비어 있습니다.', 400);

  const continueOnError = body.continueOnError !== false;
  const commit = !!body.commit;
  const timeoutSec = Number(body.timeoutSec) || Math.max(cfg.execution.timeoutSec, 300);
  const maxRows = Number(body.maxRows) || 200;

  const statements = T.splitStatements(script).filter((s) => s.sql.trim());
  if (!statements.length) throw new ApiError('실행할 문장을 찾지 못했습니다.', 400);

  log.info(`스크립트 실행: ${statements.length}문장 (commit=${commit}, continueOnError=${continueOnError})`);

  const results = [];
  let ok = 0, failed = 0;
  for (let i = 0; i < statements.length; i++) {
    const st = statements[i];
    const item = { no: i + 1, type: st.type, line: st.line, preview: st.sql.replace(/\s+/g, ' ').trim().slice(0, 120) };
    const t0 = Date.now();
    try {
      const r = await bridge.request('execute', {
        sessionId: sid,
        sql: st.sql,
        maxRows,
        timeoutSec,
        collectStats: false,
        hashResult: false,
        keepRows: false,
        safeMode: !commit          // commit=true 면 롤백하지 않는다
      }, (timeoutSec + 30) * 1000);
      item.ok = true;
      item.kind = r.kind;
      item.affectedRows = r.affectedRows;
      item.rowCount = r.rowCount;
      item.elapsedMs = Date.now() - t0;
      ok++;
    } catch (e) {
      item.ok = false;
      item.error = e.message;
      item.ora = (e.detail && e.detail.ora) || null;
      item.elapsedMs = Date.now() - t0;
      failed++;
      if (!continueOnError) { results.push(item); break; }
    }
    results.push(item);
  }

  // DDL 은 자동 커밋되지만 DML 은 아니므로, commit 요청이면 마지막에 확정한다
  if (commit) {
    try { await bridge.request('commit', { sessionId: sid }, 30000); } catch (e) {
      log.warn(`스크립트 커밋 실패: ${e.message}`);
    }
  }

  log.info(`스크립트 완료: 성공 ${ok} / 실패 ${failed}`);
  return { total: statements.length, ok, failed, committed: commit, results };
});

route('POST', '/api/sql/explain', async ({ body }) => {
  const sid = sessionId(body);
  return bridge.request('explain', { sessionId: sid, sql: String(body.sql || '') }, 90000);
});

route('POST', '/api/sql/display-cursor', async ({ body }) => {
  const sid = sessionId(body);
  return bridge.request('displayCursor', { sessionId: sid, format: body.format || '' }, 60000);
});

route('POST', '/api/sql/sql-stats', async ({ body }) => {
  const sid = sessionId(body);
  return bridge.request('sqlStats', { sessionId: sid, sqlId: body.sqlId || '' }, 30000);
});

route('POST', '/api/sql/describe', async ({ body }) => {
  const sid = sessionId(body);
  return bridge.request('describeQuery', { sessionId: sid, sql: String(body.sql || '') }, 30000);
});

route('POST', '/api/sql/cancel', async ({ body }) => {
  const sid = sessionId(body);
  return bridge.request('cancel', { sessionId: sid }, 15000);
});

route('POST', '/api/sql/benchmark', async ({ body }) => {
  const cfg = config.load();
  const sid = sessionId(body);
  const runs = body.runs || cfg.execution.benchRuns;
  const timeoutSec = body.timeoutSec || cfg.execution.timeoutSec;
  return bridge.request('benchmark', {
    sessionId: sid,
    sql: String(body.sql || ''),
    binds: body.binds || null,
    runs,
    warmup: body.warmup !== undefined ? body.warmup : cfg.execution.benchWarmup,
    maxRows: body.maxRows || cfg.execution.maxRows,
    timeoutSec
  }, (timeoutSec * (runs + 2) + 60) * 1000);
});

route('POST', '/api/sql/compare', async ({ body }) => {
  const cfg = config.load();
  const sid = sessionId(body);
  const runs = body.runs || cfg.execution.benchRuns;
  const timeoutSec = body.timeoutSec || cfg.execution.timeoutSec;
  const params = {
    sessionId: sid,
    before: { sql: String((body.before && body.before.sql) || ''), binds: (body.before && body.before.binds) || null },
    after: { sql: String((body.after && body.after.sql) || ''), binds: (body.after && body.after.binds) || null },
    runs,
    warmup: body.warmup !== undefined ? body.warmup : cfg.execution.benchWarmup,
    maxRows: body.maxRows || cfg.execution.maxRows,
    timeoutSec,
    verifyResults: body.verifyResults !== false
  };
  if (!params.before.sql || !params.after.sql) {
    throw new ApiError('비교하려면 튜닝 전/후 SQL 이 모두 필요합니다.', 400);
  }
  const budget = (timeoutSec * (runs * 2 + 4) + 90) * 1000;
  const r = await bridge.request('compare', params, budget);

  // 계획도 함께 비교한다(가능한 경우에만)
  const plans = { before: null, after: null };
  try {
    plans.before = await bridge.request('explain', { sessionId: sid, sql: params.before.sql }, 60000);
    plans.after = await bridge.request('explain', { sessionId: sid, sql: params.after.sql }, 60000);
  } catch (e) {
    log.warn(`비교용 실행계획 조회 실패(무시): ${e.message}`);
  }
  return { ...r, plans, planDiff: planDiff(plans.before, plans.after) };
});

/** 계획 요약치 비교(있을 때만). */
function planDiff(a, b) {
  if (!a || !b || !a.available || !b.available) return null;
  const sa = a.summary || {}, sb = b.summary || {};
  const keys = ['totalCost', 'estimatedRows', 'steps', 'fullScans', 'cartesian', 'indexScans', 'sorts', 'hashJoins', 'nestedLoops'];
  const rows = keys.map((k) => {
    const before = Number(sa[k] || 0);
    const after = Number(sb[k] || 0);
    return {
      metric: k,
      before,
      after,
      delta: after - before,
      improvementPct: before > 0 ? Math.round((before - after) / before * 1000) / 10 : null
    };
  });
  return { rows };
}

/**
 * SQL 한 문장에 대해 DB 에서 얻을 수 있는 부가정보를 모은다.
 *
 * <p>권한이 없어 실패하는 조회가 있는 것이 <b>정상</b>이다. 실패는 errors 에 남기고
 * 얻은 것만 가지고 진행한다. 이 함수의 결과가 비어 있어도 정적 분석은 그대로 동작한다.
 *
 * @returns {{plan:object|null, columnTypes:object, tableStats:object, indexes:object,
 *            resultColumns:string[], sources:object, errors:Array}}
 */
async function gatherMeta(sid, sql, structure, opts = {}) {
  const meta = {
    plan: null, columnTypes: {}, tableStats: {}, indexes: {},
    resultColumns: [], sources: {}, errors: []
  };
  if (!sid) return meta;

  if (opts.plan !== false) {
    try {
      meta.plan = await bridge.request('explain', { sessionId: sid, sql }, 60000);
    } catch (e) {
      meta.errors.push({ step: 'explain', message: e.message });
    }
  }

  // 쿼리 서술 — 실행하지 않고 결과 구조만. 딕셔너리 권한이 전혀 없어도 동작한다.
  try {
    const d = await bridge.request('describeQuery', { sessionId: sid, sql }, 30000);
    if (d.ok) {
      meta.sources.describeQuery = true;
      for (const c of d.columns) {
        if (!c.name) continue;
        meta.columnTypes[String(c.name).toUpperCase()] = c.typeName;
        meta.resultColumns.push(c.name);
      }
    }
  } catch (e) {
    meta.errors.push({ step: 'describeQuery', message: e.message });
  }

  // 테이블별 컬럼/통계/인덱스 — 최대 6개까지만(분석이 느려지지 않게)
  const tables = (structure.tables || []).filter((t) => !t.inline).slice(0, 6);
  for (const t of tables) {
    const name = String(t.name || '').replace(/"/g, '').toUpperCase();
    if (!name) continue;
    const owner = t.schema ? String(t.schema).replace(/"/g, '').toUpperCase() : '';
    try {
      const cols = await bridge.request('columns', { sessionId: sid, owner, table: name }, 20000);
      meta.sources[`columns:${name}`] = cols.source;
      for (const c of (cols.rows || [])) {
        if (c.column_name) meta.columnTypes[String(c.column_name).toUpperCase()] = c.data_type;
      }
    } catch (e) { meta.errors.push({ step: `columns:${name}`, message: e.message }); }
    try {
      const st = await bridge.request('tableStats', { sessionId: sid, owner, table: name }, 20000);
      meta.sources[`stats:${name}`] = st.source;
      if (st.rows && st.rows[0]) meta.tableStats[name] = st.rows[0];
    } catch (e) { meta.errors.push({ step: `stats:${name}`, message: e.message }); }
    try {
      const ix = await bridge.request('indexes', { sessionId: sid, owner, table: name }, 20000);
      meta.sources[`indexes:${name}`] = ix.source;
      meta.indexes[name] = ix.rows || [];
    } catch (e) { meta.errors.push({ step: `indexes:${name}`, message: e.message }); }
  }
  return meta;
}

/**
 * 통합 분석 — 정적 규칙 + (가능하면) 실행계획 + (가능하면) 딕셔너리.
 * DB 접속이 없어도 정적 분석만으로 동작한다.
 */
route('POST', '/api/sql/analyze', async ({ body }) => {
  const sql = String(body.sql || '');
  if (!sql.trim()) throw new ApiError('분석할 SQL 이 비어 있습니다.', 400);

  const sid = body.sessionId || null;
  const useDb = !!sid && body.useDb !== false;
  const structure = T.analyze(sql);

  const meta = await gatherMeta(useDb ? sid : null, sql, structure);
  const plan = meta.plan;

  const result = analyzer.analyze({
    sql,
    plan,
    columnTypes: meta.columnTypes,
    tableStats: meta.tableStats,
    indexes: meta.indexes
  });

  return {
    ...result,
    plan,
    meta: {
      usedDb: useDb,
      sources: meta.sources,
      errors: meta.errors,
      tableCount: Object.keys(meta.tableStats).length,
      columnTypeCount: Object.keys(meta.columnTypes).length
    }
  };
});

// ── 튜닝 후보 생성 · 토너먼트 ─────────────────────────────────────────────

/**
 * 튜닝 후보만 생성한다(실행하지 않음).
 * DB 접속이 있으면 인덱스·컬럼타입을 참고해 더 정확한 후보를 만들고, 없으면 문장만 보고 만든다.
 */
route('POST', '/api/sql/candidates', async ({ body }) => {
  const sql = String(body.sql || '');
  if (!sql.trim()) throw new ApiError('SQL 이 비어 있습니다.', 400);
  const sid = body.sessionId || null;
  const useDb = !!sid && body.useDb !== false;
  const structure = T.analyze(sql);

  const meta = await gatherMeta(useDb ? sid : null, sql, structure, { plan: body.withPlan !== false });
  const gen = candidates.generate({
    sql,
    meta: { columnTypes: meta.columnTypes, indexes: meta.indexes, tableStats: meta.tableStats },
    resultColumns: meta.resultColumns,
    plan: meta.plan,
    dbMajorVersion: dbMajorVersionFor(sid),
    options: {
      maxCandidates: Number(body.maxCandidates) || 16,
      includeExperimental: body.includeExperimental !== false
    }
  });

  return {
    ...gen,
    plan: meta.plan,
    meta: { usedDb: useDb, sources: meta.sources, errors: meta.errors }
  };
});

/**
 * 후보 토너먼트 — 여러 후보를 실제로 회전 실행해 성능·부하를 재고 순위를 매긴다.
 *
 * <p>이 API 가 이 도구의 결론이다. 추측이 아니라 실측으로 최적안을 고른다.
 */
route('POST', '/api/sql/tournament', async ({ body }) => {
  const cfg = config.load();
  const sid = sessionId(body);
  const sql = String(body.sql || '');
  if (!sql.trim()) throw new ApiError('원본 SQL 이 비어 있습니다.', 400);

  const structure = T.analyze(sql);
  const runs = Math.max(1, Math.min(20, Number(body.runs) || cfg.execution.benchRuns));
  const warmup = body.warmup !== undefined ? Number(body.warmup) : cfg.execution.benchWarmup;
  const timeoutSec = Number(body.timeoutSec) || cfg.execution.timeoutSec;
  const maxRows = Number(body.maxRows) || cfg.execution.maxRows;

  // 1) 후보 확보 — 화면에서 골라 보낸 것이 있으면 그걸 쓰고, 없으면 새로 만든다
  let list = [];
  let generated = null;
  if (Array.isArray(body.candidates) && body.candidates.length) {
    list = body.candidates.filter((c) => c && c.id && c.sql);
  } else {
    const meta = await gatherMeta(sid, sql, structure, { plan: false });
    generated = candidates.generate({
      sql,
      meta: { columnTypes: meta.columnTypes, indexes: meta.indexes, tableStats: meta.tableStats },
      resultColumns: meta.resultColumns,
      dbMajorVersion: dbMajorVersionFor(sid),
      options: {
        maxCandidates: Number(body.maxCandidates) || 12,
        includeExperimental: body.includeExperimental !== false
      }
    });
    list = generated.candidates;
  }
  if (!list.length) {
    throw new ApiError('시도할 튜닝 후보를 만들지 못했습니다. SQL 구조상 자동 변환 대상이 없습니다.', 400);
  }

  // 2) 실행계획 — 원본과 각 후보 (실패해도 진행)
  const plans = {};
  if (body.explainEach !== false) {
    try {
      plans.__baseline = await bridge.request('explain', { sessionId: sid, sql }, 45000);
    } catch (e) { log.warn(`원본 계획 조회 실패: ${e.message}`); }
    for (const c of list) {
      try {
        plans[c.id] = await bridge.request('explain', { sessionId: sid, sql: c.sql }, 45000);
      } catch (e) {
        plans[c.id] = { available: false, error: e.message };
      }
    }
  }

  // 3) 실측 — 라운드로빈 토너먼트
  const budgetMs = (timeoutSec * (list.length + 1) * (runs + warmup + 1) + 120) * 1000;
  log.info(`토너먼트 시작: 후보 ${list.length}개 × ${runs}회전(워밍업 ${warmup}) — 예산 ${Math.round(budgetMs / 1000)}초`);

  const tournament = await bridge.request('tournament', {
    sessionId: sid,
    baseline: { sql, binds: body.binds || null },
    candidates: list.map((c) => ({ id: c.id, sql: c.sql, binds: c.binds || body.binds || null })),
    runs,
    warmup,
    maxRows,
    timeoutSec,
    verifyResults: body.verifyResults !== false
  }, budgetMs);

  if (tournament.ok === false) {
    throw new ApiError(tournament.error || '토너먼트 실행에 실패했습니다.', 400, tournament);
  }

  // 4) 순위 — 결과 동일성 게이트를 통과한 후보만 서열화한다
  const ranking = candidates.rank(tournament, list, plans);
  log.info(`토너먼트 완료: 유효 ${ranking.ranked.length} / 결과불일치 ${ranking.rejected.length} / 실행실패 ${ranking.failed.length}` +
    (ranking.ranked[0] ? ` — 1위 ${ranking.ranked[0].id} (${ranking.ranked[0].score}%)` : ''));

  return {
    baselineSql: sql,
    candidates: list,
    generated,
    tournament,
    ranking,
    plans,
    settings: { runs, warmup, maxRows, timeoutSec }
  };
});

/**
 * 토너먼트 진행률 폴링. Java 가 stdout 으로 흘린 progress 이벤트를 bridge.js 가 메모리에
 * 캐시해 둔 것을 그대로 읽는다 — 500ms 마다 불리므로 DB·브리지에는 접근하지 않는다.
 * 진행 정보가 없어도 404 가 아니라 200 + {running:false} 를 준다(폴링 쪽 콘솔 오염 방지).
 */
route('GET', '/api/sql/tournament/progress', async ({ query }) => {
  const sid = query.get('sessionId');
  if (!sid) return { running: false };
  const p = bridge.getProgress(sid);
  if (!p) return { running: false };
  return {
    running: !p.finished,
    done: p.done,
    total: p.total,
    phase: p.phase,
    label: p.label,
    startedAt: p.startedAt,
    finished: p.finished
  };
});

// ── 메타데이터 ─────────────────────────────────────────────────────────────

const metaCmds = {
  '/api/meta/schemas': 'schemas',
  '/api/meta/objects': 'objects',
  '/api/meta/columns': 'columns',
  '/api/meta/indexes': 'indexes',
  '/api/meta/constraints': 'constraints',
  '/api/meta/table-stats': 'tableStats',
  '/api/meta/column-stats': 'columnStats',
  '/api/meta/ddl': 'ddl',
  '/api/meta/estimate-rows': 'estimateRows'
};

for (const [p, cmd] of Object.entries(metaCmds)) {
  route('POST', p, async ({ body }) => {
    const sid = sessionId(body);
    const timeout = cmd === 'estimateRows' ? 300000 : 60000;
    return bridge.request(cmd, { ...body, sessionId: sid }, timeout);
  });
}

// ── 튜닝 이력 ─────────────────────────────────────────────────────────────

route('GET', '/api/tunings', async ({ query }) => ({
  items: store.list({
    q: query.get('q') || '',
    status: query.get('status') || '',
    tag: query.get('tag') || '',
    sqlName: query.get('sqlName') || '',
    scope: query.get('scope') || (query.get('sessionId') ? snippetScope(null, query) : ''),
    limit: query.get('limit') || 0
  }),
  tags: store.tags()
}));

route('GET', '/api/tunings/:id', async ({ params }) => {
  const rec = store.get(params.id);
  if (!rec) throw new ApiError(`튜닝 기록을 찾을 수 없습니다: ${params.id}`, 404);
  return rec;
});

route('POST', '/api/tunings', async ({ body }) => {
  const rec = body || {};
  // SQL 참조가 있으면 접속(scope)을 채워 "이 접속의 이 SQL" 이력으로 묶는다
  if (rec.sqlRef && rec.sqlRef.name && !rec.sqlRef.scope) {
    rec.sqlRef.scope = snippetScope(rec);
  }
  return { tuning: store.save(rec) };
});

route('DELETE', '/api/tunings/:id', async ({ params }) => ({ removed: store.remove(params.id) }));

route('GET', '/api/tunings/:id/export', async ({ params, query, res }) => {
  const rec = store.get(params.id);
  if (!rec) throw new ApiError(`튜닝 기록을 찾을 수 없습니다: ${params.id}`, 404);
  const format = (query.get('format') || 'md').toLowerCase();
  const body = format === 'sql' ? store.toSqlFile(rec)
    : format === 'json' ? JSON.stringify(rec, null, 2)
    : store.toMarkdown(rec);
  const ext = format === 'sql' ? 'sql' : format === 'json' ? 'json' : 'md';
  const type = format === 'json' ? 'application/json' : 'text/plain';
  const fname = `${rec.id}.${ext}`;
  res.writeHead(200, {
    'Content-Type': `${type}; charset=utf-8`,
    'Content-Disposition': `attachment; filename="${fname}"`
  });
  res.end(body);
  return undefined; // 직접 응답 완료
});

route('POST', '/api/tunings/rebuild-index', async () => ({ items: store.rebuildIndex().length }));

// ── SQL 라이브러리(스니펫) — 작업 중인 SQL 저장/목록/불러오기 ────────────────
//
// SQL 은 특정 스키마·DB 에 종속되므로 <b>접속별로 나눠서</b> 보관한다.
// 스코프(폴더 키)는 접속 프로필 id 에서 유도한다. 접속 전(공용)에는 '_shared'.

/** sessionId → 접속 스코프 키. 클라이언트가 scope 를 직접 줄 수도 있다(우선). */
function snippetScope(body, query) {
  const explicit = (body && body.scope) || (query && query.get && query.get('scope'));
  if (explicit) return String(explicit);
  const sid = (body && body.sessionId) || (query && query.get && query.get('sessionId'));
  const meta = sid ? sessionMeta.get(sid) : null;
  if (meta) {
    if (meta.connectionId) return `conn_${meta.connectionId}`;
    const s = meta.server || {};
    const who = s.currentSchema || s.user || 'user';
    const where = s.dbName || s.instance || (s.url || '').replace(/[^\w]/g, '').slice(-20) || 'db';
    return `db_${who}_${where}`;
  }
  return '_shared';
}

route('GET', '/api/snippets', async ({ body, query }) => {
  const scope = snippetScope(body, query);
  const list = snippets.list(scope, { q: query.get('q') || '' });
  // 각 SQL 에 튜닝 이력 건수를 붙인다(목록에서 "이 SQL 은 튜닝 이력 N건" 표시)
  const counts = store.countsBySql(scope);
  for (const s of list) s.tuningCount = counts[s.name] || 0;
  return { scope, snippets: list };
});

route('GET', '/api/snippets/:name', async ({ params, query }) => {
  const scope = snippetScope(null, query);
  const s = snippets.get(scope, params.name);
  if (!s) throw new ApiError(`스니펫을 찾을 수 없습니다: ${params.name}`, 404);
  return s;
});

route('POST', '/api/snippets', async ({ body }) => {
  if (!String(body.name || '').trim()) throw new ApiError('스니펫 이름이 필요합니다.', 400);
  return snippets.save(snippetScope(body), body);
});

route('DELETE', '/api/snippets/:name', async ({ params, body, query }) => ({
  removed: snippets.remove(snippetScope(body, query), params.name)
}));

route('GET', '/api/snippet-scopes', async () => ({ scopes: snippets.scopes() }));

/**
 * 샘플(데모) 예제를 현재 접속의 SQL 목록에 설치한다.
 * 튜닝 효과를 실제로 확인해 볼 수 있는 예제 세트 — demo/ 폴더가 원본이다.
 *
 * <p>이름·설명·주석은 <b>요청의 lang(화면 언어)</b> 으로 저장한다. 화면 언어는
 * 브라우저 localStorage(`ot.lang`)에 있으므로 서버가 알 수 없어 클라이언트가 실어 보낸다.
 * 없으면 설정의 ui.locale, 그것도 없으면 ko.
 */
route('POST', '/api/snippets/install-demo', async ({ body }) => {
  const scope = snippetScope(body);
  const { demoItems } = require('./demo-install');
  const lang = body.lang || (config.load().ui || {}).locale || 'ko';
  let items;
  try {
    items = demoItems(lang);
  } catch (e) {
    throw new ApiError(`샘플 예제를 읽지 못했습니다: ${e.message}`, 500);
  }
  for (const it of items) snippets.save(scope, it);
  log.info(`샘플 예제 ${items.length}건 설치 (scope=${scope})`);
  return { scope, installed: items.length, names: items.map((i) => i.name) };
});

/**
 * <b>데모 데이터 한번에 만들기</b> — 표 생성 + 30만 건 + 인덱스 + 통계까지 서버가 직접 실행한다.
 *
 * <p>사용자가 SQL 을 한 문장씩 실행할 필요가 없고, 안전모드(자동 롤백)와도 무관하게
 * 이 요청에 한해 실제로 반영한다. 데모 목적이 분명하고 대상 표가 정해져 있어 안전하다.
 */
route('POST', '/api/demo/setup', async ({ body }) => {
  const sid = sessionId(body);
  const drop = body.drop !== false; // 기본: 기존 데모 표를 먼저 정리하고 새로 만든다

  const { readSqlFile } = require('./demo-install');
  const steps = [];
  if (drop) steps.push({ label: '기존 데모 표 정리', sql: readSqlFile('09-drop.sql').sql, ignoreError: true });
  steps.push({ label: '표·데이터·인덱스·통계 생성', sql: readSqlFile('01-setup.sql').sql, ignoreError: false });

  const results = [];
  let ok = 0, failed = 0;
  for (const step of steps) {
    for (const st of T.splitStatements(step.sql).filter((s) => s.sql.trim())) {
      const t0 = Date.now();
      const item = {
        step: step.label, type: st.type,
        preview: st.sql.replace(/\s+/g, ' ').trim().slice(0, 100)
      };
      try {
        const r = await bridge.request('execute', {
          sessionId: sid, sql: st.sql, maxRows: 10, timeoutSec: 600,
          collectStats: false, hashResult: false, keepRows: true,
          safeMode: false                   // 데모 생성은 실제로 반영해야 의미가 있다
        }, 630000);
        item.ok = true;
        item.affectedRows = r.affectedRows;
        item.rows = r.rows;
        item.elapsedMs = Date.now() - t0;
        ok++;
      } catch (e) {
        item.ok = false;
        item.error = e.message;
        item.ignored = !!step.ignoreError;
        item.elapsedMs = Date.now() - t0;
        if (!step.ignoreError) {
          failed++;
          results.push(item);
          log.error(`데모 생성 실패: ${e.message}`);
          return { ok: false, failedAt: item, results, message: `실패: ${e.message}` };
        }
      }
      results.push(item);
    }
    try { await bridge.request('commit', { sessionId: sid }, 30000); } catch (e) { /* DDL 은 이미 커밋됨 */ }
  }

  // 만들어진 건수 확인
  let rowCount = null;
  try {
    const r = await bridge.request('execute', {
      sessionId: sid, sql: 'SELECT COUNT(*) FROM ot_orders',
      maxRows: 1, collectStats: false, hashResult: false, keepRows: true, safeMode: true
    }, 120000);
    rowCount = r.rows && r.rows[0] ? r.rows[0][0] : null;
  } catch (e) { /* 확인 실패는 치명적이지 않다 */ }

  log.info(`데모 데이터 생성 완료: ${rowCount} 건`);
  return { ok: true, rowCount, statements: results.length, results };
});

module.exports = { dispatch, ApiError };
