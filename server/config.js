'use strict';
/**
 * 환경설정 — JDK/JRE 경로, JDBC 드라이버(jar) 경로, 실행 기본값, 저장 위치.
 *
 * 설정은 `config/settings.json` 한 파일에 담는다. 파일이 없거나 일부 키가 비어 있어도
 * 기본값으로 채워 항상 동작하게 만든다(설정 실수로 프로그램이 안 뜨는 상황을 만들지 않는다).
 *
 * 자바 경로 해석 순서:  설정값 → JAVA_HOME → PATH
 * 드라이버 경로 해석:   설정값 → java/lib/*.jar 자동탐색 → (없으면 오류 안내)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const P = require('./paths');

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';

/** 기본 설정. settings.json 은 이 위에 덮어써진다. */
const DEFAULTS = {
  java: {
    /** JDK 또는 JRE 홈 디렉터리. 비우면 JAVA_HOME → PATH 순으로 찾는다. */
    home: '',
    /** JVM 추가 옵션 */
    options: ['-Xmx768m', '-Dfile.encoding=UTF-8', '-Duser.language=ko'],
    /** 브리지 자동 빌드(javac 필요). JRE 만 있으면 false 로 두고 미리 빌드된 out/ 을 쓴다. */
    autoBuild: true
  },
  jdbc: {
    /** ojdbc jar 절대경로 목록. 비우면 java/lib 를 자동 탐색한다. */
    driverPaths: [],
    autoDiscover: true,
    /** 접속 기본값 */
    loginTimeoutSec: 15
  },
  server: {
    host: '127.0.0.1',
    port: 7070,
    openBrowser: true,
    /** API 요청 본문 최대 크기(MB). 1만 줄 넘는 초대형 SQL 대비. */
    maxRequestMb: 64
  },
  execution: {
    /** ResultSet 에서 소비(consume)할 최대 행수. 성능평가를 위해 전체 행을 읽어야 하므로 크게 잡는다. */
    maxRows: 2000000,
    /**
     * 응답에 보관·전송할 행수 상한. maxRows(소비 행수)와 별개다.
     * maxRows 200만을 그대로 보관하면 JVM 힙(-Xmx768m)이 터진다.
     */
    keepRowsMax: 5000,
    fetchSize: 1000,
    timeoutSec: 60,
    benchRuns: 3,
    benchWarmup: 1,
    /** DML/DDL 을 실행하면 자동 롤백 (튜닝 도구의 안전 기본값) */
    safeMode: true,
    /** 실행계획 자동 조회 */
    autoExplain: true
  },
  ui: {
    theme: 'forest',
    skin: 'rounded',
    density: 'normal',
    locale: 'ko',
    fontSize: 13
  }
};

function deepMerge(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch)) return patch !== undefined ? patch : base;
  if (typeof base !== 'object' || typeof patch !== 'object') return patch !== undefined ? patch : base;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    out[k] = (k in base) ? deepMerge(base[k], patch[k]) : patch[k];
  }
  return out;
}

let cache = null;

/**
 * BOM 을 떼고 JSON 을 읽는다.
 *
 * Windows 에서는 메모장·PowerShell 리다이렉트·`Set-Content -Encoding utf8` 가 파일 앞에
 * BOM(U+FEFF)을 붙인다. 그대로 JSON.parse 하면 "Unexpected token" 으로 죽는다.
 * 사용자가 설정 파일을 손으로 고치는 것은 정상적인 사용이므로 여기서 흡수한다.
 */
function readJsonFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
}

/** 설정을 읽는다(캐시). 파일이 깨져 있으면 기본값으로 진행하고 경고를 남긴다. */
function load(force) {
  if (cache && !force) return cache;
  let user = {};
  let parseError = null;
  try {
    if (fs.existsSync(P.settingsFile)) {
      user = readJsonFile(P.settingsFile);
    }
  } catch (e) {
    parseError = e.message;
  }
  cache = deepMerge(DEFAULTS, user);
  cache._parseError = parseError;
  return cache;
}

/** 설정 일부를 병합 저장한다(원자적 쓰기). */
function save(patch) {
  const cur = load(true);
  const next = deepMerge(cur, patch || {});
  delete next._parseError;
  P.ensureDirs();
  const tmp = P.settingsFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, P.settingsFile);
  cache = null;
  return load(true);
}

function defaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

/**
 * settings.json 이 없으면 기본값 그대로 만들어 둔다(있으면 손대지 않는다 — 멱등).
 *
 * ★ 왜 필요한가 (D-03, 2026-07-31 QA-PORTABLE)
 *   포터블을 풀면 `config\` 에는 `.gitkeep` 뿐이고 앱은 settings.json 을 만들지 않았다.
 *   그런데 포트 충돌 안내는 "config\settings.json 의 server.port 를 바꾸세요" 라고 했다.
 *   **없는 파일을 고치라는 안내**였다. 안내가 가리키는 파일은 반드시 존재해야 한다.
 *
 *   기본값 그대로 쓰므로 동작은 달라지지 않는다. 포트도 기본값(7070)으로 적히는데,
 *   이 값은 index.js 의 "사용자가 고른 포트인가" 판정에서 기본값으로 취급되므로
 *   자동 폴백을 막지 않는다(자세한 근거는 index.js resolvePort 주석).
 *
 * @returns {{created: boolean, file: string}}
 */
function ensureSettingsFile() {
  try {
    if (fs.existsSync(P.settingsFile)) return { created: false, file: P.settingsFile };
    P.ensureDirs();
    const tmp = P.settingsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(DEFAULTS, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, P.settingsFile);
    cache = null;
    return { created: true, file: P.settingsFile };
  } catch (e) {
    // 설정 파일을 못 만든다고 프로그램이 안 뜨면 안 된다(읽기 전용 위치 등).
    return { created: false, file: P.settingsFile, error: e.message };
  }
}

// ── 자바 경로 해석 ──────────────────────────────────────────────────────────

function binIn(home, name) {
  if (!home) return null;
  const p = path.join(home, 'bin', name + EXE);
  return fs.existsSync(p) ? p : null;
}

function fromPath(name) {
  const which = IS_WIN ? 'where' : 'which';
  try {
    const out = execFileSync(which, [name], { encoding: 'utf8', timeout: 5000 });
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    return first && fs.existsSync(first) ? first : null;
  } catch (e) {
    return null;
  }
}

/**
 * 실행에 쓸 java/javac 경로를 정한다.
 * @returns {{java:string|null, javac:string|null, home:string|null, source:string, version:string|null, error:string|null}}
 */
function resolveJava(cfg) {
  const c = cfg || load();
  const candidates = [];
  if (c.java && c.java.home) candidates.push({ home: c.java.home, source: 'settings.java.home' });

  // ★ 동봉 JRE 를 JAVA_HOME·PATH 보다 **먼저** 본다 (2026-07-31 실사용 결함 D-02).
  //   "JRE 포함판"은 Java 가 없는 PC 를 위해 만든 물건인데, resolveJava 가
  //   settings → JAVA_HOME → PATH 만 보느라 <앱루트>\runtime\jre 를 못 찾았다.
  //   JAVA_HOME 을 넣어주는 곳은 OracleTuner.bat 한 곳뿐이었고,
  //   바로가기가 가리키는 트레이 런처(OracleTuner.exe)는 환경변수를 손대지 않는다.
  //   ⇒ 설치판·포터블 모두, 권장 실행 경로에서 동봉 JRE 가 무시됐다.
  //     ("따로 설치할 필요 없습니다"라는 README 가 사실이 아니게 된다.)
  //   런처가 무엇이든 앱 스스로 찾게 하는 것이 옳다. 그래서 여기서 해결한다.
  //   순서: 사용자가 명시한 설정 > 동봉 JRE > 시스템(JAVA_HOME/PATH).
  //   동봉본을 시스템보다 앞에 두는 이유 — 포함판을 받은 사용자는 그 JRE 로 도는 것을 기대한다.
  const bundled = path.join(P.root, 'runtime', 'jre');
  if (binIn(bundled, 'java')) candidates.push({ home: bundled, source: '동봉 JRE(runtime/jre)' });

  if (process.env.JAVA_HOME) candidates.push({ home: process.env.JAVA_HOME, source: 'JAVA_HOME' });

  for (const cand of candidates) {
    const home = String(cand.home).replace(/[\\/]+$/, '');
    const java = binIn(home, 'java');
    if (java) {
      return { java, javac: binIn(home, 'javac'), home, source: cand.source, version: javaVersion(java), error: null };
    }
  }
  const java = fromPath('java');
  if (java) {
    const home = path.resolve(path.dirname(java), '..');
    return { java, javac: binIn(home, 'javac') || fromPath('javac'), home, source: 'PATH', version: javaVersion(java), error: null };
  }
  return {
    java: null, javac: null, home: null, source: 'none', version: null,
    error: 'java 실행 파일을 찾지 못했습니다. 설정에서 JDK/JRE 홈 경로를 지정하세요.'
  };
}

