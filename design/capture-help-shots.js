'use strict';
/**
 * 도움말 "시작하기" 탭에 넣을 UI 스크린샷을 로케일별(ko/en/ja/zh)로 캡처해 WebP 로 저장한다.
 *
 * 방식(design/render.js 의 SVG 방식과 대칭 — 빌드 시점(개발자 PC)에 한 번 실행해 결과를
 * web/help-img/*.webp 로 커밋해 둔다. 앱은 그 이미지만 <img> 로 보여준다):
 *
 *   1) 하네스(web/help-img/_tmp/harness.html, 이 스크립트가 실행 시점에 생성/삭제)를 크롬
 *      헤드리스로 연다. 하네스는 앱을 <iframe> 으로 넣고(같은 오리진이라 DOM 접근 가능),
 *      localStorage('ot.lang') 로 언어를 바꾼 뒤 필요한 화면(rail-tab)·항목(tree-leaf)·
 *      탭(rtab)을 클릭해 원하는 상태로 만든다.
 *   2) "누끼" = 배경 제거가 아니라 관심 영역만 타이트하게 잡기: iframe 을 음수 오프셋(x,y)만큼
 *      밀어 넣고 --window-size 를 크롭 크기(w,h)와 똑같이 줘서 그 영역만 스크린샷 한다.
 *      크롭 좌표는 app.css 의 --topbar-h/--railbar-h/--footer-h, .wb-dock 폭(230px),
 *      .settings-wrap max-width(980px) 등 실측 CSS 값에서 산출했다(design/capture-help-shots.md
 *      없이 이 파일 상단 주석으로 대신함 — TARGETS 참고).
 *   3) 크롬은 --screenshot=out.webp 로 WebP 를 직접 출력한다(확장자로 포맷을 정함).
 *      PNG→WebP 재인코딩 단계가 필요 없다.
 *
 * 크롬 프로세스 주의사항(이 환경에서 실측):
 *   - chrome.exe 는 최초 프로세스가 실제 렌더링을 detach 된 프로세스에 맡기고 먼저 끝나는
 *     경우가 있어 spawnSync 의 "종료 = 완료" 가정이 틀린다. --dump-dom 의 stdout 도 그
 *     detach 된 프로세스로 가서 부모가 못 받는다(빈 문자열). 그래서 dump-dom 은 쓰지 않고,
 *     --screenshot 의 "결과 파일이 생겼는지" 를 폴링해서 완료를 판정한다(스폰은 spawn, 대기는
 *     폴링). 이 방식은 실측으로 확인된 유일하게 신뢰 가능한 완료 신호다.
 *
 * 사용: node design/capture-help-shots.js
 * 전제: 서버(server/index.js)가 http://localhost:7070 에 떠 있고, "데모" SQL 목록에 항목이
 *       하나 이상 있을 것(트리 첫 항목을 클릭/더블클릭해 미리보기·워크벤치를 채운다).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const WEB_DIR = path.join(__dirname, '..', 'web');
const TMP_DIR = path.join(WEB_DIR, 'help-img', '_tmp');
const OUT_DIR = path.join(WEB_DIR, 'help-img');
const BASE_URL = 'http://localhost:7070';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const LOCALES = ['ko', 'en', 'ja', 'zh'];
const IFW = 1440; // 하네스 안 iframe 에 렌더할 앱 가상 뷰포트 폭(전형적 데스크톱 폭)
const IFH = 900;  // 〃 높이
const MAX_BYTES = 40 * 1024; // 이미지당 목표 용량(브리핑 기준) — 못 미치면 경고만 하고 진행
const SHOT_TIMEOUT_MS = 15000;

/**
 * 캡처 대상. x,y,w,h 는 iframe 내부(CSS px, device-scale-factor=1) 좌표.
 *   topbar    : .topbar 그 자체(높이 = --topbar-h 46px + 테두리 1px).
 *   sqllist   : SQL 목록 트리에서 첫 항목을 클릭해 미리보기를 채운 뒤, 콘텐츠 영역 상단부만.
 *   workbench : 같은 항목을 더블클릭해 워크벤치로 열어(편집기에 실제 SQL 노출) 도크(230px)는
 *               제외하고 편집기+결과 그리드 영역만.
 *   tournament: 위 상태에서 "튜닝 후보" 결과탭(cands)으로 전환 — 결과 패널(하단, 44% 지점부터)만.
 *   settings  : 설정 화면에서 안전모드가 있는 카드로 스크롤(문서 끝 쪽이라 scrollIntoView 가
 *               자연스럽게 최대 스크롤 위치에서 멈춘다 — 실측으로 확인한 안정적인 좌표).
 */
