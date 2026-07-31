'use strict';
/**
 * 포터블 배포본 빌드.
 *
 * <p>설치 없이 압축만 풀면 바로 실행되는 형태로 묶는다. 두 가지를 만든다.
 * <ul>
 *   <li><b>기본판</b> — Node 런타임 포함, <b>Java 는 미포함</b>(사내에 이미 JRE/JDK 가 있는 환경)</li>
 *   <li><b>JRE 포함판</b> — jlink 로 최소 JRE 를 만들어 함께 넣는다(VDI·인터넷 없는 환경)</li>
 * </ul>
 *
 * <p>담지 않는 것: <code>config/</code>(비밀번호 키·접속정보), <code>data/</code>(사용자 SQL·이력),
 * <code>logs/</code>. 배포본에 남의 접속정보가 섞여 나가면 안 되기 때문이다.
 *
 * 사용: node tools/build-portable.js [--with-jre] [--both]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const P = require('../server/paths');

const VERSION = require('../package.json').version + '-beta.2';
const DIST = path.join(P.root, 'dist');

/** 배포본에 포함할 항목 (src → 배포본 내 경로) */
const INCLUDE = [
  ['server', 'server'],
  ['shared', 'shared'],
  ['web', 'web'],
  ['demo', 'demo'],
  ['tools/install-demo.js', 'tools/install-demo.js'],
  ['tools/fetch-driver.js', 'tools/fetch-driver.js'],
  ['java/src', 'java/src'],
  ['java/out', 'java/out'],
  ['java/build.js', 'java/build.js'],
  ['package.json', 'package.json'],
  ['LICENSE', 'LICENSE'],
  ['STATUS.md', 'STATUS.md'],
  ['node_modules/open-grid', 'node_modules/open-grid']
];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dst) {
  const s = path.join(P.root, src);
  const d = path.join(dst, ...src.split('/').length ? [] : []);
  if (!fs.existsSync(s)) { console.log(`  (건너뜀) ${src}`); return; }
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.cpSync(s, d, { recursive: true });
}

/** 배포본에 들어가면 안 되는 것(도구 상태·에디터 설정·캐시 등). */
function isJunk(src) {
  const base = path.basename(src);
  return base === '.omc' || base === '.git' || base === '.vscode'
      || base === 'node_modules' && false // 명시적으로 넣은 것만 담는다
      || base === '.DS_Store' || base === 'Thumbs.db';
}

function copyAll(stage) {
  for (const [src, rel] of INCLUDE) {
    const s = path.join(P.root, src);
    const d = path.join(stage, rel);
    if (!fs.existsSync(s)) { console.log(`  (건너뜀) ${src}`); continue; }
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.cpSync(s, d, { recursive: true, filter: (from) => !isJunk(from) });
  }
  // ojdbc 드라이버는 있으면 넣는다(Oracle 라이선스상 재배포가 제한될 수 있어 선택적)
  const jar = path.join(P.root, 'java', 'lib', 'ojdbc11.jar');
  if (fs.existsSync(jar)) {
    fs.mkdirSync(path.join(stage, 'java', 'lib'), { recursive: true });
    fs.cpSync(jar, path.join(stage, 'java', 'lib', 'ojdbc11.jar'));
  }
  // 빈 작업 폴더(사용자 데이터는 넣지 않는다)
  for (const dir of ['config', 'data/tunings', 'data/snippets', 'logs']) {
    fs.mkdirSync(path.join(stage, dir), { recursive: true });
    fs.writeFileSync(path.join(stage, dir, '.gitkeep'), '');
  }
  // 항목 #6(설치판) — 이 파일이 있으면 server/paths.js 가 '포터블 모드'로 판정해 데이터를
  // 앱 폴더 상대경로에 둔다(USB 이동성 유지). 설치판(installer/wizard.ps1)이 만드는 배포본에는
  // 이 마커가 없으므로 대신 %LOCALAPPDATA% 를 쓴다 — 두 배포 형태가 이 파일 하나로 갈린다.
  fs.writeFileSync(path.join(stage, 'portable.marker'), '');
}