/**
 * `java -version` 의 첫 줄.
 * 주의: java 는 버전을 <b>stderr</b> 로 출력한다. execFileSync 는 stdout 만 돌려주므로
 * 두 스트림을 모두 받는 spawnSync 를 쓴다(이 함정 때문에 버전이 빈칸으로 나오는 일이 흔하다).
 */
function javaVersion(javaBin) {
  try {
    const r = spawnSync(javaBin, ['-version'], { encoding: 'utf8', timeout: 8000 });
    const out = `${r.stderr || ''}${r.stdout || ''}`.trim();
    return out ? out.split(/\r?\n/)[0].trim() : null;
  } catch (e) {
    return null;
  }
}

/** 흔한 위치에서 JDK/JRE 후보를 찾아 설정 화면에 제시한다. */
function discoverJavaHomes() {
  const found = [];
  const seen = new Set();
  const add = (home, source) => {
    if (!home) return;
    const norm = path.resolve(home);
    if (seen.has(norm.toLowerCase())) return;
    if (!binIn(norm, 'java')) return;
    seen.add(norm.toLowerCase());
    found.push({ home: norm, source, hasJavac: !!binIn(norm, 'javac'), version: javaVersion(binIn(norm, 'java')) });
  };

  // 동봉 JRE 를 목록 맨 앞에 둔다 — 설정 화면의 "발견된 JDK/JRE" 후보에도 떠야
  // 사용자가 직접 고를 수 있다(D-02 에서 후보에조차 안 나타나 회피할 방법이 없었다).
  add(path.join(P.root, 'runtime', 'jre'), '동봉 JRE(runtime/jre)');

  if (process.env.JAVA_HOME) add(process.env.JAVA_HOME, 'JAVA_HOME');
  const j = fromPath('java');
  if (j) add(path.resolve(path.dirname(j), '..'), 'PATH');

  const roots = IS_WIN
    ? ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft',
       'C:\\Program Files\\Amazon Corretto', 'C:\\Program Files\\Zulu', 'C:\\Program Files (x86)\\Java']
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', '/opt/java'];

  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      for (const name of fs.readdirSync(root)) {
        const home = path.join(root, name);
        add(home, root);
        // macOS 는 Contents/Home 한 단계 더
        add(path.join(home, 'Contents', 'Home'), root);
      }
    } catch (e) { /* 접근 불가 디렉터리는 건너뛴다 */ }
  }
  return found;
}

// ── JDBC 드라이버 해석 ──────────────────────────────────────────────────────

/** 설정에 지정된 드라이버 jar + 자동탐색 결과를 합쳐 돌려준다. */
function resolveDriverJars(cfg) {
  const c = cfg || load();
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (!p) return;
    const abs = path.isAbsolute(p) ? p : path.join(P.root, p);
    const key = abs.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ path: abs, exists: fs.existsSync(abs) });
  };
  for (const p of (c.jdbc.driverPaths || [])) add(p);
  if (c.jdbc.autoDiscover !== false) {
    for (const p of discoverDriverJars()) add(p);
  }
  return out;
}

/** java/lib 및 흔한 위치에서 ojdbc jar 를 찾는다. */
function discoverDriverJars() {
  const found = [];
  const scan = (dir) => {
    try {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (/^(ojdbc\d*|orai18n|oraclepki|osdt_\w+|ucp\d*|xdb\d*)\.jar$/i.test(name)) {
          found.push(path.join(dir, name));
        }
      }
    } catch (e) { /* 무시 */ }
  };
  scan(P.javaLib);
  scan(path.join(P.root, 'lib'));
  if (process.env.ORACLE_HOME) scan(path.join(process.env.ORACLE_HOME, 'jdbc', 'lib'));
  return found;
}

