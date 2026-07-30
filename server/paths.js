'use strict';
/**
 * 경로 해석 한 곳 모음.
 *
 * 앱 파일(server/web/shared/java)은 항상 이 모듈 파일 기준 상대경로로 푼다. 설치 위치가
 * 바뀌어도(USB, 다른 드라이브, Program Files) 그대로 동작해야 하므로 앱 파일 경로는
 * 어디에서도 절대경로를 하드코딩하지 않는다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 항목 #6(설치판) — 데이터 경로(config/data/logs/DB)는 앱 파일 경로와 분리한다.
 *
 * "Program Files 에 설치하면 접속정보 저장 시 쓰기 권한 오류가 난다"는 발주자 지적의
 * 본체다. 앱 파일은 읽기 전용 위치에 설치될 수 있지만, 사용자 데이터는 항상 쓰기 가능한
 * 위치에 있어야 한다. 그래서 실행 모드에 따라 데이터 루트(DATA_ROOT)를 다르게 잡는다.
 *
 * 모드 판정 우선순위:
 *   1) ORACLE_TUNER_DATA_DIR 환경변수 — 진단/테스트용 최우선 강제 지정
 *   2) portable.marker 파일(ROOT 바로 아래) — tools/build-portable.js 가 포터블 zip 루트에
 *      심는다. 포터블은 USB 이동성을 위해 데이터를 앱 폴더 상대경로에 둔다(기존 동작).
 *   3) .git 디렉터리(ROOT 바로 아래) — 리포 체크아웃(개발 환경)의 신뢰할 수 있는 표식.
 *      ⚠ package.json 존재 여부는 판정 기준으로 쓰지 않는다: installer/wizard.ps1 이 만드는
 *      설치 레이아웃(<설치폴더>\app\)에도 패치 교체 대상으로 package.json 이 그대로 복사되어
 *      들어가므로(FIX-SPEC-slice-H Phase 3 설치 레이아웃) package.json 유무로는 개발/설치를
 *      구분할 수 없다. 반면 .git 은 배포 산출물(포터블 zip, 설치판 app/ 폴더)에 전혀 포함되지
 *      않으므로(build-portable.js 의 isJunk() 가 .git 을 걸러낸다) 안전한 판정 근거가 된다.
 *      개발 환경은 포터블과 마찬가지로 리포 안 data/·config/ 를 그대로 써야 한다(기존 동작
 *      유지 — 개발자가 npm start 했을 때 갑자기 %LOCALAPPDATA% 를 쓰면 혼란스럽다).
 *   4) 그 외(위 셋 다 아님) — 설치 모드: %LOCALAPPDATA%\OracleTuner\ 를 데이터 루트로 쓴다.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');

/**
 * 실행 모드 + 데이터 루트 판정 — 순수 함수로 뺐다(rootDir/env 를 인자로 받는다).
 *
 * 실제 실행 시에는 아래에서 `resolveMode(ROOT, process.env)` 로 호출한다. 순수 함수로 뺀
 * 이유는 테스트 때문이다: 이 리포 자체가 항상 .git 을 갖고 있어서 '설치 모드'(.git 도
 * portable.marker 도 없는 경우) 분기는 실제 ROOT 로는 재현할 수 없다 — 테스트에서 임의의
 * 임시 디렉터리를 rootDir 로 넘겨 네 가지 분기를 전부 검증한다(test/run-tests.js 참고).
 *
 * @returns {{mode: 'env'|'portable'|'dev'|'installed', dataRoot: string}}
 */
function resolveMode(rootDir, env) {
  let mode;
  if (env.ORACLE_TUNER_DATA_DIR) mode = 'env';
  else if (fs.existsSync(path.join(rootDir, 'portable.marker'))) mode = 'portable';
  else if (fs.existsSync(path.join(rootDir, '.git'))) mode = 'dev';
  else mode = 'installed';

  let dataRoot;
  if (mode === 'env') dataRoot = path.resolve(env.ORACLE_TUNER_DATA_DIR);
  else if (mode === 'installed') {
    const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    dataRoot = path.join(localAppData, 'OracleTuner');
  } else {
    // portable, dev: 앱 루트 상대경로(기존 동작 그대로)
    dataRoot = rootDir;
  }
  return { mode, dataRoot };
}