/** Node 런타임을 함께 넣는다(진짜 포터블이 되려면 필요). */
function copyNode(stage) {
  const exe = process.execPath;
  fs.mkdirSync(path.join(stage, 'runtime'), { recursive: true });
  fs.cpSync(exe, path.join(stage, 'runtime', path.basename(exe)));
  return path.basename(exe);
}

/** jlink 로 최소 JRE 생성. 실패하면 null. */
function buildJre(stage) {
  const javaHome = process.env.JAVA_HOME;
  const jlink = javaHome ? path.join(javaHome, 'bin', 'jlink.exe') : null;
  if (!jlink || !fs.existsSync(jlink)) {
    console.log('  jlink 를 찾지 못해 JRE 포함판을 건너뜁니다 (JAVA_HOME 확인)');
    return null;
  }
  const out = path.join(stage, 'runtime', 'jre');
  rmrf(out);
  // ojdbc 가 쓰는 모듈들 — 넉넉히 넣되 데스크톱/UI 모듈은 뺀다
  const modules = [
    'java.base', 'java.sql', 'java.naming', 'java.management',
    'java.security.jgss', 'java.security.sasl', 'java.xml',
    'java.transaction.xa', 'jdk.crypto.ec', 'jdk.unsupported'
  ].join(',');
  const r = spawnSync(jlink, [
    '--add-modules', modules,
    '--strip-debug', '--no-man-pages', '--no-header-files', '--compress', '2',
    '--output', out
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('  jlink 실패:', (r.stderr || '').split('\n')[0]);
    return null;
  }
  return out;
}

function writeLaunchers(stage, nodeExe, withJre) {
  // Windows 실행 파일
  const bat = [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    withJre ? 'set "JAVA_HOME=%~dp0runtime\\jre"' : 'rem JAVA_HOME 은 시스템 설정을 사용합니다',
    withJre ? 'set "PATH=%JAVA_HOME%\\bin;%PATH%"' : '',
    '',
    'echo.',
    'echo   Oracle Tuner ' + VERSION,
    'echo   ------------------------------------------',
    withJre ? 'echo   Java: 내장 JRE 사용' : 'echo   Java: 시스템에 설치된 JRE/JDK 사용',
    'echo   브라우저가 자동으로 열립니다. 창을 닫으면 종료됩니다.',
    'echo.',
    '',
    '"%~dp0runtime\\' + nodeExe + '" "%~dp0server\\index.js"',
    'if errorlevel 1 pause',
    'endlocal'
  ].filter((x) => x !== '').join('\r\n');
  fs.writeFileSync(path.join(stage, 'OracleTuner.bat'), bat + '\r\n', 'utf8');

  // 설정 초기값 — 내장 JRE 를 쓰도록 java.home 을 미리 지정
  if (withJre) {
    fs.writeFileSync(path.join(stage, 'config', 'settings.json'),
      JSON.stringify({ java: { home: './runtime/jre' } }, null, 2), 'utf8');
  }
}

function writeReadme(stage, withJre) {
  const txt = `Oracle Tuner ${VERSION} — 포터블 (Windows x64)
====================================================

실행 방법
---------
1) 압축을 원하는 폴더에 풉니다 (경로에 한글/공백이 있어도 됩니다)
2) OracleTuner.bat 를 더블클릭
3) 브라우저가 자동으로 http://127.0.0.1:7070 을 엽니다

필요한 것
---------
- Windows x64
${withJre
  ? '- Java: 포함되어 있습니다 (runtime/jre). 따로 설치할 필요 없습니다.'
  : '- Java 11 이상 (JRE 또는 JDK). 없으면 실행 시 [설정] 화면에서 경로를 지정하세요.\n  JRE 가 없다면 "JRE 포함판" 을 받으세요.'}
- Node: 포함되어 있습니다 (runtime/node.exe)
- Oracle JDBC 드라이버: java/lib/ojdbc11.jar 에 포함${fs.existsSync(path.join(stage, 'java', 'lib', 'ojdbc11.jar')) ? '되어 있습니다' : '되어 있지 않습니다. npm run fetch-driver 로 받으세요'}

처음 사용
---------
1) 우측 상단 [접속] → 접속 정보 입력
   · 서비스명은 반드시 입력하세요 (Oracle Free: FREEPDB1, XE: XEPDB1)
2) [SQL 목록] → [샘플 예제] → 예제가 설치됩니다
3) [데모 데이터 생성] → 시험용 표 30만 건 생성 (1~2분)
4) 예제를 열고 [튜닝 후보] → [후보 생성] → [토너먼트 실행]

자세한 사용법은 프로그램 안의 [도움말] (F1) 을 보세요.

저장되는 위치
-------------
- config/   접속 정보(비밀번호는 암호화), 설정
- data/     저장한 SQL, 튜닝 이력
- logs/     실행 로그
이 폴더째 옮기면 그대로 이어서 쓸 수 있습니다.

베타 안내
---------
이 버전은 베타입니다. 튜닝 결과의 최종 검증은 사용자의 몫입니다.
운영에 반영하기 전 반드시 직접 확인하세요.

문의: foxnail.biz@gmail.com
홈페이지: https://foxnail.kr
라이선스: MIT
`;
  fs.writeFileSync(path.join(stage, 'README.txt'), txt, 'utf8');
}

/**
 * ZIP 생성.
 *
 * ⚠ Windows PowerShell 5.1 의 <code>Compress-Archive</code> 는 항목 경로를 <b>역슬래시</b>로 써서
 * ZIP 표준(슬래시)을 어긴다. 그러면 다른 압축 프로그램이나 다른 OS 에서 폴더 구조가 깨진다.
 * 배포본이므로 .NET 의 ZipFile 을 직접 써서 표준 형식으로 만든다.
 */
function zip(stageDir, zipPath) {
  rmrf(zipPath);
  const ps = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem;',
    `[System.IO.Compression.ZipFile]::CreateFromDirectory(`,
    `'${stageDir}', '${zipPath}',`,
    '[System.IO.Compression.CompressionLevel]::Optimal, $false)'
  ].join(' ');
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('압축 실패: ' + (r.stderr || ''));
  return fs.statSync(zipPath).size;
}