/** 브리지에 넘길 클래스패스 문자열(존재하는 jar 만). */
function driverClasspath(cfg) {
  return resolveDriverJars(cfg).filter((j) => j.exists).map((j) => j.path);
}

// ── 진단 ───────────────────────────────────────────────────────────────────

/** 설정 화면에 띄울 상태 진단. 무엇이 준비됐고 무엇이 빠졌는지 그대로 드러낸다. */
function diagnose() {
  const cfg = load(true);
  const java = resolveJava(cfg);
  const jars = resolveDriverJars(cfg);
  const usable = jars.filter((j) => j.exists);
  const items = [];

  items.push({
    key: 'java',
    label: 'Java 런타임',
    ok: !!java.java,
    detail: java.java ? `${java.version || ''} (${java.source})\n${java.java}` : java.error,
    hint: java.java ? null : '설정 > Java 홈 경로에 JDK 또는 JRE 디렉터리를 지정하세요.'
  });
  items.push({
    key: 'javac',
    label: 'Java 컴파일러(javac)',
    ok: !!java.javac,
    detail: java.javac || '없음 — JRE 만 설치된 환경으로 보입니다.',
    hint: java.javac ? null : 'JRE 만 있으면 브리지를 빌드할 수 없습니다. 이미 빌드된 java/out 이 있으면 그대로 동작합니다.',
    severity: java.javac ? 'ok' : 'warn'
  });
  items.push({
    key: 'driver',
    label: 'Oracle JDBC 드라이버',
    ok: usable.length > 0,
    detail: usable.length > 0
      ? usable.map((j) => j.path).join('\n')
      : 'ojdbc jar 를 찾지 못했습니다.',
    hint: usable.length > 0 ? null
      : 'java/lib 폴더에 ojdbc11.jar(또는 ojdbc8.jar)를 넣거나, 설정에서 경로를 직접 지정하세요. `npm run fetch-driver` 로 내려받을 수도 있습니다.'
  });
  const built = fs.existsSync(path.join(P.javaOut, 'kr', 'foxnail', 'otuner', 'Bridge.class'));
  items.push({
    key: 'bridge',
    label: 'JDBC 브리지 빌드',
    ok: built,
    detail: built ? P.javaOut : '아직 빌드되지 않았습니다.',
    hint: built ? null : '`npm run build:java` 를 실행하거나 서버를 재시작하면 자동으로 빌드합니다.'
  });
  if (cfg._parseError) {
    items.push({
      key: 'settings',
      label: 'settings.json',
      ok: false,
      detail: `설정 파일을 읽지 못했습니다: ${cfg._parseError}`,
      hint: '기본값으로 동작 중입니다. 파일을 고치거나 삭제하세요.'
    });
  }
  return {
    ok: items.every((i) => i.ok || i.severity === 'warn'),
    items,
    java,
    jars,
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    settingsFile: P.settingsFile
  };
}

module.exports = {
  readJsonFile,
  load, save, defaults, DEFAULTS, ensureSettingsFile,
  resolveJava, discoverJavaHomes,
  resolveDriverJars, discoverDriverJars, driverClasspath,
  diagnose, deepMerge
};

// ── CLI (설치 위저드가 자식 프로세스로 호출 — FIX-SPEC-slice-H Phase 3) ──────────
//
// installer/wizard.ps1 은 PowerShell 이라 이 모듈을 직접 require 할 수 없다. 아래 CLI 는
// 기존 JDK 탐색 로직(discoverJavaHomes/resolveJava)을 그대로 감싸기만 한다 — 새로 만들지
// 않는다("server/config.js 의 기존 JDK 탐색을 재사용하라(새로 구현하지 마라)").
//
//   node server/config.js --discover-java
//     → [{"home":"...","source":"...","hasJavac":true,"version":"..."}, ...]
//   node server/config.js --check-java "C:\Path\To\JDK"
//     → {"java":"...","javac":"...","home":"...","source":"...","version":"...","error":null}
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === '--discover-java') {
    process.stdout.write(JSON.stringify(discoverJavaHomes()) + '\n');
  } else if (cmd === '--check-java') {
    const home = args[1] || '';
    process.stdout.write(JSON.stringify(resolveJava({ java: { home } })) + '\n');
  } else {
    process.stderr.write('사용법: node config.js --discover-java | --check-java <home>\n');
    process.exitCode = 2;
  }
}
