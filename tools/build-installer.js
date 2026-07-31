'use strict';
/**
 * 설치판(윈도우 인스톨러) 빌드.
 *
 * **Inno Setup**(ISCC.exe)으로 만든다. 스크립트는 `installer/OracleTuner.iss`.
 *
 * 처음에는 IExpress(윈도우 내장 자가압축)를 썼다. `where iscc` 가 비어 있다는 이유로
 * "이 머신에 Inno Setup 이 없다"고 판단한 오판 때문이었다 — Inno 는 PATH 를 건드리지 않고
 * %LOCALAPPDATA%\Programs\Inno Setup 6 에 설치되므로 그렇게 확인하면 안 됐다.
 * IExpress 판은 자가압축 도구일 뿐이라 이런 대가를 치렀다:
 *   · 실행하면 콘솔 창이 두 개 뜬다(cmd + powershell)
 *   · 제거 프로그램 목록에 등록되지 않는다
 *   · 언어 선택·라이선스 페이지를 PowerShell WinForms 로 전부 손으로 만들어야 했다
 *   · 서명이 없어 보안 소프트웨어(V3/AppLocker)가 실행을 막았다
 * Inno 는 앞의 셋이 전부 기본 기능이다. 그래서 갈아탔다.
 *
 * 스테이징 구조(installer/OracleTuner.iss 의 [Files] 가 이 구조를 전제한다 — 같이 바꿔야 한다):
 *   server/, web/, shared/, java/(src,out,lib), package.json, LICENSE, node_modules/open-grid
 *   runtime/node.exe (+ 선택적 runtime/jre/)
 *
 * manifest.json(dist/manifest-<version>.json) — 다음 버전에서 패치 설치파일을 만들 때
 * 이전 버전과 파일 해시를 비교하기 위한 것이다(D-002-a). "app 으로 패치 교체되는 부분"
 * (server/web/shared/java/out/java/lib/package.json)만 담는다 — runtime 은 거의 불변이라
 * 대상에서 뺀다.
 *
 * 사용: node tools/build-installer.js [--with-jre]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const P = require('../server/paths');
const portable = require('./build-portable');
const tray = require('./build-tray');

const VERSION = require('../package.json').version + '-beta.4';
const DIST = path.join(P.root, 'dist');

/** 스테이징에 그대로 복사하는 "app" 항목(패치 설치파일이 나중에 교체할 부분과 정확히 일치). */
const APP_ITEMS = ['server', 'web', 'shared', 'java/src', 'java/out', 'java/build.js', 'package.json', 'LICENSE'];

/** manifest 해시 대상 — 패치가 실제로 교체하는 최소 집합(런타임 실행에 필요한 것만). */
const MANIFEST_ITEMS = ['server', 'web', 'shared', 'java/out', 'java/lib', 'package.json'];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function isJunk(src) {
  const base = path.basename(src);
  return base === '.omc' || base === '.git' || base === '.vscode' || base === '.DS_Store' || base === 'Thumbs.db';
}

