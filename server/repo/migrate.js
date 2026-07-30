'use strict';
/**
 * 파일 저장소 → SQLite 이관.
 *
 * 안전선(FIX-SPEC-slice-G-storage.md G-3):
 *  1. 이관 전 반드시 백업한다(data/, config/connections.json → data/_backup-<타임스탬프>/).
 *     원본은 지우지 않는다.
 *  2. 멱등하다 — 이미 이관된 id/(scope,name) 은 건너뛴다. 여러 번 실행해도 건수가 늘지 않는다.
 *  3. 단일 트랜잭션으로 묶는다. 실패하면 롤백한다(호출자는 그러면 파일 모드로 계속 동작하면 된다).
 */

const fs = require('fs');
const path = require('path');

function copyDirRecursive(src, dest) {
  let entries;
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch (e) {
    return; // 원본이 없으면 백업할 것도 없다
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of entries) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

/**
 * 백업만 수행한다(이관과 분리 — 실패해도 원본 데이터를 다치지 않게).
 * @returns {string} 백업 디렉터리 경로
 */
function backup({ dataDir, tunings, snippets, connectionsFile }) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dataDir, `_backup-${ts}`);
  copyDirRecursive(tunings, path.join(backupDir, 'tunings'));
  copyDirRecursive(snippets, path.join(backupDir, 'snippets'));
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(connectionsFile, path.join(backupDir, 'connections.json'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e; // 접속 프로필이 아직 없으면 백업할 것도 없다
  }
  return backupDir;
}

/**
 * 파일 저장소의 내용을 SQLite repo 로 이관한다. 단일 트랜잭션, 멱등.
 *
 * @param {object} opts
 * @param {import('node:sqlite').DatabaseSync} opts.db
 * @param {ReturnType<import('./json-file').createTuningRepo>} opts.jsonTuningRepo
 * @param {ReturnType<import('./json-file').createSnippetRepo>} opts.jsonSnippetRepo
 * @param {ReturnType<import('./json-file').createConnectionRepo>} opts.jsonConnectionRepo
 * @param {ReturnType<import('./sqlite').createTuningRepo>} opts.sqliteTuningRepo
 * @param {ReturnType<import('./sqlite').createSnippetRepo>} opts.sqliteSnippetRepo
 * @param {ReturnType<import('./sqlite').createConnectionRepo>} opts.sqliteConnectionRepo
 * @param {{info:function, error:function}} [opts.log]
 * @returns {{tunings:number, snippets:number, connections:number}} 실제로 새로 삽입된 건수
 */
function migrate(opts) {
  const { db, jsonTuningRepo, jsonSnippetRepo, jsonConnectionRepo, sqliteTuningRepo, sqliteSnippetRepo, sqliteConnectionRepo, log } = opts;

  const counts = { tunings: 0, snippets: 0, connections: 0 };

  db.exec('BEGIN');
  try {
    for (const rec of jsonTuningRepo.scanRaw()) {
      if (sqliteTuningRepo.insertIfAbsent(rec)) counts.tunings++;
    }
    for (const item of jsonSnippetRepo.scanRaw()) {
      if (sqliteSnippetRepo.insertIfAbsent(item.scope, item.name, item)) counts.snippets++;
    }
    for (const rec of jsonConnectionRepo.list()) {
      if (sqliteConnectionRepo.insertIfAbsent(rec)) counts.connections++;
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* noop */ }
    if (log) log.error(`이관 실패(롤백함): ${e.message}`);
    throw e;
  }

  if (log) log.info(`이관 완료 tunings=${counts.tunings} snippets=${counts.snippets} connections=${counts.connections}`);
  return counts;
}

module.exports = { backup, migrate, copyDirRecursive };
