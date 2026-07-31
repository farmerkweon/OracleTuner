'use strict';
/**
 * Oracle Tuner 로컬 웹서버.
 *
 * - 기본 바인딩은 127.0.0.1 이다. 이 도구는 DB 접속정보를 다루므로 기본값으로
 *   외부에 열지 않는다(설정에서 host 를 바꿀 수 있지만 경고를 띄운다).
 * - 외부 프레임워크를 쓰지 않는다(설치 환경 제약 고려). Node 기본 http 모듈만 사용.
 * - 정적 파일과 /api/* 라우팅만 담당한다. 업무 로직은 api.js 아래로 위임한다.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { exec, execFile } = require('child_process');

const P = require('./paths');
const config = require('./config');
const api = require('./api');
const bridge = require('./bridge');
const logger = require('./logger');

const log = logger.forComponent('server');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

/** 정적 파일을 서빙할 루트들. 앞에서부터 찾는다. */
function staticRoots() {
  return [
    { prefix: '/vendor/open-grid/', dir: path.join(P.nodeModules, 'open-grid', 'dist') },
    { prefix: '/shared/', dir: P.shared },
    { prefix: '/', dir: P.web }
  ];
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new api.ApiError('요청 본문이 너무 큽니다.', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new api.ApiError(`JSON 파싱 실패: ${e.message}`, 400));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  for (const root of staticRoots()) {
    if (!rel.startsWith(root.prefix)) continue;
    const sub = rel.slice(root.prefix.length);
    const file = path.join(root.dir, sub);
    if (!P.isInside(root.dir, file)) {
      sendJson(res, 403, { error: { message: '경로 접근이 거부되었습니다.' } });
      return true;
    }
    let st;
    try {
      st = fs.statSync(file);
    } catch (e) {
      continue;
    }
    if (st.isDirectory()) continue;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
    return true;
  }
  return false;
}

async function handle(req, res) {
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');

  // 로컬 도구지만 최소한의 방어는 둔다
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET,POST,DELETE,OPTIONS' });
    res.end();
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    let body = {};
    try {
      // 초대형 SQL(1만 줄 이상, 수 MB)도 잘리지 않게 넉넉히. 설정으로 조절 가능.
      const cfg = config.load();
      const limitMb = (cfg.server && cfg.server.maxRequestMb) || 64;
      if (req.method === 'POST' || req.method === 'DELETE') body = await readBody(req, limitMb * 1024 * 1024);
      const result = await api.dispatch(req, res, url, body);
      if (result === undefined) return; // 핸들러가 직접 응답함
      sendJson(res, 200, result);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) log.error(`${req.method} ${url.pathname} → ${status}: ${e.stack || e.message}`);
      else log.warn(`${req.method} ${url.pathname} → ${status}: ${e.message}`);
      sendJson(res, status, {
        error: {
          message: e.message || '알 수 없는 오류',
          detail: e.detail || null,
          status
        }
      });
    } finally {
      const ms = Date.now() - started;
      if (ms > 1000) log.info(`${req.method} ${url.pathname} ${ms}ms`);
    }
    return;
  }

  if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

/**
 * 기본 브라우저로 url 을 연다.
 *
 * ★ 윈도우에서 `start "" "<url>"` 을 쓰면 안 된다 (2026-07-31 실사용 사고).
 *   런처(OracleTuner.vbs)가 검은 콘솔을 감추려고 node 를 `WScript.Shell.Run cmd, 0`
 *   = SW_HIDE 로 띄우는데, **이 "창 숨김" 상태가 자식 프로세스로 상속된다.**
 *   그래서 cmd → start → ShellExecute 로 열린 브라우저까지 숨겨진 창으로 떠서
 *   화면에는 아무것도 안 나타난다. exec 은 오류를 내지 않으므로 로그로도 안 잡힌다.
 *   증상: "바탕화면 아이콘을 눌러도 뭐 뜨는 게 없음" (서버는 정상 기동·응답).
 *
 *   explorer.exe 에 넘기면 이미 떠 있는 셸이 대신 열어주므로 숨김 상태를 물려받지 않는다.
 *   ⚠ explorer.exe 는 성공해도 종료코드가 1 인 경우가 흔하다 — 종료코드로 실패 판정하지 말 것.
 *
 * 어느 방법으로 열었는지 로그에 남긴다. "왜 안 뜨지"를 로그만으로 판정할 수 있어야 한다.
 */