/** 배포 스테이징 디렉터리를 만든다(installer/wizard.ps1 의 $SourceRoot 가 될 폴더). */
function stage(withJre) {
  const tag = withJre ? 'with-jre' : 'no-jre';
  const name = `oracle-tuner-${VERSION}-installer-win-x64-${tag}`;
  const stageDir = path.join(DIST, name);
  console.log(`\n■ ${name}`);
  rmrf(stageDir);
  fs.mkdirSync(stageDir, { recursive: true });

  for (const item of APP_ITEMS) {
    const src = path.join(P.root, item);
    if (!fs.existsSync(src)) { console.log(`  (건너뜀) ${item}`); continue; }
    const dst = path.join(stageDir, item);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true, filter: (from) => !isJunk(from) });
  }
  const jar = path.join(P.root, 'java', 'lib', 'ojdbc11.jar');
  if (fs.existsSync(jar)) {
    fs.mkdirSync(path.join(stageDir, 'java', 'lib'), { recursive: true });
    fs.cpSync(jar, path.join(stageDir, 'java', 'lib', 'ojdbc11.jar'));
  }
  const ogSrc = path.join(P.root, 'node_modules', 'open-grid');
  if (fs.existsSync(ogSrc)) {
    fs.cpSync(ogSrc, path.join(stageDir, 'node_modules', 'open-grid'), { recursive: true, filter: (from) => !isJunk(from) });
  }

  // installer/ 는 스테이징에 넣지 않는다. 위저드 UI(언어 선택·라이선스·경로·포트)는
  // 이제 Inno 가 담당하고, 실행 런처(OracleTuner.vbs)는 .iss 가 직접 가져다 넣는다.

  // 트레이 런처(OracleTuner.exe) — 바로가기가 가리키는 실제 실행 파일이다.
  // 실패하면 예외가 올라와 빌드가 선다. 트레이 없는 설치판은 "실행 수단이 없는 설치판"이라
  // 조용히 넘기면 안 된다(tools/build-tray.js 머리말 참조).
  tray.buildTray(stageDir);

  // node/JRE 번들 — tools/build-portable.js 의 로직을 그대로 재사용한다(중복 구현 금지).
  const nodeExe = portable.copyNode(stageDir);
  console.log('  Node 런타임 포함:', nodeExe);
  if (withJre) {
    const jre = portable.buildJre(stageDir);
    if (!jre) console.log('  → jlink 실패로 JRE 를 포함하지 못했습니다(시스템 JDK 선택 안내는 위저드가 함).');
    else console.log('  내장 JRE 생성 완료');
  }

  return { stageDir, name, nodeExe };
}

/** 번들 node 실제 버전을 확인한다. node:sqlite 는 Node 22+ 전용(그 미만이면 파일 저장소로 폴백). */
function checkBundledNodeVersion(stageDir, nodeExe) {
  const exePath = path.join(stageDir, 'runtime', nodeExe);
  const r = spawnSync(exePath, ['--version'], { encoding: 'utf8' });
  const verStr = (r.stdout || '').trim(); // 예: "v24.15.0"
  const major = verStr.startsWith('v') ? parseInt(verStr.slice(1).split('.')[0], 10) : NaN;
  const ok = Number.isFinite(major) && major >= 22;
  console.log(`  번들 Node 버전: ${verStr || '(확인 실패)'} — ${ok ? 'OK (node:sqlite 사용 가능)' : '⚠ 22 미만: node:sqlite 미지원 → SQLite 저장소가 파일 모드로 폴백합니다(죽지는 않음). 상향 권고.'}`);
  return { version: verStr, major: Number.isFinite(major) ? major : null, sqliteCapable: ok };
}

// ── manifest ────────────────────────────────────────────────────────────

