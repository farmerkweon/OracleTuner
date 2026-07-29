'use strict';
/**
 * JDBC 브리지 빌드 스크립트.
 *
 * 설정(config/settings.json)의 Java 홈 → JAVA_HOME → PATH 순으로 javac 를 찾아
 * `java/src` 를 `java/out` 으로 컴파일한다.
 *
 * - `--release 11` 로 컴파일해 JDK 11+ / JRE 11+ 어디서든 로드되게 한다.
 * - 소스가 out 보다 새로울 때만 다시 빌드한다(서버 기동 시 자동호출 대비).
 * - ojdbc jar 는 컴파일 시점에 필요 없다(런타임에 URLClassLoader 로 로드).
 *
 * 사용: `npm run build:java` 또는 `node java/build.js --force`
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const P = require('../server/paths');
const config = require('../server/config');

const TARGET_RELEASE = '11';

/** src 하위 .java 전체 목록 */
function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.java')) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function newestMtime(files) {
  let m = 0;
  for (const f of files) {
    const t = fs.statSync(f).mtimeMs;
    if (t > m) m = t;
  }
  return m;
}

function readStamp() {
  try {
    return JSON.parse(fs.readFileSync(P.buildStamp, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * 필요하면 빌드한다.
 * @returns {{built:boolean, skipped:boolean, ok:boolean, message:string, javac?:string, output?:string}}
 */
function build(opts) {
  const options = opts || {};
  const sources = sourceFiles(P.javaSrc);
  if (sources.length === 0) {
    return { built: false, skipped: true, ok: false, message: `소스를 찾지 못했습니다: ${P.javaSrc}` };
  }

  const srcMtime = newestMtime(sources);
  const stamp = readStamp();
  const bridgeClass = path.join(P.javaOut, 'kr', 'foxnail', 'otuner', 'Bridge.class');
  const upToDate = !options.force && stamp && fs.existsSync(bridgeClass) &&
    stamp.srcMtime >= srcMtime && stamp.fileCount === sources.length;

  if (upToDate) {
    return { built: false, skipped: true, ok: true, message: '최신 상태 — 빌드 생략' };
  }

  const java = config.resolveJava();
  if (!java.javac) {
    const haveClasses = fs.existsSync(bridgeClass);
    return {
      built: false,
      skipped: true,
      ok: haveClasses,
      message: haveClasses
        ? 'javac 가 없어 빌드를 건너뛰었습니다. 기존에 빌드된 클래스를 사용합니다.'
        : 'javac 를 찾을 수 없어 브리지를 빌드할 수 없습니다. 설정에서 JDK 홈을 지정하세요.'
    };
  }

  fs.mkdirSync(P.javaOut, { recursive: true });

  // 인자 목록이 길어질 수 있으므로 @argfile 을 쓴다(Windows 명령행 길이 제한 회피).
  const argFile = path.join(P.javaOut, '.sources.txt');
  fs.writeFileSync(argFile, sources.map((s) => `"${s.replace(/\\/g, '/')}"`).join('\n'), 'utf8');

  const args = [
    '-encoding', 'UTF-8',
    '--release', TARGET_RELEASE,
    '-Xlint:-options',
    '-d', P.javaOut,
    '@' + argFile
  ];

  const r = spawnSync(java.javac, args, { encoding: 'utf8', timeout: 180000 });
  const output = [r.stdout || '', r.stderr || ''].join('').trim();

  if (r.error) {
    return { built: false, skipped: false, ok: false, javac: java.javac, message: `javac 실행 실패: ${r.error.message}`, output };
  }
  if (r.status !== 0) {
    return { built: false, skipped: false, ok: false, javac: java.javac, message: `컴파일 오류(exit ${r.status})`, output };
  }

  fs.writeFileSync(P.buildStamp, JSON.stringify({
    builtAt: new Date().toISOString(),
    javac: java.javac,
    javaVersion: java.version,
    release: TARGET_RELEASE,
    srcMtime,
    fileCount: sources.length
  }, null, 2), 'utf8');

  return {
    built: true, skipped: false, ok: true, javac: java.javac,
    message: `${sources.length}개 소스를 컴파일했습니다 → ${P.javaOut}`,
    output
  };
}

if (require.main === module) {
  P.ensureDirs();
  const force = process.argv.includes('--force');
  const r = build({ force });
  if (r.output) console.log(r.output);
  console.log((r.ok ? '[OK] ' : '[FAIL] ') + r.message);
  process.exit(r.ok ? 0 : 1);
}

module.exports = { build, sourceFiles };
