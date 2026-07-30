'use strict';
/**
 * 가용 포트 탐색 — 설치 위저드(installer/wizard.ps1)와 서버가 반드시 같은 로직을 쓴다
 * (FIX-SPEC-slice-H Phase 2: "위저드와 서버가 같은 함수를 쓰게 하라. 로직을 두 번 쓰지 마라").
 *
 * 127.0.0.1 에만 바인딩해서 검사한다 — 0.0.0.0 에 바인딩하면 Windows 방화벽 팝업이 뜬다.
 *
 * PowerShell 위저드는 Node 모듈을 직접 require 할 수 없으므로, 이 파일은 라이브러리이자
 * CLI 두 역할을 겸한다. 위저드는 자식 프로세스로 node 를 호출해 JSON 결과를 읽는다:
 *
 *   node server/port-utils.js --check 7070
 *     → {"port":7070,"free":true}
 *   node server/port-utils.js --find 7070,7071,7080,8070,8080,9070
 *     → {"port":7080,"tried":[{"port":7070,"free":false}, ...]}
 *     → 후보가 모두 사용 중이면 {"port":null,"tried":[...]}
 */

const net = require('net');

/** 후보 목록(발주자 예시 그대로): 7070, 7071, 7080, 8070, 8080, 9070. */
const DEFAULT_CANDIDATES = [7070, 7071, 7080, 8070, 8080, 9070];
const HOST = '127.0.0.1';

/** 지정한 포트가 host 에서 비어 있는지 검사한다(열어보고 바로 닫는다). */
function isPortFree(port, host = HOST) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    let settled = false;
    const finish = (free) => {
      if (settled) return;
      settled = true;
      resolve(free);
    };
    srv.once('error', () => finish(false));
    srv.once('listening', () => {
      srv.close(() => finish(true));
    });
    try {
      srv.listen({ port, host, exclusive: true });
    } catch (e) {
      finish(false);
    }
  });
}

/** 후보 목록을 병렬로 검사해 각 포트의 사용 가능 여부를 원래 순서대로 돌려준다. */
async function checkPorts(candidates, host = HOST) {
  return Promise.all(candidates.map((p) => isPortFree(p, host).then((free) => ({ port: p, free }))));
}

/** 후보 중 순서상 처음으로 비어 있는 포트 하나를 찾는다(전부 사용 중이면 port:null). */
async function findAvailablePort(candidates = DEFAULT_CANDIDATES, host = HOST) {
  const tried = await checkPorts(candidates, host);
  const found = tried.find((r) => r.free);
  return { port: found ? found.port : null, tried };
}

module.exports = { isPortFree, checkPorts, findAvailablePort, DEFAULT_CANDIDATES, HOST };

// ── CLI (위저드가 자식 프로세스로 호출) ──────────────────────────────────────
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const cmd = args[0];
    try {
      if (cmd === '--check') {
        const port = Number(args[1]);
        if (!Number.isInteger(port) || port <= 0) throw new Error('포트 번호가 필요합니다.');
        const free = await isPortFree(port);
        process.stdout.write(JSON.stringify({ port, free }) + '\n');
      } else if (cmd === '--find') {
        const list = (args[1] ? args[1].split(',') : DEFAULT_CANDIDATES.map(String))
          .map(Number).filter((n) => Number.isInteger(n) && n > 0);
        const result = await findAvailablePort(list.length ? list : DEFAULT_CANDIDATES);
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        process.stderr.write('사용법: node port-utils.js --check <port> | --find [p1,p2,...]\n');
        process.exitCode = 2;
      }
    } catch (e) {
      process.stdout.write(JSON.stringify({ error: e.message }) + '\n');
      process.exitCode = 1;
    }
  })();
}