function build(withJre) {
  const tag = withJre ? 'with-jre' : 'no-jre';
  const name = `oracle-tuner-${VERSION}-portable-win-x64-${tag}`;
  const stage = path.join(DIST, name);
  console.log(`\n■ ${name}`);
  rmrf(stage);
  fs.mkdirSync(stage, { recursive: true });

  copyAll(stage);
  const nodeExe = copyNode(stage);
  console.log('  Node 런타임 포함:', nodeExe);

  if (withJre) {
    const jre = buildJre(stage);
    if (!jre) { console.log('  → JRE 포함판 생성 취소'); rmrf(stage); return null; }
    console.log('  내장 JRE 생성 완료');
  }

  writeLaunchers(stage, nodeExe, withJre);
  writeReadme(stage, withJre);

  const zipPath = path.join(DIST, name + '.zip');
  const size = zip(stage, zipPath);
  console.log(`  ZIP: ${path.basename(zipPath)}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return { name, zipPath, size };
}

function main() {
  fs.mkdirSync(DIST, { recursive: true });
  const args = process.argv.slice(2);
  const both = args.includes('--both') || args.length === 0;
  const results = [];

  if (both || !args.includes('--with-jre')) {
    const r = build(false);
    if (r) results.push(r);
  }
  if (both || args.includes('--with-jre')) {
    const r = build(true);
    if (r) results.push(r);
  }

  console.log('\n완료 — dist/ 폴더');
  for (const r of results) {
    console.log(`  ${path.basename(r.zipPath)}  ${(r.size / 1024 / 1024).toFixed(1)} MB`);
  }
}

if (require.main === module) main();
// copyNode/buildJre 도 내보낸다 — tools/build-installer.js(항목 #6 Phase 4) 가 설치판에
// 번들할 node/JRE 를 만들 때 이 로직을 그대로 재사용한다(중복 구현 금지).
module.exports = { build, VERSION, copyNode, buildJre };