function openBrowser(url) {
  if (process.platform === 'win32') {
    // 1순위: explorer.exe (창 숨김 상속을 끊는다)
    execFile('explorer.exe', [url], { windowsHide: false }, () => {
      // 종료코드를 믿을 수 없으므로 성공/실패를 여기서 판정하지 않는다.
    });
    log.info(`브라우저 열기 요청: explorer.exe "${url}"`);
    return;
  }
  const cmd = process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) log.warn(`브라우저 자동 실행 실패(수동으로 열어주세요): ${err.message}`);
    else log.info(`브라우저 열기 요청: ${cmd}`);
  });
}

async function main() {
  P.ensureDirs();
  const cfg = config.load(true);

  log.info('='.repeat(60));
  log.info(`Oracle Tuner 기동 — node ${process.version}, ${process.platform}`);

  // 진단 결과를 기동 로그에 남긴다 — 나중에 "왜 안 되지"를 로그만으로 판정할 수 있게
  const diag = config.diagnose();
  for (const item of diag.items) {
    const level = item.ok ? 'info' : (item.severity === 'warn' ? 'warn' : 'warn');
    log[level](`진단 ${item.label}: ${item.ok ? 'OK' : 'MISSING'} — ${String(item.detail || '').split('\n')[0]}`);
  }

  // 브리지는 백그라운드로 미리 띄운다(첫 요청 지연 제거). 실패해도 서버는 뜬다.
  bridge.start()
    .then((info) => log.info(`브리지 준비 완료 (java ${info.javaVersion})`))
    .catch((e) => log.warn(`브리지 사전 기동 실패 — 첫 요청 때 다시 시도합니다: ${e.message}`));

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      log.error(`처리되지 않은 오류: ${e.stack || e.message}`);
      try {
        sendJson(res, 500, { error: { message: e.message } });
      } catch (e2) { /* 응답이 이미 시작된 경우 */ }
    });
  });

  const port = Number(cfg.server.port) || 7070;
  const host = cfg.server.host || '127.0.0.1';

  if (host !== '127.0.0.1' && host !== 'localhost') {
    log.warn(`외부 접근 가능한 주소(${host})로 바인딩합니다. 접속정보가 담긴 도구이므로 신뢰 구간에서만 사용하세요.`);
  }

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      // 자동으로 다른 포트로 옮기지 않는다 — 사용자가 북마크한 주소가 말없이 바뀌면 더 혼란스럽다
      // (FIX-SPEC-slice-H Phase 2). 대신 무엇이 문제고 어떻게 고치는지 명확히 안내한다.
      // 설정 파일 위치는 실행 모드(개발/포터블/설치)에 따라 달라지므로 P.settingsFile 로 실제
      // 경로를 그대로 보여준다(Phase 1 의 데이터 경로 분리와 짝이 맞아야 한다).
      log.error(`포트 ${port} 가 이미 사용 중입니다. 다른 프로그램이 그 포트를 쓰고 있는지 확인하거나, `
        + `${P.settingsFile} 파일의 server.port 값을 사용 가능한 포트로 바꾼 뒤 다시 실행하세요.`);
      process.exit(1);
    }
    log.error(`서버 오류: ${e.message}`);
  });

  server.listen(port, host, () => {
    const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`;
    log.info(`듣는 중: ${url}`);
    console.log('');
    console.log(`  Oracle Tuner 준비됨 →  ${url}`);
    console.log('');
    if (cfg.server.openBrowser) openBrowser(url);
  });

  const shutdown = async (sig) => {
    log.info(`${sig} 수신 — 정리 후 종료합니다.`);
    server.close();
    try {
      await bridge.stop();
    } catch (e) { /* noop */ }
    log.done('종료 완료');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (e) => log.error(`uncaughtException: ${e.stack || e.message}`));
  process.on('unhandledRejection', (e) => log.error(`unhandledRejection: ${(e && e.stack) || e}`));
}

if (require.main === module) main();

module.exports = { main };