const { mode: MODE, dataRoot: DATA_ROOT } = resolveMode(ROOT, process.env);

const P = {
  root: ROOT,
  /** 현재 실행 모드('env'|'portable'|'dev'|'installed'). 진단·위저드에서 표시용으로 쓴다. */
  mode: MODE,
  /** config/data/logs 가 실제로 놓이는 상위 폴더. */
  dataRoot: DATA_ROOT,

  server: path.join(ROOT, 'server'),
  shared: path.join(ROOT, 'shared'),
  web: path.join(ROOT, 'web'),
  java: path.join(ROOT, 'java'),
  javaSrc: path.join(ROOT, 'java', 'src'),
  javaOut: path.join(ROOT, 'java', 'out'),
  javaLib: path.join(ROOT, 'java', 'lib'),

  config: path.join(DATA_ROOT, 'config'),
  data: path.join(DATA_ROOT, 'data'),
  tunings: path.join(DATA_ROOT, 'data', 'tunings'),
  snippets: path.join(DATA_ROOT, 'data', 'snippets'),
  logs: path.join(DATA_ROOT, 'logs'),
  vendor: path.join(ROOT, 'web', 'vendor'),
  nodeModules: path.join(ROOT, 'node_modules'),

  settingsFile: path.join(DATA_ROOT, 'config', 'settings.json'),
  connectionsFile: path.join(DATA_ROOT, 'config', 'connections.json'),
  keyFile: path.join(DATA_ROOT, 'config', 'secret.key'),
  buildStamp: path.join(ROOT, 'java', 'out', '.build-stamp.json')
};

/**
 * SQLite DB 파일 경로 (항목 #4). 기본은 `<데이터루트>/data/oracletuner.db`.
 *
 * <p>항목 #6(설치판)에서 데이터 위치를 분리할 때 이 함수 <b>한 곳만</b> 고치면 되도록
 * 만들어졌다 — P.data 가 이미 모드별로 갈리므로 여기서는 그 아래 파일명만 붙인다.
 */
function dbFile() {
  return path.join(P.data, 'oracletuner.db');
}

/**
 * 설치 모드 최초 실행 시: 앱 루트(개발/포터블 잔재)에 있던 기존 config/connections.json 을
 * 새 데이터 루트(%LOCALAPPDATA%)로 복사한다(이동 아님 — 원본은 그대로 둔다).
 *
 * 설치 모드가 아니면 아무것도 하지 않는다. 대상 파일이 이미 있으면 건드리지 않는다(멱등).
 *
 * ⚠ logger.js 는 이 모듈(P)을 require 하므로, 여기서 logger 를 require 하면 순환 참조가
 * 생겨 logger 가 미완성 상태의 P 를 받는다. 그래서 이관 안내는 console 로 직접 남긴다.
 */
function migrateLegacyConnectionsIfNeeded() {
  if (MODE !== 'installed') return;
  try {
    const legacy = path.join(ROOT, 'config', 'connections.json');
    const target = P.connectionsFile;
    if (fs.existsSync(legacy) && !fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(legacy, target);
      console.log(`[paths] 설치 모드 최초 실행 — 기존 접속정보를 이관했습니다: ${legacy} → ${target} (원본은 유지)`);
    }
  } catch (e) {
    console.warn(`[paths] 접속정보 이관 중 오류(무시하고 계속 진행합니다): ${e.message}`);
  }
}

/** 필요한 디렉터리를 만든다(이미 있으면 그냥 둔다). 설치 모드 최초 실행 이관도 여기서 함께 처리한다. */
function ensureDirs() {
  migrateLegacyConnectionsIfNeeded();
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

module.exports = { ...P, ensureDirs, isInside, dbFile, resolveMode };