const TARGETS = [
  { name: 'topbar', view: '', pick: '', pickAction: '', rtab: '', scroll: '', x: 0, y: 0, w: 1440, h: 47 },
  { name: 'sqllist', view: 'sqls', pick: '.tree-leaf', pickAction: 'click', rtab: '', scroll: '', x: 0, y: 82, w: 1440, h: 430 },
  { name: 'workbench', view: 'sqls', pick: '.tree-leaf', pickAction: 'dblclick', rtab: '', scroll: '', x: 230, y: 82, w: 1210, h: 790 },
  { name: 'tournament', view: 'sqls', pick: '.tree-leaf', pickAction: 'dblclick', rtab: 'cands', scroll: '', x: 230, y: 430, w: 1210, h: 442 },
  { name: 'settings', view: 'settings', pick: '', pickAction: '', rtab: '', scroll: '.card:has(#cfg-safe-mode)', x: 230, y: 480, w: 980, h: 360 }
];

// ── 하네스 HTML ────────────────────────────────────────────────────────────
const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff;}
#box{position:relative;overflow:hidden;background:#fff;}
#box iframe{position:absolute;top:0;left:0;border:0;background:#fff;}
</style></head><body>
<div id="box"></div>
<script>
(function () {
  var qs = new URLSearchParams(location.search);
  var loc = qs.get('loc') || 'ko';
  var view = qs.get('view') || '';
  var rtab = qs.get('rtab') || '';
  var scrollSel = qs.get('scroll') || '';
  var pick = qs.get('pick') || '';
  var pickAction = qs.get('pickAction') || 'click';
  var ifw = parseInt(qs.get('ifw') || '1440', 10);
  var ifh = parseInt(qs.get('ifh') || '900', 10);
  var cx = parseInt(qs.get('x') || '0', 10);
  var cy = parseInt(qs.get('y') || '0', 10);
  var cw = parseInt(qs.get('w') || String(ifw), 10);
  var ch = parseInt(qs.get('h') || String(ifh), 10);

  try { localStorage.setItem('ot.lang', loc); } catch (e) {}

  var box = document.getElementById('box');
  box.style.width = cw + 'px';
  box.style.height = ch + 'px';

  var frame = document.createElement('iframe');
  frame.style.width = ifw + 'px';
  frame.style.height = ifh + 'px';
  frame.style.left = (-cx) + 'px';
  frame.style.top = (-cy) + 'px';
  box.appendChild(frame);

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  frame.addEventListener('load', function () {
    var doc = frame.contentDocument;
    wait(700).then(function () {
      if (view) { var b = doc.querySelector('.rail-tab[data-view="' + view + '"]'); if (b) b.click(); }
      return wait(350);
    }).then(function () {
      if (pick) {
        var p = doc.querySelector(pick);
        if (p) {
          var ev = new doc.defaultView.MouseEvent(pickAction === 'dblclick' ? 'dblclick' : 'click', { bubbles: true, cancelable: true, view: doc.defaultView });
          p.dispatchEvent(ev);
        }
      }
      return wait(800);
    }).then(function () {
      if (rtab) { var r = doc.querySelector('.rtab[data-tab="' + rtab + '"]'); if (r) r.click(); }
      return wait(450);
    }).then(function () {
      if (scrollSel) {
        var s = doc.querySelector(scrollSel);
        if (s) s.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
      return wait(300);
    }).then(function () {
      if (scrollSel) {
        // 비동기로 채워지는 카드(환경 진단 등)가 레이아웃을 밀어낼 수 있어 한 번 더 스크롤한다.
        var s2 = doc.querySelector(scrollSel);
        if (s2) s2.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
      return wait(300);
    }).then(function () {
      document.title = 'READY';
    });
  });
  frame.src = '/';
})();
</script>
</body></html>`;

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL + '/', (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * 크롬 헤드리스로 스크린샷 1장을 찍는다. spawnSync 는 이 환경에서 chrome.exe 가 실제 렌더링을
 * detach 된 프로세스로 넘기고 먼저 종료해버려 "완료" 신호로 못 쓴다(실측 확인). 대신 spawn 으로
 * 띄우고 결과 파일이 생기는지 폴링한다.
 */
async function shootOne(url, w, h, outPath) {
  const userDataDir = path.join(os.tmpdir(), 'ot-shot-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const args = [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + userDataDir,
    '--window-size=' + w + ',' + h,
    '--force-device-scale-factor=1',
    '--virtual-time-budget=6000',
    '--screenshot=' + outPath,
    url
  ];
  try { fs.rmSync(outPath, { force: true }); } catch (e) {}
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  child.on('error', () => {});

  const started = Date.now();
  while (Date.now() - started < SHOT_TIMEOUT_MS) {
    await sleep(400);
    if (fs.existsSync(outPath)) {
      // 파일 크기가 안정될 때까지(쓰기 중일 수 있음) 짧게 재확인.
      const s1 = fs.statSync(outPath).size;
      await sleep(200);
      const s2 = fs.existsSync(outPath) ? fs.statSync(outPath).size : -1;
      if (s1 > 0 && s1 === s2) break;
    }
  }
  try { child.kill(); } catch (e) {}
  await sleep(150);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}

  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error('스크린샷 파일이 생성되지 않음(타임아웃): ' + outPath);
  }
}

async function main() {
  if (!(await checkServer())) {
    console.error('[FAIL] ' + BASE_URL + ' 에 서버가 응답하지 않습니다. server/index.js 를 먼저 띄우세요.');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(CHROME)) {
    console.error('[FAIL] 크롬을 찾을 수 없습니다: ' + CHROME);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, 'harness.html'), HARNESS_HTML, 'utf8');

  const manifest = {};
  let ok = 0, fail = 0, totalBytes = 0;

  try {
    for (const target of TARGETS) {
      manifest[target.name] = {};
      for (const loc of LOCALES) {
        const label = target.name + '.' + loc;
        try {
          const url = BASE_URL + '/help-img/_tmp/harness.html?' + new URLSearchParams({
            loc, view: target.view, rtab: target.rtab, scroll: target.scroll,
            pick: target.pick, pickAction: target.pickAction,
            ifw: String(IFW), ifh: String(IFH),
            x: String(target.x), y: String(target.y), w: String(target.w), h: String(target.h)
          }).toString();
          const outPath = path.join(OUT_DIR, label + '.webp');
          await shootOne(url, target.w, target.h, outPath);
          const bytes = fs.statSync(outPath).size;
          manifest[target.name][loc] = { w: target.w, h: target.h, bytes };
          totalBytes += bytes;
          const flag = bytes <= MAX_BYTES ? 'OK' : 'OVER';
          console.log('[' + flag + '] ' + label + '.webp  ' + target.w + 'x' + target.h + '  ' + bytes + 'B');
          ok++;
        } catch (e) {
          console.error('[FAIL] ' + label + ': ' + e.message);
          fail++;
        }
      }
    }
  } finally {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  console.log('완료: ' + ok + '개 생성, ' + fail + '개 실패, 총 ' + Math.round(totalBytes / 1024) + 'KB');
  console.log('MANIFEST_JSON=' + JSON.stringify(manifest));
  if (fail > 0) process.exitCode = 1;
}

main();
