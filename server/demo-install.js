'use strict';
/**
 * 데모 설치 — 예제 SQL 을 SQL 라이브러리에 넣어 화면 [SQL 목록]에서 바로 열 수 있게 한다.
 *
 * 사용:
 *   node server/demo-install.js              # 공용(_shared) 목록에 설치
 *   node server/demo-install.js conn_c12ab3  # 특정 접속 스코프에 설치
 *   node server/demo-install.js _shared ja   # 일본어 이름으로 설치
 *   (npm run install-demo 은 tools/install-demo.js 래퍼를 거쳐 여기로 온다)
 *
 * 설치되는 것
 *   ① 데모 데이터 만들기      (01-setup.sql   — 30만 건 표 + 인덱스 + 통계)
 *   ①~⑧ 튜닝 예제 SQL        (02-examples.js — 튜닝 경합이 실제로 나는 것들)
 *   ⑨ 데모 데이터 정리        (09-cleanup.sql)
 *
 * 데이터를 만들 때는 [설정] → 안전모드를 꺼야 INSERT 가 남습니다(안전모드는 DML 을 자동 롤백).
 *
 * ── 다국어 ────────────────────────────────────────────────────────────────
 * 예제의 이름·설명·주석은 ko/en/ja/zh 4벌을 원본에 담아 두고
 * <b>설치 시점의 로케일</b>로 하나를 골라 저장한다(localize).
 *
 * <p><b>왜 설치 시점인가</b> — 스니펫은 이름이 곧 레코드 키(파일명, snippet-store.safeName)다.
 * 언어를 바꿀 때마다 표시명을 갈아끼우려면 저장된 레코드를 리네임하거나(사용자가 고친
 * 내용·이름이 날아간다) 표시명과 키를 분리해야 하는데, 후자는 저장소·목록·워크벤치 도크·
 * 사전까지 번지는 큰 변경이다. 게다가 데모 스니펫은 <b>사용자가 편집·삭제할 수 있는 데이터</b>라
 * 사용자가 고친 뒤에도 사전이 이름을 덮어쓰면 오히려 거짓말이 된다.
 * 설치 시점 고정이 이 저장 모델과 맞고, 다시 설치하면 그 언어로 다시 깔린다.
 */

const fs = require('fs');
const path = require('path');
const P = require('../server/paths');
const snippets = require('../server/snippet-store');

const DEMO_DIR = path.join(P.root, 'demo');

/** 지원 로케일. web/js/i18n.js 의 LANGS 와 같아야 한다. */
const LANGS = ['ko', 'en', 'ja', 'zh'];

/**
 * 데모 예제가 담기는 폴더(첫 태그) 이름. 로케일별 표기.
 * ko 값('데모')이 원본 데이터에 적힌 raw 태그이고, 나머지는 설치 시 치환된다.
 * 화면쪽 대응은 web/js/views/library.js 의 DEMO_FOLDERS.
 */
const DEMO_FOLDER = { ko: '데모', en: 'Demo', ja: 'デモ', zh: '演示' };

function safeLang(lang) {
  const s = String(lang || '').slice(0, 2).toLowerCase();
  return LANGS.includes(s) ? s : 'ko';
}

/** {ko,en,ja,zh} 객체면 해당 언어를 고르고, 문자열이면 그대로 쓴다. */
function pick(v, lang) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v[lang] !== undefined ? v[lang] : v.ko;
  return v;
}

/**
 * 예제 한 건을 지정 로케일의 저장용 레코드로 만든다.
 *
 * <p>note(설명 주석)는 `-- ` 를 붙여 SQL 맨 앞에 얹는다. 번역 대상은 이 note 뿐이고
 * <b>sql 본문은 어떤 로케일에서도 글자 하나 바뀌지 않는다</b>(표·컬럼명 보호).
 */
function localize(item, lang) {
  const L = safeLang(lang);
  const tags = (item.tags || []).map((tg) => (tg === DEMO_FOLDER.ko ? DEMO_FOLDER[L] : tg));
  const note = pick(item.note, L);
  const lines = Array.isArray(note) ? note : (note ? [note] : []);
  const head = lines.map((s) => `-- ${s}`).join('\n');
  return {
    name: pick(item.name, L),
    tags,
    desc: pick(item.desc, L) || '',
    sql: head ? `${head}\n${item.sql}` : item.sql
  };
}

/**
 * demo/*.sql 을 읽는다. 파일 앞머리의 `--@ 키: 값` 메타를 이름/태그/설명으로 쓴다.
 * `--@ name.ja:` 처럼 로케일 접미사를 붙이면 그 언어 값이 된다.
 * 반환 형태는 02-examples.js 의 한 건과 같다(name/desc 가 {ko,en,ja,zh}).
 */
function readSqlFile(file) {
  const text = fs.readFileSync(path.join(DEMO_DIR, file), 'utf8');
  const base = file.replace(/\.sql$/, '');
  const meta = { name: { ko: base }, tags: [DEMO_FOLDER.ko], desc: {} };
  const lines = text.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^--@\s*(\w+)(?:\.(\w+))?\s*:\s*(.*)$/);
    if (!m) break;
    const k = m[1].toLowerCase();
    const lang = safeLang(m[2] || 'ko');
    const v = m[3].trim();
    if (k === 'name') meta.name[lang] = v;
    else if (k === 'desc') meta.desc[lang] = v;
    else if (k === 'tags') meta.tags = v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  meta.sql = lines.slice(i).join('\n').replace(/^\s*\n/, '');
  return meta;
}

/** 설치할 데모 항목 전체(01-setup → 예제 8건 → 09-drop)를 지정 로케일로 만든다. */
function demoItems(lang) {
  const L = safeLang(lang);
  const raw = [readSqlFile('01-setup.sql')]
    .concat(require(path.join(DEMO_DIR, '02-examples.js')))
    .concat([readSqlFile('09-drop.sql')]);
  return raw.map((it) => localize(it, L));
}

function main() {
  const scope = process.argv[2] || '_shared';
  const lang = safeLang(process.argv[3]);
  P.ensureDirs();

  const items = demoItems(lang);
  let n = 0;
  for (const it of items) {
    snippets.save(scope, { name: it.name, tags: it.tags, desc: it.desc, sql: it.sql });
    n++;
  }

  console.log('');
  console.log(`[OK] 데모 SQL ${n}건을 설치했습니다 (스코프: ${scope}, 언어: ${lang})`);
  console.log('');
  console.log('다음 순서로 해보세요:');
  console.log(`  1) 브라우저에서 [SQL 목록] 탭 → "${DEMO_FOLDER[lang]}" 폴더 확인`);
  console.log('  2) [설정] → 안전모드 끄기  ← INSERT 가 롤백되지 않도록');
  console.log(`  3) "${items[0].name}" 를 워크벤치로 열어 [전체 실행] (30만 건이라 1~2분)`);
  console.log('  4) [설정] → 안전모드 다시 켜기 (권장)');
  console.log('  5) 예제 SQL 을 열고 → [튜닝 후보] 탭 → [후보 생성] → [토너먼트 실행]');
  console.log('');
}

if (require.main === module) main();

module.exports = { readSqlFile, demoItems, localize, main, DEMO_FOLDER, LANGS };
