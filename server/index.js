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
const portUtils = require('./port-utils');

const log = logger.forComponent('server');

/** 서버가 실제로 잡은 포트를 적어두는 파일. 트레이 런처가 이 값을 읽어 툴팁·[열기]에 쓴다. */
const RUNTIME_FILE = path.join(P.data, 'runtime.json');

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

/**
 * 어느 포트로 뜰 것인가, 그리고 그 포트를 **사용자가 직접 고른 것인가**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D-03 (2026-07-31 QA-PORTABLE) 의 판단 근거
 *
 *   증상: 설치판이 7070 에서 도는 중에 포터블을 실행하면 EADDRINUSE 로 즉시 죽었다.
 *   설치판+포터블 동시 보유는 홍보글이 둘 다 링크하는 **정상 시나리오**다.
 *
 *   그래서 규칙을 둘로 나눈다:
 *     · 사용자가 포트를 고르지 않았다(= 기본값 그대로) → 말없이 죽는 것보다 **뜨는 것**이
 *       낫다. 다음 사용 가능한 포트로 옮겨 뜨되, 옮겼다는 사실을 화면·로그·트레이에
 *       똑똑히 알린다.
 *     · 사용자가 포트를 골랐다(--port / ORACLE_TUNER_PORT / settings.json 에 기본값과
 *       다른 값) → **말없이 바꾸지 않는다.** 그 포트로 북마크·방화벽 규칙·역방향 프록시를
 *       맞춰 놨을 수 있다. 실패시키되 무엇을 어떻게 고치는지 정확히 안내한다.
 *
 *   "settings.json 에 값이 적혀 있으면 곧 명시적 지정"으로 보지 않는 이유:
 *   설정 화면에서 [저장]을 한 번만 눌러도 전체 스키마가 파일에 기록되어 server.port 가
 *   7070 으로 적힌다(QA 항목 14 실측). 그것을 "사용자가 7070 을 고집한다"로 읽으면
 *   포터블은 다시 못 뜬다. 그래서 **기본값과 다른 값일 때만** 명시적 지정으로 본다.
 *
 * @returns {{port:number, pinned:boolean, source:string}}
 */
function resolvePort(cfg, argv, env) {
  const def = config.DEFAULTS.server.port;

  const fromArg = (() => {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      let v = null;
      if (a === '--port' && i + 1 < argv.length) v = argv[i + 1];
      else if (a.startsWith('--port=')) v = a.slice('--port='.length);
      if (v !== null) {
        const n = Number(v);
        if (Number.isInteger(n) && n > 0 && n < 65536) return n;
      }
    }
    return null;
  })();
  if (fromArg !== null) return { port: fromArg, pinned: true, source: '--port' };

  const fromEnv = Number(env.ORACLE_TUNER_PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536) {
    return { port: fromEnv, pinned: true, source: 'ORACLE_TUNER_PORT' };
  }

  const fromCfg = Number(cfg.server && cfg.server.port);
  if (Number.isInteger(fromCfg) && fromCfg > 0 && fromCfg < 65536 && fromCfg !== def) {
    return { port: fromCfg, pinned: true, source: 'settings.json' };
  }
  return { port: def, pinned: false, source: '기본값' };
}

/** 포트 충돌 안내문. 안내가 가리키는 파일은 반드시 존재해야 한다(D-03). */
function portBusyMessage(port, source) {
  const ex = JSON.stringify({ server: { port: port === 7070 ? 7071 : port + 1 } }, null, 2);
  return `포트 ${port} 가 이미 사용 중입니다(${source} 로 지정된 포트라 임의로 바꾸지 않았습니다).\n`
    + `  · 다른 포트로 띄우려면 ${P.settingsFile} 를 열어 server.port 를 바꾼 뒤 다시 실행하세요:\n`
    + ex.split('\n').map((l) => '      ' + l).join('\n') + '\n'
    + `  · 한 번만 다른 포트로 띄우려면: OracleTuner.bat --port ${port === 7070 ? 7071 : port + 1}\n`
    + `  · 그 포트를 쓰는 프로그램이 Oracle Tuner 자신일 수도 있습니다(설치판이 이미 떠 있는 경우).`;
}

/** 실제로 잡은 포트를 파일로 남긴다 — 트레이 런처가 툴팁·[열기] 주소에 쓴다. */
function writeRuntimeFile(port, host, url) {
  try {
    const tmp = RUNTIME_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({
      pid: process.pid, port, host, url, startedAt: logger.ts()
    }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, RUNTIME_FILE);
  } catch (e) {
    log.warn(`runtime.json 기록 실패(트레이 툴팁이 옛 포트를 보일 수 있습니다): ${e.message}`);
  }
}

/**
 * 죽기 전에 로그 버퍼가 비워질 짧은 시간을 준다.
 *
 * logger 의 파일 스트림은 비동기라, 곧바로 process.exit 하면 그때까지 쌓인 기동·진단 로그가
 * 통째로 사라진다(치명적 한 줄은 log.fatal 이 동기로 남기지만, 그 앞의 맥락도 필요하다).
 */
