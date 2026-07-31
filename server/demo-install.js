'use strict';
/**
 * 데모 설치 — 예제 SQL 을 SQL 라이브러리에 넣어 화면 [SQL 목록]에서 바로 열 수 있게 한다.
 *
 * 사용:
 *   node tools/install-demo.js              # 공용(_shared) 목록에 설치
 *   node tools/install-demo.js conn_c12ab3  # 특정 접속 스코프에 설치
 *
 * 설치되는 것
 *   ① 데모 데이터 만들기      (01-setup.sql   — 30만 건 표 + 인덱스 + 통계)
 *   ①~⑧ 튜닝 예제 SQL        (02-examples.js — 튜닝 경합이 실제로 나는 것들)
 *   ⑨ 데모 데이터 정리        (09-cleanup.sql)
 *
 * 데이터를 만들 때는 [설정] → 안전모드를 꺼야 INSERT 가 남습니다(안전모드는 DML 을 자동 롤백).
 */

const fs = require('fs');
const path = require('path');
const P = require('../server/paths');
const snippets = require('../server/snippet-store');

const DEMO_DIR = path.join(P.root, 'demo');

function readSqlFile(file) {
  const text = fs.readFileSync(path.join(DEMO_DIR, file), 'utf8');
  // 파일 앞머리의 --@ 메타를 읽어 이름/태그/설명으로 쓴다
  const meta = { name: file.replace(/\.sql$/, ''), tags: ['데모'], desc: '' };
  const lines = text.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^--@\s*(\w+)\s*:\s*(.*)$/);
    if (!m) break;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === 'name') meta.name = v;
    else if (k === 'tags') meta.tags = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'desc') meta.desc = v;
  }
  meta.sql = lines.slice(i).join('\n').replace(/^\s*\n/, '');
  return meta;
}

function main() {
  const scope = process.argv[2] || '_shared';
  P.ensureDirs();

  const items = [];
  items.push(readSqlFile('01-setup.sql'));
  for (const ex of require(path.join(DEMO_DIR, '02-examples.js'))) {
    items.push({ name: ex.name, tags: ex.tags, desc: ex.desc, sql: ex.sql });
  }
  items.push(readSqlFile('09-drop.sql'));

  let n = 0;
  for (const it of items) {
    snippets.save(scope, { name: it.name, tags: it.tags, desc: it.desc, sql: it.sql });
    n++;
  }

  console.log('');
  console.log(`[OK] 데모 SQL ${n}건을 설치했습니다 (스코프: ${scope})`);
  console.log('');
  console.log('다음 순서로 해보세요:');
  console.log('  1) 브라우저에서 [SQL 목록] 탭 → "데모" 폴더 확인');
  console.log('  2) [설정] → 안전모드 끄기  ← INSERT 가 롤백되지 않도록');
  console.log('  3) "① 데모 데이터 만들기" 를 워크벤치로 열어 문장을 하나씩 실행 (30만 건이라 1~2분)');
  console.log('  4) [설정] → 안전모드 다시 켜기 (권장)');
  console.log('  5) 예제 SQL 을 열고 → [튜닝 후보] 탭 → [후보 생성] → [토너먼트 실행]');
  console.log('');
}

if (require.main === module) main();

module.exports = { readSqlFile, main };
