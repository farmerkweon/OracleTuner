'use strict';
/**
 * 트레이 런처(OracleTuner.exe) 빌드.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 C# + in-box csc.exe 인가
 *
 *   대상 환경이 **인터넷이 없는 폐쇄망(VDI)** 이다. 그래서
 *     · npm 패키지(node-tray 류)나 pkg/nexe 같은 번들러를 새로 받아올 수 없다.
 *     · .NET SDK 를 설치하라고 요구할 수도 없다.
 *   반면 **.NET Framework 4 컴파일러는 윈도우에 이미 들어 있다**:
 *     C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
 *   추가로 받을 것이 하나도 없다. 그래서 이걸 쓴다.
 *
 *   ⚠ 이 컴파일러는 C# 5 까지만 지원한다. installer/tray/OracleTunerTray.cs 에
 *     문자열 보간($"")·null 조건 연산자(?.)·nameof 를 쓰면 컴파일이 깨진다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 실패는 조용히 넘기지 않는다
 *
 *   csc.exe 가 없거나 컴파일이 실패하면 **예외를 던져 빌드를 세운다.**
 *   트레이 exe 가 빠진 설치판이 나가면 바로가기가 없는 것을 가리키게 되고,
 *   사용자는 설치는 됐는데 실행이 안 되는 상태를 만난다. 조용한 성공보다
 *   시끄러운 실패가 낫다. (build-installer.js 의 ISCC 실패 처리와는 의도적으로
 *   다르다 — 저쪽은 '설치 exe 를 못 만들었다'는 결과물 하나가 빠지는 것이지만,
 *   여기는 '설치판 안에 실행 수단이 없다'는 더 나쁜 상태다.)
 *
 * 사용: node tools/build-tray.js [출력폴더]
 *       (인자를 안 주면 dist/tray-build 에 만든다 — 단독 시험용)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const P = require('../server/paths');

const SRC  = path.join(P.root, 'installer', 'tray', 'OracleTunerTray.cs');
const ICON = path.join(P.root, 'installer', 'OracleTuner.ico');
const OUT_NAME = 'OracleTuner.exe';

/**
 * csc.exe(.NET Framework in-box C# 컴파일러)를 찾는다.
 *
 * PATH 에 없는 것이 정상이다 — 프레임워크 폴더는 PATH 에 들어가지 않는다.
 * 그래서 `where csc` 로 판단하면 안 된다(ISCC 를 못 찾아 IExpress 로 우회했던
 * 것과 똑같은 오판을 반복하게 된다 — build-installer.js findIscc() 주석 참조).
 * 64비트 → 32비트 순으로 알려진 위치를 직접 뒤진다.
 */
function findCsc() {
  const win = process.env.SystemRoot || 'C:\\Windows';
  const cands = [
    path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(win, 'Microsoft.NET', 'Framework',   'v4.0.30319', 'csc.exe')
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

/**
 * 트레이 exe 를 컴파일해 destDir 에 놓는다.
 *
 * @param {string} destDir 스테이징 폴더(설치판/포터블 배포본의 루트)
 * @returns {{exePath: string, size: number, csc: string}}
 * @throws {Error} csc.exe 가 없거나 컴파일이 실패하면
 */
function buildTray(destDir) {
  if (!fs.existsSync(SRC)) {
    throw new Error(`트레이 소스가 없습니다: ${SRC}`);
  }
  const csc = findCsc();
  if (!csc) {
    throw new Error(
      '트레이 런처를 컴파일할 csc.exe 를 찾지 못했습니다.\n' +
      '  찾아본 위치:\n' +
      `    ${path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')}\n` +
      `    ${path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework',   'v4.0.30319', 'csc.exe')}\n` +
      '  → .NET Framework 4.x 가 설치된 Windows 에서 빌드해야 합니다.\n' +
      '    (Windows 8 이상에는 기본 포함되어 있습니다. "Windows 기능 켜기/끄기" 에서\n' +
      '     .NET Framework 4.x Advanced Services 가 꺼져 있지 않은지 확인하세요.)'
    );
  }

  fs.mkdirSync(destDir, { recursive: true });
  const exePath = path.join(destDir, OUT_NAME);

  const args = [
    '/nologo',
    // ★ winexe — 콘솔 창이 절대 뜨지 않게 한다. exe 로 바꾸면 실행할 때마다 검은 창이 뜬다.
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    // 경고를 오류로 올리지는 않는다(미사용 변수 하나로 배포가 막히면 곤란하다).
    '/warn:1',
    `/out:${exePath}`,
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    SRC
  ];

  // ★ 아이콘을 exe 자체에 박아 넣는다.
  //   이걸 해야 바로가기가 IconFilename 없이도 제대로 된 아이콘으로 나온다.
  //   (기존에 바로가기가 .vbs 를 가리켜 윈도우 기본 '두루마리' 아이콘이 나왔던 문제 —
  //    2026-07-31 발주자 지적 "바탕화면 앱아이콘도 이상하게 생겼어" — 의 근본 해결이다.)
  if (fs.existsSync(ICON)) {
    args.splice(args.length - 1, 0, `/win32icon:${ICON}`);
  } else {
    console.log(`  ⚠ 아이콘 없음(${ICON}) — exe 에 아이콘을 넣지 못했습니다.`);
  }

  const r = spawnSync(csc, args, { encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();

  if (r.status !== 0 || !fs.existsSync(exePath)) {
    throw new Error(
      `트레이 런처 컴파일 실패 (csc exit=${r.status})\n` +
      `  컴파일러: ${csc}\n` +
      `  소스: ${SRC}\n` +
      (out ? `  출력:\n${out.split(/\r?\n/).map((l) => '    ' + l).join('\n')}` : '  (컴파일러 출력 없음)')
    );
  }

  // 경고는 죽이지 않되 눈에는 보이게 남긴다.
  if (out) console.log(out.split(/\r?\n/).map((l) => '    ' + l).join('\n'));

  const size = fs.statSync(exePath).size;
  console.log(`  트레이 런처: ${OUT_NAME} (${(size / 1024).toFixed(0)} KB) — ${path.basename(csc)}`);
  return { exePath, size, csc };
}

function main() {
  const dest = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(P.root, 'dist', 'tray-build');
  console.log(`\n■ 트레이 런처 빌드 → ${dest}`);
  const r = buildTray(dest);
  console.log(`완료: ${r.exePath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('\n' + e.message);
    process.exit(1);
  }
}

module.exports = { buildTray, findCsc, OUT_NAME };