async function exitAfterFlush(code) {
  await new Promise((r) => setTimeout(r, 250));
  process.exit(code);
}

function removeRuntimeFile() {
  try {
    if (fs.existsSync(RUNTIME_FILE)) fs.unlinkSync(RUNTIME_FILE);
  } catch (e) { /* 종료 경로에서 실패해도 할 일 없음 */ }
}

async function main() {
  P.ensureDirs();
  // 안내 문구가 가리킬 설정 파일을 먼저 확보한다(없으면 기본값으로 만든다).
  const ensured = config.ensureSettingsFile();
  const cfg = config.load(true);

  log.info('='.repeat(60));
  log.info(`Oracle Tuner 기동 — node ${process.version}, ${process.platform}`);
  log.info(`실행 모드=${P.mode} 앱폴더=${P.root} 데이터루트=${P.dataRoot}`);
  if (ensured.created) log.info(`설정 파일이 없어 기본값으로 만들었습니다: ${ensured.file}`);
  else if (ensured.error) log.warn(`설정 파일을 만들지 못했습니다(계속 진행): ${ensured.error}`);

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

  const host = cfg.server.host || '127.0.0.1';
  const want = resolvePort(cfg, process.argv.slice(2), process.env);
  let port = want.port;

  if (host !== '127.0.0.1' && host !== 'localhost') {
    log.warn(`외부 접근 가능한 주소(${host})로 바인딩합니다. 접속정보가 담긴 도구이므로 신뢰 구간에서만 사용하세요.`);
  }

  // ── 포트 확보 (D-03) ───────────────────────────────────────────────────────
  // listen 하기 전에 먼저 비어 있는지 본다. 미리 보면 "왜 옮겼는지"를 안내한 뒤 옮길 수
  // 있다(EADDRINUSE 를 받고 나서는 이미 늦다). 검사와 실제 bind 사이의 아주 짧은 틈은
  // 아래 server.on('error') 가 받아낸다.
  const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  if (!(await portUtils.isPortFree(port, probeHost))) {
    if (want.pinned) {
      log.fatal(portBusyMessage(port, want.source));
      removeRuntimeFile();
      await exitAfterFlush(1);
      return;
    }
    const cands = [port].concat(portUtils.DEFAULT_CANDIDATES.filter((p) => p !== port));
    const found = await portUtils.findAvailablePort(cands, probeHost);
    if (!found.port) {
      log.fatal(`포트 ${port} 를 비롯해 후보(${cands.join(', ')})가 모두 사용 중입니다.\n`
        + `  ${P.settingsFile} 의 server.port 에 비어 있는 포트를 직접 지정한 뒤 다시 실행하세요.`);
      removeRuntimeFile();
      await exitAfterFlush(1);
      return;
    }
    log.warn(`포트 ${port} 가 이미 사용 중이라 ${found.port} 로 바꿔 띄웁니다`
      + `(기본 포트라 자동으로 옮겼습니다. 고정하려면 ${P.settingsFile} 의 server.port 를 지정하세요).`);
    console.log('');
    console.log(`  ※ 포트 ${port} 가 사용 중이라 ${found.port} 번으로 띄웁니다.`);
    console.log(`     (다른 Oracle Tuner 가 이미 떠 있을 수 있습니다. 이 창의 주소를 쓰세요.)`);
    port = found.port;
  }

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      // 위에서 비어 있는 것을 확인하고도 여기 온 경우 = 검사와 bind 사이에 누가 채갔다.
      log.fatal(portBusyMessage(port, want.pinned ? want.source : '자동 선택'));
      removeRuntimeFile();
      exitAfterFlush(1);
      return;
    }
    log.error(`서버 오류: ${e.message}`);
  });

  server.listen(port, host, () => {
    const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`;
    log.info(`듣는 중: ${url} (요청 포트=${want.port}/${want.source}, 실제=${port})`);
    // 실제 포트를 파일로 남긴다 — 트레이 툴팁·[열기]가 이 값을 따라온다.
    writeRuntimeFile(port, host, url);
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
    removeRuntimeFile();
    log.done('종료 완료');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('exit', removeRuntimeFile);
  // ★ D-07 — stdout 파이프가 끊긴(EPIPE) 상태에서 이 핸들러가 로거를 부르면, 그 로거가
  //   다시 stdout 에 쓰면서 같은 예외를 또 일으킨다. 무한 반복에 빠지면 서버는 포트만
  //   잡은 채 모든 요청에 응답하지 못하는 좀비가 된다(실측: 모든 /api/* 25초 타임아웃).
  //   logger 가 콘솔 출력을 스스로 끊지만(logger.js), 여기서도 한 번 더 막는다.
  process.on('uncaughtException', (e) => {
    if (e && (e.code === 'EPIPE' || e.code === 'ERR_STREAM_DESTROYED')) {
      logger.disableConsole(`uncaughtException ${e.code}`);
      return;
    }
    log.error(`uncaughtException: ${e.stack || e.message}`);
  });
  process.on('unhandledRejection', (e) => log.error(`unhandledRejection: ${(e && e.stack) || e}`));
}

if (require.main === module) main();

module.exports = { main };
