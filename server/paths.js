'use strict';
/**
 * 경로 해석 한 곳 모음.
 *
 * 모든 상대경로는 프로젝트 루트 기준으로 푼다. 설치 위치가 바뀌어도(USB, 다른 드라이브)
 * 그대로 동작해야 하므로 어디에서도 절대경로를 하드코딩하지 않는다.
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

const P = {
  root: ROOT,
  server: path.join(ROOT, 'server'),
  shared: path.join(ROOT, 'shared'),
  web: path.join(ROOT, 'web'),
  java: path.join(ROOT, 'java'),
  javaSrc: path.join(ROOT, 'java', 'src'),
  javaOut: path.join(ROOT, 'java', 'out'),
  javaLib: path.join(ROOT, 'java', 'lib'),
  config: path.join(ROOT, 'config'),
  data: path.join(ROOT, 'data'),
  tunings: path.join(ROOT, 'data', 'tunings'),
  snippets: path.join(ROOT, 'data', 'snippets'),
  logs: path.join(ROOT, 'logs'),
  vendor: path.join(ROOT, 'web', 'vendor'),
  nodeModules: path.join(ROOT, 'node_modules'),

  settingsFile: path.join(ROOT, 'config', 'settings.json'),
  connectionsFile: path.join(ROOT, 'config', 'connections.json'),
  keyFile: path.join(ROOT, 'config', 'secret.key'),
  buildStamp: path.join(ROOT, 'java', 'out', '.build-stamp.json')
};

/**
 * SQLite DB 파일 경로 (항목 #4). 기본은 `data/oracletuner.db`.
 *
 * <p>⚠ 항목 #6(설치판)에서 `%LOCALAPPDATA%` 로 데이터 위치를 분리할 때 이 함수 <b>한 곳만</b>
 * 고치면 되도록 만들어졌다 — 경로 정책 자체(P.data 등)는 여기서 바꾸지 않는다.
 */
function dbFile() {
  return path.join(P.data, 'oracletuner.db');
}

/** 필요한 디렉터리를 만든다(이미 있으면 그냥 둔다). */
function ensureDirs() {
  for (const d of [P.config, P.data, P.tunings, P.snippets, P.logs, P.javaLib]) {
    try {
      fs.mkdirSync(d, { recursive: true });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

/** 경로가 base 안에 있는지 검사한다(정적 파일 서빙의 경로 탈출 방지). */
function isInside(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

module.exports = { ...P, ensureDirs, isInside, dbFile };
