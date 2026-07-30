'use strict';
/**
 * 저장소 팩토리 — 설정·가용성에 따라 sqlite | jsonfile 구현을 고른다.
 *
 * <p><b>기본값은 'sqlite' 다.</b> 발주자 요구가 "파일기반을 DB기반으로 변경"이므로,
 * `node:sqlite` 가 정상 동작하면(이 환경 Node 24 에서 실측 확인됨) SQLite 로 동작하는
 * 것이 기본이다. 파일 저장소는 <b>폴백</b>이지 기본값이 아니다 — require('node:sqlite')
 * 가 실패하거나(포터블 배포판이 번들한 node 가 22 미만인 경우 실제로 있다) DB 초기화가
 * 실패할 때만 파일 모드로 내려간다. 이중 쓰기(dual-write)는 하지 않는다 — 진실의 출처는
 * 언제나 하나(선택된 backend)뿐이다. 필요하면 `ORACLETUNER_STORAGE_BACKEND=file` 환경변수로
 * 강제로 파일 모드를 쓸 수 있다(테스트·디버깅용).
 *
 * <p>SQLite 로 처음 열릴 때 기존 파일 데이터를 1회 백업 후 이관한다(server/repo/migrate.js).
 * 원본 JSON/.sql 파일은 이관 후에도 지우지 않는다(이번 라운드에서는 손대지 않음).
 */

const path = require('path');
const jsonFileImpl = require('./json-file');
const sqliteImpl = require('./sqlite');
const migrateMod = require('./migrate');

/** paths.js 의 isInside 와 동일한 규칙(경로 탈출 방지). 마이그레이션은 어느 팩토리
 *  함수로 트리거되든 항상 필요하므로 여기서 자체적으로 갖는다. */
function isInside(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** dbPath -> { db, failed, error } 캐시. 같은 DB 파일은 세 저장소가 공유한다. */
const dbCache = new Map();

function resolveBackend(explicit) {
  if (explicit === 'sqlite' || explicit === 'file') return explicit;
  const env = process.env.ORACLETUNER_STORAGE_BACKEND;
  if (env === 'sqlite' || env === 'file') return env;
  return 'sqlite'; // 기본값. 실패하면 각 create*Repo() 가 파일 모드로 폴백한다.
}

/** 마이그레이션에만 쓰는 더미 — insertIfAbsent/scanRaw 는 toSummary 를 쓰지 않는다. */
const identitySummary = (rec) => rec;

function getOrOpenDb({ dbPath, tunings, snippets, connectionsFile, data, log }) {
  const cached = dbCache.get(dbPath);
  if (cached) {
    if (cached.failed) throw cached.error;
    return cached.db;
  }
  try {
    const db = sqliteImpl.openDb(dbPath);
    const already = db.prepare('SELECT v FROM meta WHERE k = ?').get('migrated');
    if (!already) {
      if (log) log.info('SQLite 저장소 최초 사용 — 이관을 시작합니다');
      const backupDir = migrateMod.backup({ dataDir: data, tunings, snippets, connectionsFile });
      if (log) log.info(`이관 전 백업 완료: ${backupDir}`);

      const jsonTuning = jsonFileImpl.createTuningRepo({ tunings, toSummary: identitySummary, log });
      const jsonSnippet = jsonFileImpl.createSnippetRepo({ snippets, isInside, log });
      const jsonConn = jsonFileImpl.createConnectionRepo({ connectionsFile, log });

      const sqliteTuning = sqliteImpl.createTuningRepo(db, { toSummary: identitySummary });
      const sqliteSnippet = sqliteImpl.createSnippetRepo(db);
      const sqliteConn = sqliteImpl.createConnectionRepo(db);

      migrateMod.migrate({
        db,
        jsonTuningRepo: jsonTuning, jsonSnippetRepo: jsonSnippet, jsonConnectionRepo: jsonConn,
        sqliteTuningRepo: sqliteTuning, sqliteSnippetRepo: sqliteSnippet, sqliteConnectionRepo: sqliteConn,
        log
      });
      db.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').run('migrated', new Date().toISOString());
    }
    dbCache.set(dbPath, { db, failed: false });
    return db;
  } catch (e) {
    dbCache.set(dbPath, { db: null, failed: true, error: e });
    throw e;
  }
}

/**
 * @param {{paths: object, log?: object, toSummary: function, backend?: string}} deps
 * @returns {import('./repository').TuningRepo}
 */
function createTuningRepo(deps) {
  const { paths: P, log, toSummary, backend } = deps;
  const be = resolveBackend(backend);
  if (be === 'sqlite') {
    try {
      const db = getOrOpenDb({ dbPath: P.dbFile(), tunings: P.tunings, snippets: P.snippets, connectionsFile: P.connectionsFile, data: P.data, log });
      return sqliteImpl.createTuningRepo(db, { toSummary });
    } catch (e) {
      if (log) log.warn(`SQLite 사용 불가(${e.message}) — 파일 저장소로 동작합니다`);
    }
  }
  return jsonFileImpl.createTuningRepo({ tunings: P.tunings, toSummary, log });
}

/**
 * @param {{paths: object, log?: object, backend?: string}} deps
 * @returns {import('./repository').SnippetRepo}
 */
function createSnippetRepo(deps) {
  const { paths: P, log, backend } = deps;
  const be = resolveBackend(backend);
  if (be === 'sqlite') {
    try {
      const db = getOrOpenDb({ dbPath: P.dbFile(), tunings: P.tunings, snippets: P.snippets, connectionsFile: P.connectionsFile, data: P.data, log });
      return sqliteImpl.createSnippetRepo(db);
    } catch (e) {
      if (log) log.warn(`SQLite 사용 불가(${e.message}) — 파일 저장소로 동작합니다`);
    }
  }
  return jsonFileImpl.createSnippetRepo({ snippets: P.snippets, isInside: P.isInside, log });
}

/**
 * @param {{paths: object, log?: object, backend?: string}} deps
 * @returns {import('./repository').ConnectionRepo}
 */
function createConnectionRepo(deps) {
  const { paths: P, log, backend } = deps;
  const be = resolveBackend(backend);
  if (be === 'sqlite') {
    try {
      const db = getOrOpenDb({ dbPath: P.dbFile(), tunings: P.tunings, snippets: P.snippets, connectionsFile: P.connectionsFile, data: P.data, log });
      return sqliteImpl.createConnectionRepo(db);
    } catch (e) {
      if (log) log.warn(`SQLite 사용 불가(${e.message}) — 파일 저장소로 동작합니다`);
    }
  }
  return jsonFileImpl.createConnectionRepo({ connectionsFile: P.connectionsFile, log });
}

/** 테스트 전용 — dbPath 캐시를 비우고 열린 DB 핸들을 닫는다(임시 DB 파일 정리 전에 호출). */
function closeAllForTests() {
  for (const entry of dbCache.values()) {
    try { if (entry.db) entry.db.close(); } catch (e) { /* noop */ }
  }
  dbCache.clear();
}

module.exports = { createTuningRepo, createSnippetRepo, createConnectionRepo, resolveBackend, closeAllForTests };
