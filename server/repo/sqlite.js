'use strict';
/**
 * node:sqlite 기반 저장소 구현.
 *
 * <p>Node 22+ 내장 모듈이라 npm 의존성이 없다(폐쇄망 VDI 제약 충족). 포터블 배포판이
 * 번들한 node 가 22 미만이면 require('node:sqlite') 가 던진다 — 그 경우 이 파일은
 * 아예 로드하지 않고 server/repo/index.js 가 파일 저장소로 폴백한다(이 파일 안에서는
 * 폴백을 처리하지 않는다 — 폴백은 팩토리의 책임).
 *
 * <p>세 테이블(tunings/snippets/connections) 모두 <code>payload</code> 컬럼에 원본 JSON
 * 전문을 그대로 담는다. 조회·정렬에 쓰는 필드만 컬럼으로 승격한다 — 애플리케이션 쪽
 * 레코드 구조가 바뀌어도 스키마를 따라 바꾸지 않아도 데이터를 잃지 않기 위해서다.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { SCHEMA_VERSION } = require('./repository');

/** DB 파일을 열고(없으면 만들고) 스키마를 보장한다. */
function openDb(dbPath) {
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  } catch (e) { if (e.code !== 'EEXIST') throw e; }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tunings (
      id TEXT PRIMARY KEY, scope TEXT, name TEXT, sql_ref TEXT, status TEXT,
      created_at TEXT, updated_at TEXT, payload TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS ix_tunings_scope_name ON tunings(scope, name)');
  db.exec('CREATE INDEX IF NOT EXISTS ix_tunings_updated ON tunings(updated_at DESC)');

  // 스펙 원안 대비 확장: 스니펫도 title/tags/desc 를 보존해야 하므로 payload 를 둔다
  // (튜닝/접속과 같은 "payload 에 전문 보관" 원칙을 스니펫에도 동일하게 적용).
  db.exec(`
    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY, scope TEXT, name TEXT, sql TEXT NOT NULL,
      created_at TEXT, updated_at TEXT, payload TEXT NOT NULL
    )
  `);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_snippets ON snippets(scope, name)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY, name TEXT, payload TEXT NOT NULL, sort_order INTEGER
    )
  `);

  db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
  const row = db.prepare('SELECT v FROM meta WHERE k = ?').get('schema_version');
  if (!row) {
    db.prepare('INSERT INTO meta (k, v) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  }

  return db;
}

// ── 튜닝 이력 ────────────────────────────────────────────────────────────

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{toSummary: function}} opts
 * @returns {import('./repository').TuningRepo}
 */
function createTuningRepo(db, { toSummary }) {
  const upsert = db.prepare(`
    INSERT INTO tunings (id, scope, name, sql_ref, status, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      scope = excluded.scope, name = excluded.name, sql_ref = excluded.sql_ref,
      status = excluded.status, created_at = excluded.created_at,
      updated_at = excluded.updated_at, payload = excluded.payload
  `);
  const selGet = db.prepare('SELECT payload FROM tunings WHERE id = ?');
  const selAll = db.prepare('SELECT payload FROM tunings ORDER BY updated_at DESC');
  const del = db.prepare('DELETE FROM tunings WHERE id = ?');
  const insertIgnore = db.prepare(`
    INSERT OR IGNORE INTO tunings (id, scope, name, sql_ref, status, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function listSummaries() {
    return selAll.all().map((r) => toSummary(JSON.parse(r.payload)));
  }

  function get(id) {
    const row = selGet.get(id);
    return row ? JSON.parse(row.payload) : null;
  }

  function save(rec) {
    const scope = (rec.sqlRef && rec.sqlRef.scope) || '';
    const name = (rec.sqlRef && rec.sqlRef.name) || '';
    const sqlRef = rec.sqlRef ? JSON.stringify(rec.sqlRef) : '';
    upsert.run(rec.id, scope, name, sqlRef, rec.status || '', rec.createdAt || '', rec.updatedAt || '', JSON.stringify(rec));
    return rec;
  }

  function remove(id) {
    return del.run(id).changes > 0;
  }

  /** 마이그레이션 전용 — 이미 있는 id 면 건너뛴다(멱등). 삽입했으면 true. */
  function insertIfAbsent(rec) {
    const scope = (rec.sqlRef && rec.sqlRef.scope) || '';
    const name = (rec.sqlRef && rec.sqlRef.name) || '';
    const sqlRef = rec.sqlRef ? JSON.stringify(rec.sqlRef) : '';
    const info = insertIgnore.run(rec.id, scope, name, sqlRef, rec.status || '', rec.createdAt || '', rec.updatedAt || '', JSON.stringify(rec));
    return info.changes > 0;
  }

  return { listSummaries, get, save, remove, rebuildIndex: listSummaries, insertIfAbsent };
}

// ── SQL 라이브러리(스니펫) ───────────────────────────────────────────────

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {import('./repository').SnippetRepo}
 */
function createSnippetRepo(db) {
  const upsert = db.prepare(`
    INSERT INTO snippets (id, scope, name, sql, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sql = excluded.sql, updated_at = excluded.updated_at, payload = excluded.payload
  `);
  const selList = db.prepare('SELECT payload FROM snippets WHERE scope = ?');
  const selGet = db.prepare('SELECT payload FROM snippets WHERE scope = ? AND name = ?');
  const del = db.prepare('DELETE FROM snippets WHERE scope = ? AND name = ?');
  const selScopes = db.prepare('SELECT scope, COUNT(*) AS c FROM snippets GROUP BY scope');
  const insertIgnore = db.prepare(`
    INSERT OR IGNORE INTO snippets (id, scope, name, sql, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  function idFor(scope, name) {
    return `${scope}::${name}`;
  }

  function list(scope) {
    return selList.all(scope).map((r) => JSON.parse(r.payload));
  }

  function get(scope, name) {
    const row = selGet.get(scope, name);
    return row ? JSON.parse(row.payload) : null;
  }

  function save(scope, name, rec) {
    const now = rec.updatedAt || new Date().toISOString();
    const payload = { name, title: rec.title, tags: rec.tags || [], desc: rec.desc || '', sql: rec.sql || '', updatedAt: now };
    upsert.run(idFor(scope, name), scope, name, rec.sql || '', now, now, JSON.stringify(payload));
  }

  function remove(scope, name) {
    return del.run(scope, name).changes > 0;
  }

  function scopes() {
    return selScopes.all().map((r) => ({ scope: r.scope, count: r.c }));
  }

  /** 마이그레이션 전용 — 이미 있는 (scope,name) 이면 건너뛴다(멱등). 삽입했으면 true. */
  function insertIfAbsent(scope, name, rec) {
    const now = rec.updatedAt || new Date().toISOString();
    const payload = { name, title: rec.title, tags: rec.tags || [], desc: rec.desc || '', sql: rec.sql || '', updatedAt: now };
    const info = insertIgnore.run(idFor(scope, name), scope, name, rec.sql || '', now, now, JSON.stringify(payload));
    return info.changes > 0;
  }

  return { list, get, save, remove, scopes, insertIfAbsent };
}

// ── 접속 프로필 ──────────────────────────────────────────────────────────

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {import('./repository').ConnectionRepo}
 */
function createConnectionRepo(db) {
  const upsert = db.prepare(`
    INSERT INTO connections (id, name, payload, sort_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, payload = excluded.payload
  `);
  const selAll = db.prepare('SELECT payload FROM connections ORDER BY sort_order ASC');
  const selGet = db.prepare('SELECT payload FROM connections WHERE id = ?');
  const selMax = db.prepare('SELECT MAX(sort_order) AS m FROM connections');
  const del = db.prepare('DELETE FROM connections WHERE id = ?');
  const insertIgnore = db.prepare(`
    INSERT OR IGNORE INTO connections (id, name, payload, sort_order)
    VALUES (?, ?, ?, ?)
  `);

  function list() {
    return selAll.all().map((r) => JSON.parse(r.payload));
  }

  function get(id) {
    const row = selGet.get(id);
    return row ? JSON.parse(row.payload) : null;
  }

  function save(rec) {
    const existing = get(rec.id);
    let order;
    if (existing && existing.__sortOrder !== undefined) {
      order = existing.__sortOrder;
    } else {
      const m = selMax.get();
      order = (m && m.m !== null && m.m !== undefined) ? m.m + 1 : 0;
    }
    // __sortOrder 는 payload 안에 남겨 다음 갱신 때도 순서를 유지한다(연결 목록 순서 보존용).
    upsert.run(rec.id, rec.name || '', JSON.stringify({ ...rec, __sortOrder: order }), order);
  }

  function remove(id) {
    return del.run(id).changes > 0;
  }

  /** 마이그레이션 전용 — 이미 있는 id 면 건너뛴다(멱등). 삽입했으면 true. */
  function insertIfAbsent(rec) {
    const m = selMax.get();
    const order = (m && m.m !== null && m.m !== undefined) ? m.m + 1 : 0;
    const info = insertIgnore.run(rec.id, rec.name || '', JSON.stringify({ ...rec, __sortOrder: order }), order);
    return info.changes > 0;
  }

  return {
    list: () => list().map(({ __sortOrder, ...rest }) => rest),
    get: (id) => { const r = get(id); if (!r) return null; const { __sortOrder, ...rest } = r; return rest; },
    save,
    remove,
    insertIfAbsent
  };
}

module.exports = { openDb, createTuningRepo, createSnippetRepo, createConnectionRepo };
