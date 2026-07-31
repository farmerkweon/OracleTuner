'use strict';
/**
 * 파일 기반 로거.
 *
 * 형식: `[YYYY-MM-DD HH:MM:SS] LEVEL COMPONENT 메시지`
 * - append-only, UTF-8
 * - 컴포넌트별 개별 파일(동시 append 충돌 방지)
 * - 시각은 항상 실측(new Date()) — 어림한 시각을 쓰지 않는다
 *
 * 콘솔에도 같은 줄을 내보내되, 파일이 항상 정본이다.
 */

const fs = require('fs');
const path = require('path');
const P = require('./paths');

const streams = new Map();

function ts(d) {
  const x = d || new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ` +
         `${p(x.getHours())}:${p(x.getMinutes())}:${p(x.getSeconds())}`;
}

function streamFor(component) {
  const safe = String(component || 'app').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  let s = streams.get(safe);
  if (!s) {
    try {
      fs.mkdirSync(P.logs, { recursive: true });
    } catch (e) { /* 이미 있음 */ }
    s = fs.createWriteStream(path.join(P.logs, `${safe}.log`), { flags: 'a', encoding: 'utf8' });
    s.on('error', (err) => process.stderr.write(`log stream error: ${err.message}\n`));
    streams.set(safe, s);
  }
  return s;
}

/**
 * 콘솔(stdout/stderr) 출력을 계속 해도 되는가.
 *
 * ★ D-07 (2026-07-31 QA-PORTABLE) — 파이프가 끊긴 뒤의 무한 루프
 *
 *   콘솔 호스트가 사라지는 등으로 stdout 파이프의 읽는 쪽이 없어지면 write 가 EPIPE 를
 *   낸다. 그 예외를 index.js 의 uncaughtException 이 받아 다시 이 로거로 기록하고, 이
 *   로거가 또 stdout 에 쓰면서 EPIPE 를 낸다 — 서버는 포트만 잡은 채 아무 요청에도
 *   응답하지 못하는 좀비가 된다(실측: 모든 /api/* 25초 타임아웃).
 *
 *   그래서 콘솔이 한 번 깨지면 **콘솔 출력을 영구히 끊고 파일 로그만 남긴다.**
 *   파일이 정본이므로 진단 능력은 그대로다. 어느 시점에 왜 끊었는지도 파일에 남긴다.
 */
let consoleOk = true;

function disableConsole(reason) {
  if (!consoleOk) return;
  consoleOk = false;
  const line = `[${ts()}] WARN logger 콘솔 출력이 끊겨(${reason}) 이후로는 파일 로그만 남깁니다.`;
  try {
    streamFor('server').write(line + '\n');
  } catch (e) { /* noop */ }
}

// 비동기로 뒤늦게 올라오는 EPIPE 도 여기서 흡수한다(핸들러가 없으면 uncaughtException 이 된다).
for (const s of [process.stdout, process.stderr]) {
  try {
    s.on('error', (err) => disableConsole(err && err.code ? err.code : 'stream error'));
  } catch (e) { /* noop */ }
}

function toConsole(level, line) {
  if (!consoleOk) return;
  try {
    if (level === 'ERROR' || level === 'WARN') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  } catch (e) {
    disableConsole((e && e.code) || 'write 실패');
  }
}

function write(level, component, msg) {
  const line = `[${ts()}] ${level} ${component} ${msg}`;
  try {
    streamFor(component).write(line + '\n');
  } catch (e) { /* 로그 실패가 본 기능을 막지 않는다 */ }
  toConsole(level, line);
}

/**
 * 종료 직전에 쓰는 로그 — **동기(sync)** 로 파일에 박는다.
 *
 * ★ 왜 별도 함수가 필요한가 (2026-07-31 실측)
 *   createWriteStream 은 비동기다. `log.error(...); process.exit(1)` 로 쓰면 버퍼가
 *   비워지기 전에 프로세스가 사라져 **파일에 한 줄도 남지 않는다.** 실제로 포트 충돌
 *   안내가 server.log 에 전혀 기록되지 않았다(0바이트). 트레이로 띄우면 콘솔도 없으므로
 *   사용자에게도 로그에도 아무 흔적이 없는, 가장 나쁜 상태가 된다.
 *   그래서 죽기 직전의 메시지만은 appendFileSync 로 확실히 남긴다.
 */
function writeFatalSync(component, msg) {
  const line = `[${ts()}] ERROR ${component} ${msg}`;
  try {
    fs.mkdirSync(P.logs, { recursive: true });
  } catch (e) { /* 이미 있음 */ }
  try {
    const safe = String(component || 'app').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    fs.appendFileSync(path.join(P.logs, `${safe}.log`), line + '\n', 'utf8');
  } catch (e) { /* 로그 실패가 종료를 막지 않는다 */ }
  toConsole('ERROR', line);
}

/** 컴포넌트 이름이 고정된 로거를 만든다. */
function forComponent(component) {
  return {
    info: (msg) => write('INFO', component, msg),
    warn: (msg) => write('WARN', component, msg),
    error: (msg) => write('ERROR', component, msg),
    /** 곧 process.exit 할 때 쓴다 — 파일에 동기로 남기므로 버퍼째 사라지지 않는다. */
    fatal: (msg) => writeFatalSync(component, msg),
    done: (msg) => write('DONE', component, msg),
    progress: (msg) => write('PROGRESS', component, msg),
    /** 브리지가 stderr 로 보낸 로그 줄을 그대로 파일에 옮긴다(이미 형식을 갖춘 줄). */
    raw: (line) => {
      try {
        streamFor(component).write(line.replace(/\r?\n$/, '') + '\n');
      } catch (e) { /* noop */ }
    }
  };
}

module.exports = { forComponent, ts, write, disableConsole };
