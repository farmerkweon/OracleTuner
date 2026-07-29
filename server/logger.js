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

function write(level, component, msg) {
  const line = `[${ts()}] ${level} ${component} ${msg}`;
  try {
    streamFor(component).write(line + '\n');
  } catch (e) { /* 로그 실패가 본 기능을 막지 않는다 */ }
  if (level === 'ERROR' || level === 'WARN') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

/** 컴포넌트 이름이 고정된 로거를 만든다. */
function forComponent(component) {
  return {
    info: (msg) => write('INFO', component, msg),
    warn: (msg) => write('WARN', component, msg),
    error: (msg) => write('ERROR', component, msg),
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

module.exports = { forComponent, ts, write };
