'use strict';
/**
 * 설치판(윈도우 인스톨러) 빌드. FIX-SPEC-slice-H Phase 4.
 *
 * NSIS·Inno Setup 이 이 폐쇄망 머신에 없어(D-002 실측) IExpress(윈도우 내장 자가압축 EXE
 * 생성기)를 쓴다. IExpress 는 GUI/SED 파일 모두 "개별 파일" 목록만 다루고 폴더 트리를 그대로
 * 다루는 게 불안정하므로, 배포 파일 전체를 zip 하나(payload.zip)로 묶어 IExpress 에는
 * `payload.zip` + `install-launcher.bat` 딱 2개 파일만 넘긴다. 실행되면:
 *   IExpress 가 자기 자신을 %TEMP% 아래로 풀고 install-launcher.bat 을 실행
 *     → install-launcher.bat 이 tar.exe 로 payload.zip 을 풀고(윈도우 내장, zip 해제 가능 — D-002 실측)
 *     → installer\wizard.ps1(PowerShell WinForms 위저드)을 실행
 *
 * 스테이징 구조(installer/wizard.ps1 이 이 구조를 그대로 전제한다 — 같이 바꿔야 한다):
 *   server/, web/, shared/, java/(src,out,lib), package.json, LICENSE, node_modules/open-grid
 *   runtime/node.exe (+ 선택적 runtime/jre/)
 *   installer/wizard.ps1, installer/uninstall.ps1
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

const VERSION = require('../package.json').version + '-beta.1';
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

  fs.mkdirSync(path.join(stageDir, 'installer'), { recursive: true });
  fs.cpSync(path.join(P.root, 'installer', 'wizard.ps1'), path.join(stageDir, 'installer', 'wizard.ps1'));
  fs.cpSync(path.join(P.root, 'installer', 'uninstall.ps1'), path.join(stageDir, 'installer', 'uninstall.ps1'));

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

// ── zip (payload) — build-portable.js 와 동일한 .NET ZipFile 방식(경로 슬래시 표준 준수) ──

function zip(srcDir, zipPath) {
  rmrf(zipPath);
  const ps = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem;',
    '[System.IO.Compression.ZipFile]::CreateFromDirectory(',
    `'${srcDir}', '${zipPath}',`,
    '[System.IO.Compression.CompressionLevel]::Optimal, $false)'
  ].join(' ');
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('payload.zip 압축 실패: ' + (r.stderr || ''));
  return fs.statSync(zipPath).size;
}

// ── IExpress SED + 실제 exe 빌드 ────────────────────────────────────────────

function writeLauncherBat(packageDir) {
  const bat = [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'if exist extracted rmdir /s /q extracted',
    'mkdir extracted',
    'tar -xf payload.zip -C extracted',
    'if errorlevel 1 (',
    '  echo payload.zip 압축 해제 실패',
    '  pause',
    '  exit /b 1',
    ')',
    'powershell -NoProfile -ExecutionPolicy Bypass -File "extracted\\installer\\wizard.ps1"',
    'endlocal'
  ].join('\r\n');
  const p = path.join(packageDir, 'install-launcher.bat');
  fs.writeFileSync(p, bat + '\r\n', 'utf8');
  return p;
}

/** IExpress SED(자가압축 EXE 정의) 파일을 만든다. */
function writeSed(packageDir, sedPath, targetExe, friendlyName) {
  const sed = [
    '[Version]',
    'Class=IEXPRESS',
    'SEDVersion=3',
    '[Options]',
    'PackagePurpose=InstallApp',
    'ShowInstallProgramWindow=0',
    'HideExtractAnimation=1',
    'UseLongFileName=1',
    'InsideCompressed=0',
    'CAB_FixedSize=0',
    'CAB_ResvCodeSigning=0',
    'RebootMode=N',
    'InstallPrompt=%InstallPrompt%',
    'DisplayLicense=%DisplayLicense%',
    'FinishMessage=%FinishMessage%',
    'TargetName=%TargetName%',
    'FriendlyName=%FriendlyName%',
    'AppLaunched=%AppLaunched%',
    'PostInstallCmd=%PostInstallCmd%',
    'AdminQuietInstCmd=%AdminQuietInstCmd%',
    'UserQuietInstCmd=%UserQuietInstCmd%',
    'SourceFiles=SourceFiles',
    '[Strings]',
    'InstallPrompt=',
    'DisplayLicense=',
    'FinishMessage=',
    `TargetName=${targetExe}`,
    `FriendlyName=${friendlyName}`,
    'AppLaunched=install-launcher.bat',
    'PostInstallCmd=<None>',
    'AdminQuietInstCmd=',
    'UserQuietInstCmd=',
    'FILE0=payload.zip',
    'FILE1=install-launcher.bat',
    '[SourceFiles]',
    'SourceFiles0=' + packageDir,
    '[SourceFiles0]',
    '%FILE0%=',
    '%FILE1%='
  ].join('\r\n');
  fs.writeFileSync(sedPath, sed + '\r\n', 'utf8');
}

/**
 * iexpress.exe 로 실제 exe 를 만든다. 실패해도 예외를 던지지 않고 결과 객체로 성패를
 * 알려준다 — 빌드 스크립트가 죽기보다는 "무엇이 안 됐는지"를 그대로 드러내는 편이 낫다
 * (config.js 의 진단 철학과 동일).
 */
function buildExeWithIExpress(stageDir, version, withJre) {
  const tag = withJre ? 'with-jre' : 'no-jre';
  const packageDir = path.join(DIST, `_iexpress-package-${tag}`);
  rmrf(packageDir);
  fs.mkdirSync(packageDir, { recursive: true });

  console.log('  payload.zip 압축 중...');
  const zipSize = zip(stageDir, path.join(packageDir, 'payload.zip'));
  console.log(`  payload.zip: ${(zipSize / 1024 / 1024).toFixed(1)} MB`);
  writeLauncherBat(packageDir);

  const targetExe = path.join(DIST, `OracleTunerSetup-${version}-${tag}.exe`);
  const sedPath = path.join(packageDir, 'installer.sed');
  writeSed(packageDir, sedPath, targetExe, `OracleTuner ${version} 설치`);

  rmrf(targetExe);
  console.log('  iexpress /N /Q 실행 중...');
  const r = spawnSync('iexpress.exe', ['/N', '/Q', sedPath], { encoding: 'utf8' });
  const ok = r.status === 0 && fs.existsSync(targetExe);
  if (ok) {
    const size = fs.statSync(targetExe).size;
    console.log(`  생성됨: ${path.basename(targetExe)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    return { ok: true, exePath: targetExe, size };
  }
  console.log(`  iexpress 실패(status=${r.status}): ${(r.stdout || '') + (r.stderr || '')}`.trim());
  return { ok: false, error: (r.stderr || r.stdout || `exit ${r.status}`), sedPath, packageDir };
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

  const exeResult = buildExeWithIExpress(stageDir, VERSION, withJre);

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
    console.log(`  (수동 확인용 SED: ${result.exeResult.sedPath})`);
  }
}

if (require.main === module) main();
module.exports = { build, buildManifest, checkBundledNodeVersion, VERSION };
