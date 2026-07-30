'use strict';
/**
 * Java JDBC 브리지 프로세스 관리자.
 *
 * <p>왜 별도 프로세스인가 — 요구사항이 "JDK/JRE 와 드라이버 경로를 설정으로 바꿀 수 있을 것"이다.
 * Node 안에서 JDBC 를 쓸 수는 없고, Java 를 자식 프로세스로 띄우면 설정을 바꿔도 재기동만으로
 * 즉시 반영된다. 통신은 표준입출력 JSON 라인 — 포트를 열지 않아 방화벽/권한 문제가 없다.
 *
 * <p>내구성:
 * - 브리지가 죽으면 대기 중 요청을 모두 거절하고, 다음 요청 때 자동으로 다시 띄운다.
 * - 응답 줄은 `@@OT@@` 표식으로 식별한다. 드라이버가 표준출력에 흘리는 잡음은 로그로 흘려보낸다.
 * - 모든 요청에 타임아웃이 있다. 응답이 오지 않는 요청이 UI 를 영원히 잡아두지 않는다.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const P = require('./paths');
const config = require('./config');
const logger = require('./logger');

const log = logger.forComponent('bridge');
const MARK = '@@OT@@';

class Bridge {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.readyInfo = null;
    this.seq = 0;
    this.pending = new Map();
    this.starting = null;
    this.buffer = '';
    this.lastError = null;
    this.startedAt = null;
    this.exitCount = 0;
    /** 세션별 최신 진행률(토너먼트). id → { done, total, phase, label, startedAt, finished, ts } */
    this.progressBySession = new Map();
  }

  /** 현재 상태 요약(진단 화면용). */
  status() {
    return {
      running: !!this.proc && this.ready,
      pid: this.proc ? this.proc.pid : null,
      startedAt: this.startedAt,
      exitCount: this.exitCount,
      pending: this.pending.size,
      lastError: this.lastError,
      info: this.readyInfo
    };
  }

  /** 브리지를 띄운다(이미 떠 있으면 그대로 둔다). */
  start() {
    if (this.proc && this.ready) return Promise.resolve(this.readyInfo);
    if (this.starting) return this.starting;

    this.starting = new Promise((resolve, reject) => {
      const cfg = config.load(true);
      const java = config.resolveJava(cfg);
      if (!java.java) {
        this.starting = null;
        this.lastError = java.error;
        return reject(new Error(java.error));
      }

      const bridgeClass = path.join(P.javaOut, 'kr', 'foxnail', 'otuner', 'Bridge.class');
      if (!fs.existsSync(bridgeClass)) {
        // 자동 빌드 시도 — javac 가 없으면 실패 사유를 그대로 올린다
        try {
          const { build } = require('../java/build');
          const r = build({ force: false });
          log.info(`auto-build: ${r.message}`);
          if (!r.ok) {
            this.starting = null;
            this.lastError = r.message;
            return reject(new Error(`브리지 빌드 실패: ${r.message}\n${r.output || ''}`));
          }
        } catch (e) {
          this.starting = null;
          this.lastError = e.message;
          return reject(e);
        }
      }

      const jars = config.driverClasspath(cfg);
      const classpath = [P.javaOut].concat(jars).join(path.delimiter);
      const args = []
        .concat(cfg.java.options || [])
        .concat(['-cp', classpath, 'kr.foxnail.otuner.Bridge']);
      if (jars.length) args.push('--jars', jars.join(path.delimiter));

      log.info(`spawn ${java.java} (classpath entries=${jars.length + 1})`);
      const proc = spawn(java.java, args, {
        cwd: P.root,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, JAVA_TOOL_OPTIONS: '' }
      });

      this.proc = proc;
      this.ready = false;
      this.buffer = '';
      this.startedAt = new Date().toISOString();

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.starting = null;
        this.lastError = '브리지 기동 시간 초과(20초)';
        try { proc.kill(); } catch (e) { /* noop */ }
        reject(new Error(this.lastError));
      }, 20000);

      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let idx;
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, idx).replace(/\r$/, '');
          this.buffer = this.buffer.slice(idx + 1);
          if (!line) continue;
          if (!line.startsWith(MARK)) {
            log.info(`stdout: ${line}`);
            continue;
          }
          let msg;
          try {
            msg = JSON.parse(line.slice(MARK.length));
          } catch (e) {
            log.error(`응답 파싱 실패: ${e.message} :: ${line.slice(0, 200)}`);
            continue;
          }
          if (msg.event === 'ready') {
            this.ready = true;
            this.readyInfo = msg;
            log.info(`ready java=${msg.javaVersion} home=${msg.javaHome}`);
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              this.starting = null;
              resolve(msg);
            }
            continue;
          }
          if (msg.event) {
            // event 필드가 있는 메시지는 진행 이벤트다 — promise 를 resolve 하지 않는다.
            this._handleEvent(msg);
            continue;
          }
          this._resolve(msg);
        }
      });

      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) {
          if (line.trim()) log.raw(line);
        }
      });

      proc.on('error', (err) => {
        this.lastError = err.message;
        log.error(`spawn error: ${err.message}`);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.starting = null;
          reject(err);
        }
      });

      proc.on('exit', (code, signal) => {
        this.exitCount++;
        this.ready = false;
        this.proc = null;
        const why = `브리지 종료(code=${code}, signal=${signal})`;
        log.warn(why);
        this.lastError = why;
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          if (p.cmd === 'tournament' && p.sessionId) this._finishProgress(p.sessionId);
          p.reject(new Error(`${why} — 요청이 취소되었습니다. 다시 시도하면 자동으로 다시 띄웁니다.`));
        }
        this.pending.clear();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.starting = null;
          reject(new Error(why));
        }
      });
    });

    return this.starting;
  }

  _resolve(msg) {
    const p = this.pending.get(msg.id);
    if (!p) {
      log.warn(`대응되지 않는 응답 id=${msg.id}`);
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (p.cmd === 'tournament' && p.sessionId) this._finishProgress(p.sessionId);
    if (msg.ok) p.resolve(msg.data);
    else {
      const err = new Error((msg.error && msg.error.message) || '알 수 없는 오류');
      err.detail = msg.error || null;
      p.reject(err);
    }
  }

  /** 진행 이벤트(예: 토너먼트 progress) 처리. 요청 id 로 대기 중인 요청을 찾아 세션을 알아낸다. */
  _handleEvent(msg) {
    if (msg.event !== 'progress') return;
    const p = this.pending.get(msg.id);
    const sessionId = (p && p.sessionId) || msg.sessionId;
    if (!sessionId) return;
    const prev = this.progressBySession.get(sessionId);
    this.progressBySession.set(sessionId, {
      done: msg.done,
      total: msg.total,
      phase: msg.phase || null,
      label: msg.label || null,
      startedAt: (prev && prev.startedAt) || Date.now(),
      finished: false,
      ts: Date.now()
    });
  }

  /** 토너먼트가 끝났음을 표시한다(정상·실패·타임아웃 무관). UI 가 99% 에서 멈추지 않게 한다. */
  _finishProgress(sessionId) {
    const prev = this.progressBySession.get(sessionId);
    if (!prev) return;
    this.progressBySession.set(sessionId, {
      ...prev,
      done: prev.total != null ? prev.total : prev.done,
      finished: true,
      ts: Date.now()
    });
  }

  /** 세션의 최신 토너먼트 진행률(없으면 null). api.js 가 폴링 라우트에서 쓴다. */
  getProgress(sessionId) {
    return this.progressBySession.get(sessionId) || null;
  }

  /**
   * 명령을 보내고 응답을 기다린다.
   * @param {string} cmd
   * @param {object} params
   * @param {number} [timeoutMs] 기본 120초. 긴 질의는 호출부에서 늘린다.
   */
  async request(cmd, params, timeoutMs) {
    await this.start();
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error('브리지에 쓸 수 없습니다(프로세스가 종료됨).');
    }
    const id = String(++this.seq);
    const payload = JSON.stringify({ id, cmd, params: params || {} });
    const ms = timeoutMs || 120000;
    const sessionId = (params && params.sessionId) || null;
    if (cmd === 'tournament' && sessionId) {
      // 첫 이벤트가 오기 전까지는 total 을 모른다 — 불확정 상태로 시작해 폴링이 바로 running:true 를 보게 한다.
      this.progressBySession.set(sessionId, {
        done: 0, total: null, phase: null, label: null,
        startedAt: Date.now(), finished: false, ts: Date.now()
      });
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (cmd === 'tournament' && sessionId) this._finishProgress(sessionId);
        reject(new Error(`요청 시간 초과(${Math.round(ms / 1000)}초): ${cmd}`));
      }, ms);
      this.pending.set(id, { resolve, reject, timer, cmd, sessionId });
      this.proc.stdin.write(payload + '\n', 'utf8', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          if (cmd === 'tournament' && sessionId) this._finishProgress(sessionId);
          reject(err);
        }
      });
    });
  }

  /** 설정 변경 후 새 JDK/드라이버로 다시 띄운다. 열린 DB 세션은 모두 끊긴다. */
  async restart() {
    await this.stop();
    config.load(true);
    return this.start();
  }

  async stop() {
    if (!this.proc) return;
    const proc = this.proc;
    try {
      if (proc.stdin.writable) {
        proc.stdin.write(JSON.stringify({ id: 'bye', cmd: 'shutdown' }) + '\n');
        proc.stdin.end();
      }
    } catch (e) { /* 이미 죽었을 수 있다 */ }
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try { proc.kill(); } catch (e) { /* noop */ }
        resolve();
      }, 3000);
      proc.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
    this.proc = null;
    this.ready = false;
  }
}

module.exports = new Bridge();