function sha256File(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function walkFiles(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (isJunk(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walkFiles(full, base));
    else out.push(full);
  }
  return out;
}

/** app(패치 대상) 파일들의 해시 목록을 만든다. 경로는 항상 슬래시(/)로 통일한다(OS 무관 비교). */
function buildManifest(stageDir) {
  const files = [];
  for (const item of MANIFEST_ITEMS) {
    const abs = path.join(stageDir, item);
    if (!fs.existsSync(abs)) continue;
    const st = fs.statSync(abs);
    const list = st.isDirectory() ? walkFiles(abs, stageDir) : [abs];
    for (const f of list) {
      const rel = path.relative(stageDir, f).split(path.sep).join('/');
      files.push({ path: rel, sha256: sha256File(f), size: fs.statSync(f).size });
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { version: VERSION, generatedAt: new Date().toISOString(), files };
}

/**
 * ISCC.exe(Inno Setup 컴파일러)를 찾는다.
 *
 * PATH 에 없는 게 정상이다 — Inno Setup 은 기본적으로 사용자 폴더
 * (%LOCALAPPDATA%\Programs\Inno Setup 6)에 설치되고 PATH 를 건드리지 않는다.
 * 그래서 `where iscc` 만 보고 "없다"고 판단하면 안 된다(실제로 그렇게 오판해
 * IExpress 로 우회하느라 시간을 버린 적이 있다). 알려진 위치를 모두 뒤진다.
 */
function findIscc() {
  const cands = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env.ProgramFiles || '', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe')
  ];
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  const r = spawnSync('where', ['iscc'], { encoding: 'utf8' });
  if (r.status === 0) {
    const first = (r.stdout || '').split(/\r?\n/).find((l) => l.trim());
    if (first && fs.existsSync(first.trim())) return first.trim();
  }
  return null;
}

/**
 * Inno Setup 으로 설치 exe 를 만든다.
 *
 * IExpress 를 쓰다가 갈아탔다. IExpress 는 자가압축 도구일 뿐이라
 * 제거 프로그램 등록·언어 선택·라이선스 페이지를 전부 손으로 만들어야 했고,
 * 실행하면 콘솔 창이 두 개 떴다(cmd + powershell). Inno 는 그게 전부 기본 기능이다.
 *
 * 실패해도 예외를 던지지 않고 결과 객체로 알려준다 — 빌드 스크립트가 죽기보다
 * "무엇이 안 됐는지" 를 드러내는 편이 낫다(config.js 의 진단 철학과 동일).
 */
function buildExeWithInno(stageDir, version, withJre) {
  const iscc = findIscc();
  if (!iscc) {
    return {
      ok: false,
      error: 'ISCC.exe(Inno Setup 6)를 찾지 못했습니다. ' +
             'winget install JRSoftware.InnoSetup 또는 https://jrsoftware.org 에서 설치하세요.'
    };
  }
  const iss = path.join(P.root, 'installer', 'OracleTuner.iss');
  if (!fs.existsSync(iss)) return { ok: false, error: `스크립트 없음: ${iss}` };

  const outDir = path.join(P.root, 'installer', 'Output');
  fs.mkdirSync(outDir, { recursive: true });

  // Java 내장 빌드는 파일 이름을 달리 한다. 안 그러면 두 빌드가 같은 이름으로 나와
  // 나중에 돌린 쪽이 앞의 설치판을 조용히 덮어쓴다.
  const suffix = withJre ? '-with-jre' : '';

  console.log(`  ISCC: ${iscc}`);
  const r = spawnSync(iscc, [`/DSrcDir=${stageDir}`, `/DOutSuffix=${suffix}`, iss], { encoding: 'utf8' });
  const targetExe = path.join(outDir, `OracleTuner-${version}${suffix}-Setup.exe`);
  const ok = r.status === 0 && fs.existsSync(targetExe);
  if (ok) {
    const size = fs.statSync(targetExe).size;
    console.log(`  생성됨: ${path.basename(targetExe)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    return { ok: true, exePath: targetExe, size };
  }
  const tail = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter(Boolean).slice(-6).join('\n');
  console.log(`  ISCC 실패(status=${r.status}):\n${tail}`);
  return { ok: false, error: tail || `exit ${r.status}` };
}

// ── 오케스트레이션 ───────────────────────────────────────────────────────────

function build(withJre) {
  const { stageDir, nodeExe } = stage(withJre);
  const nodeInfo = checkBundledNodeVersion(stageDir, nodeExe);

  const manifest = buildManifest(stageDir);
  fs.mkdirSync(DIST, { recursive: true });
  const manifestPath = path.join(DIST, `manifest-${VERSION}${withJre ? '-with-jre' : '-no-jre'}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  manifest: ${path.basename(manifestPath)} (파일 ${manifest.files.length}개)`);

  const exeResult = buildExeWithInno(stageDir, VERSION, withJre);

  return { stageDir, nodeInfo, manifestPath, manifest, exeResult };
}

function main() {
  const args = process.argv.slice(2);
  const withJre = args.includes('--with-jre');
  const result = build(withJre);

  console.log('\n완료 — dist/ 폴더');
  console.log(`  스테이징: ${result.stageDir}`);
  console.log(`  manifest: ${result.manifestPath}`);
  if (result.exeResult.ok) {
    console.log(`  설치 EXE: ${result.exeResult.exePath} (${(result.exeResult.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log(`  설치 EXE 생성 실패 — ${result.exeResult.error}`);
  }
}

if (require.main === module) main();
module.exports = { build, buildManifest, checkBundledNodeVersion, VERSION };
