/**
 * 힌트 위저드 — 힌트를 직접 몰라도 "상황"만 고르면 넣어준다.
 *
 * <p>동작
 * <ul>
 *   <li>현재 편집기 SQL 을 브라우저 토크나이저로 파싱해 최상위 테이블·별칭을 뽑는다.</li>
 *   <li>접속돼 있으면 각 테이블의 인덱스를 불러와 드롭다운으로 채운다(없으면 직접 입력).</li>
 *   <li>각 힌트는 <b>쉬운 말 설명 + "언제 쓰나"</b>를 함께 보여준다(4개 언어).</li>
 *   <li>고르면 힌트 문자열을 만들어 <code>/api/sql/add-hint</code> 로 현재 문장에 삽입한다.</li>
 * </ul>
 *
 * <p>힌트 지식은 서버 candidates.js 와 같은 계열이지만, 여기서는 "사용자가 직접 고르는" 용도라
 * 파라미터(테이블/인덱스/숫자)를 입력받는 UI 를 얹었다.
 */

import { $, el, esc, toast, errText, withBusy } from '../util.js';
import { t, getLang } from '../i18n.js';
import { api, session } from '../api.js';

let ctx = { getSql: null, replace: null };
let side = 'after';
let tables = [];        // [{name, alias, ref}]
let indexesByTable = {}; // {TABLE: [indexName]}

/**
 * 힌트 카탈로그. 각 항목:
 *  id, cat(카테고리), needs(입력 필요: 'table'|'index'|'number'|null), build(값→힌트문자열),
 *  name/desc: {ko,en,ja,zh}
 */
const CATALOG = [
  // ── 접근 경로 ──
  {
    id: 'FULL', cat: 'access', needs: 'table',
    name: { ko: '전체 스캔 강제 (FULL)', en: 'Force full scan (FULL)', ja: '全表スキャン (FULL)', zh: '强制全表扫描 (FULL)' },
    desc: {
      ko: '테이블을 통째로 읽습니다. 대부분의 행을 읽는 질의라면 인덱스보다 빠릅니다.',
      en: 'Reads the whole table. Faster than an index when most rows are read.',
      ja: '表を丸ごと読みます。多くの行を読む場合はインデックスより速い。',
      zh: '整表读取。读取大部分行时比索引更快。'
    },
    build: (v) => `FULL(${v.table})`
  },
  {
    id: 'INDEX', cat: 'access', needs: 'index',
    name: { ko: '인덱스 사용 (INDEX)', en: 'Use index (INDEX)', ja: 'インデックス使用 (INDEX)', zh: '使用索引 (INDEX)' },
    desc: {
      ko: '지정한 인덱스로 접근합니다. 조건이 인덱스 앞 컬럼을 포함하고 적은 행만 고를 때 효과적입니다.',
      en: 'Access via the chosen index. Best when the condition hits the index\'s leading column and selects few rows.',
      ja: '指定インデックスで接近。条件が先頭列を含み少数行を選ぶ場合に有効。',
      zh: '通过所选索引访问。当条件命中索引前导列且选择少量行时有效。'
    },
    build: (v) => `INDEX(${v.table} ${v.index})`
  },
  {
    id: 'INDEX_FFS', cat: 'access', needs: 'index',
    name: { ko: '인덱스 고속 전체 스캔 (INDEX_FFS)', en: 'Index fast full scan', ja: 'インデックス高速全走査', zh: '索引快速全扫描' },
    desc: {
      ko: '필요한 컬럼이 인덱스에 다 있으면 테이블을 안 읽고 인덱스만 훑습니다.',
      en: 'If all needed columns are in the index, scans the index without touching the table.',
      ja: '必要な列がインデックスに揃っていれば表を読まずインデックスのみ走査。',
      zh: '若所需列都在索引中，则只扫索引不读表。'
    },
    build: (v) => `INDEX_FFS(${v.table} ${v.index})`
  },
  // ── 조인 ──
  {
    id: 'USE_HASH', cat: 'join', needs: 'table',
    name: { ko: '해시 조인 (USE_HASH)', en: 'Hash join (USE_HASH)', ja: 'ハッシュ結合 (USE_HASH)', zh: '哈希连接 (USE_HASH)' },
    desc: {
      ko: '대량 데이터를 통째로 조인할 때 유리합니다. 양쪽 다 행이 많을 때 씁니다.',
      en: 'Good for joining large sets in bulk. Use when both sides have many rows.',
      ja: '大量データを一括結合するのに有利。両側とも行が多いときに。',
      zh: '适合批量连接大数据集。两侧行都很多时使用。'
    },
    build: (v) => `USE_HASH(${v.table})`
  },
  {
    id: 'USE_NL', cat: 'join', needs: 'table',
    name: { ko: '중첩 루프 조인 (USE_NL)', en: 'Nested loop join (USE_NL)', ja: 'ネストループ結合', zh: '嵌套循环连接' },
    desc: {
      ko: '바깥 결과가 적고 안쪽 조인 컬럼에 인덱스가 있을 때 가장 빠릅니다.',
      en: 'Fastest when the outer result is small and the inner join column is indexed.',
      ja: '外側の結果が少なく内側の結合列にインデックスがあると最速。',
      zh: '外侧结果少且内侧连接列有索引时最快。'
    },
    build: (v) => `USE_NL(${v.table})`
  },
  {
    id: 'LEADING', cat: 'join', needs: 'order',
    name: { ko: '조인 순서 지정 (LEADING)', en: 'Join order (LEADING)', ja: '結合順序 (LEADING)', zh: '连接顺序 (LEADING)' },
    desc: {
      ko: '어느 테이블부터 조인할지 정합니다. 많이 걸러내는 테이블을 먼저 두면 유리합니다.',
      en: 'Sets which table to join first. Put the most selective table first.',
      ja: 'どの表から結合するかを指定。絞り込みが強い表を先に。',
      zh: '指定先连接哪个表。把过滤最强的表放在前面。'
    },
    build: (v) => `LEADING(${v.order})`
  },
  // ── 옵티마이저 목표 ──
  {
    id: 'FIRST_ROWS', cat: 'opt', needs: 'number', def: 100,
    name: { ko: '첫 화면 빠르게 (FIRST_ROWS)', en: 'First rows fast', ja: '最初の行を速く', zh: '首屏更快' },
    desc: {
      ko: '앞부분 N건이 빨리 나오게 합니다. 목록·페이징 조회에 좋습니다.',
      en: 'Makes the first N rows appear quickly. Good for list/paging screens.',
      ja: '最初の N 行が速く出るように。一覧・ページング向き。',
      zh: '让前 N 行更快出现。适合列表/分页查询。'
    },
    build: (v) => `FIRST_ROWS(${v.number})`
  },
  {
    id: 'ALL_ROWS', cat: 'opt', needs: null,
    name: { ko: '전체 처리량 우선 (ALL_ROWS)', en: 'All rows throughput', ja: '全件スループット', zh: '全量吞吐优先' },
    desc: {
      ko: '전체 결과를 다 뽑는 총 시간을 최소화합니다. 배치·집계에 좋습니다.',
      en: 'Minimizes total time to fetch all rows. Good for batch/aggregation.',
      ja: '全件取得の総時間を最小化。バッチ・集計向き。',
      zh: '最小化取全部结果的总时间。适合批处理/聚合。'
    },
    build: () => 'ALL_ROWS'
  },
  {
    id: 'PARALLEL', cat: 'opt', needs: 'number', def: 4, risk: 'experimental',
    name: { ko: '병렬 처리 (PARALLEL)', en: 'Parallel (PARALLEL)', ja: '並列処理 (PARALLEL)', zh: '并行处理 (PARALLEL)' },
    desc: {
      ko: '여러 프로세스가 나눠 처리해 빨라지지만 자원을 크게 씁니다. 배치에만 쓰세요.',
      en: 'Splits work across processes — faster but heavy on resources. Batch only.',
      ja: '複数プロセスで分担。速いが資源を多く使う。バッチ限定。',
      zh: '多进程分担，更快但耗资源。仅用于批处理。'
    },
    build: (v) => `PARALLEL(${v.number})`
  },
  // ── 서브쿼리 / 뷰 / WITH ──
  {
    id: 'UNNEST', cat: 'sub', needs: null,
    name: { ko: '서브쿼리를 조인으로 (UNNEST)', en: 'Subquery to join (UNNEST)', ja: 'サブクエリを結合に', zh: '子查询转连接' },
    desc: {
      ko: '반복 실행되던 서브쿼리를 한 번의 조인으로 바꿉니다.',
      en: 'Turns a repeatedly-run subquery into a single join.',
      ja: '繰り返し実行されるサブクエリを一度の結合に。',
      zh: '将反复执行的子查询转为一次连接。'
    },
    build: () => 'UNNEST'
  },
  {
    id: 'PUSH_PRED', cat: 'sub', needs: null,
    name: { ko: '조건을 뷰 안으로 (PUSH_PRED)', en: 'Push predicate into view', ja: '条件をビュー内へ', zh: '条件下推入视图' },
    desc: {
      ko: '바깥 조건을 인라인뷰 안으로 밀어 중간 결과를 줄입니다.',
      en: 'Pushes outer conditions into the inline view to shrink intermediate rows.',
      ja: '外側条件をインラインビュー内に押し込み中間結果を削減。',
      zh: '将外部条件下推入内联视图以减少中间结果。'
    },
    build: () => 'PUSH_PRED'
  },
  {
    id: 'MATERIALIZE', cat: 'sub', needs: null,
    name: { ko: 'WITH 결과 고정 (MATERIALIZE)', en: 'Materialize WITH', ja: 'WITH を実体化', zh: '固化 WITH 结果' },
    desc: {
      ko: 'WITH 절 결과를 임시 테이블에 담아 반복 계산을 없앱니다. 여러 번 참조할 때.',
      en: 'Stores the WITH result in a temp table to avoid recomputation. When referenced multiple times.',
      ja: 'WITH の結果を一時表に保持し再計算を回避。複数回参照する場合。',
      zh: '将 WITH 结果存入临时表以避免重复计算。多次引用时。'
    },
    build: () => 'MATERIALIZE'
  },
  // ── 기타 ──
  {
    id: 'USE_CONCAT', cat: 'etc', needs: null,
    name: { ko: 'OR 를 각각 인덱스로 (USE_CONCAT)', en: 'OR expansion (USE_CONCAT)', ja: 'OR を各々インデックスに', zh: 'OR 各自走索引' },
    desc: {
      ko: 'OR 로 묶인 조건을 분기로 나눠 각각 인덱스를 타게 합니다.',
      en: 'Splits OR conditions into branches so each can use an index.',
      ja: 'OR 条件を分岐に分けそれぞれインデックスを使わせる。',
      zh: '将 OR 条件拆分为分支，使各自可走索引。'
    },
    build: () => 'USE_CONCAT'
  }
];

const CAT_KEY = { access: 'hw.catAccess', join: 'hw.catJoin', opt: 'hw.catOpt', sub: 'hw.catSub', etc: 'hw.catEtc' };
const CAT_ORDER = ['access', 'join', 'opt', 'sub', 'etc'];

export function initHintWizard(opts = {}) {
  ctx.getSql = opts.getSql || (() => '');
  ctx.replace = opts.replace || (() => {});
  $('#modal-hint').addEventListener('click', (e) => {
    if (e.target.id === 'modal-hint' || e.target.hasAttribute('data-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal-hint').hidden) close();
  });
}

/** @param {'before'|'after'} s 힌트를 넣을 편집기 */
export async function open(s) {
  side = s || 'after';
  const sql = ctx.getSql(side);
  if (!sql.trim()) { toast(t('hw.emptySql'), 'warn'); return; }

  // 브라우저 토크나이저로 최상위 테이블·별칭 파싱
  const tk = globalThis.SqlTokenizer;
  const a = tk ? tk.analyze(sql) : { tables: [] };
  tables = (a.tables || [])
    .filter((x) => !x.inline && x.name && x.name !== '(inline view)' && x.depth === 0)
    .map((x) => ({
      name: String(x.name).replace(/"/g, ''),
      alias: x.alias ? String(x.alias).replace(/"/g, '') : '',
      ref: (x.alias || x.name).toString().replace(/"/g, '')
    }));
  indexesByTable = {};

  $('#modal-hint').hidden = false;
  const nt = $('#hw-notables');
  if (!tables.length) { nt.hidden = false; nt.textContent = t('hw.noTables'); }
  else { nt.hidden = true; }

  render();

  // 접속돼 있으면 인덱스를 백그라운드로 채운다(있으면 드롭다운으로 승격)
  if (session.connected && tables.length) {
    for (const tbl of tables.slice(0, 6)) {
      try {
        const r = await api.indexes({ table: tbl.name });
        const names = (r.rows || []).map((x) => x.index_name || x.INDEX_NAME).filter(Boolean);
        if (names.length) { indexesByTable[tbl.name.toUpperCase()] = names; }
      } catch (e) { /* 권한 없으면 직접 입력 유지 */ }
    }
    render(); // 인덱스 반영해 다시 그린다
  }
}

export function close() { $('#modal-hint').hidden = true; }

function render() {
  const lang = getLang();
  const host = $('#hw-list');
  host.innerHTML = '';
  for (const cat of CAT_ORDER) {
    const items = CATALOG.filter((c) => c.cat === cat);
    if (!items.length) continue;
    host.appendChild(el('div', { class: 'hw-cat', text: t(CAT_KEY[cat]) }));
    for (const item of items) {
      host.appendChild(renderItem(item, lang));
    }
  }
}

function renderItem(item, lang) {
  const card = el('div', { class: 'hw-item' });
  const head = el('div', { class: 'hw-item-head' }, [
    el('div', { class: 'hw-item-name', text: item.name[lang] || item.name.ko }),
    item.risk === 'experimental' ? el('span', { class: 'sev-pill sev-high', text: t('cd.exp').split('(')[0].trim() }) : null
  ]);
  const desc = el('div', { class: 'hw-item-desc', text: item.desc[lang] || item.desc.ko });

  // 입력부
  const inputs = el('div', { class: 'hw-item-inputs' });
  const state = {};
  const tableSel = () => {
    const s = el('select', { class: 'text-input hw-sel' });
    for (const tb of tables) {
      const label = tb.alias ? `${tb.name} (${tb.alias})` : tb.name;
      s.appendChild(el('option', { value: tb.ref, 'data-name': tb.name, text: label }));
    }
    if (!tables.length) s.appendChild(el('option', { value: '', text: '—' }));
    return s;
  };

  if (item.needs === 'table' || item.needs === 'index') {
    const sel = tableSel();
    inputs.appendChild(labeled(t('hw.table'), sel));
    state.tableSel = sel;
  }
  if (item.needs === 'index') {
    const idxWrap = el('span', { class: 'hw-idx-wrap' });
    inputs.appendChild(labeled(t('hw.index'), idxWrap));
    state.idxWrap = idxWrap;
    const fillIdx = () => {
      const tname = (state.tableSel.selectedOptions[0] || {}).getAttribute
        ? state.tableSel.selectedOptions[0].getAttribute('data-name') : '';
      const names = indexesByTable[String(tname || '').toUpperCase()] || [];
      idxWrap.innerHTML = '';
      if (names.length) {
        const s = el('select', { class: 'text-input hw-sel' });
        for (const n of names) s.appendChild(el('option', { value: n, text: n }));
        idxWrap.appendChild(s);
        state.idxInput = s;
      } else {
        const inp = el('input', { class: 'text-input', placeholder: t('hw.indexPlaceholder') });
        idxWrap.appendChild(inp);
        state.idxInput = inp;
      }
    };
    fillIdx();
    state.tableSel.addEventListener('change', fillIdx);
  }
  if (item.needs === 'number') {
    const inp = el('input', { class: 'text-input hw-num', type: 'number', value: String(item.def || 1), min: '1', max: '9999' });
    inputs.appendChild(labeled(t('hw.value'), inp));
    state.numInput = inp;
  }
  if (item.needs === 'order') {
    const def = tables.map((tb) => tb.ref).join(' ');
    const inp = el('input', { class: 'text-input', value: def, placeholder: 'e p d' });
    inputs.appendChild(labeled(t('hw.table'), inp));
    state.orderInput = inp;
  }

  const applyBtn = el('button', { class: 'btn btn-sm btn-primary', text: t('hw.apply') });
  applyBtn.addEventListener('click', () => apply(item, state, applyBtn));

  card.appendChild(head);
  card.appendChild(desc);
  const foot = el('div', { class: 'hw-item-foot' }, [inputs, applyBtn]);
  card.appendChild(foot);
  return card;
}

function labeled(label, node) {
  return el('label', { class: 'hw-field' }, [el('span', { text: label }), node]);
}

async function apply(item, state, btn) {
  const v = {};
  if (item.needs === 'table' || item.needs === 'index') {
    if (!state.tableSel || !state.tableSel.value) { toast(t('hw.needTable'), 'warn'); return; }
    v.table = state.tableSel.value;
  }
  if (item.needs === 'index') {
    v.index = (state.idxInput && state.idxInput.value.trim()) || '';
    if (!v.index) { toast(t('hw.index'), 'warn'); return; }
  }
  if (item.needs === 'number') v.number = Number(state.numInput.value) || item.def || 1;
  if (item.needs === 'order') v.order = (state.orderInput.value || '').trim() || tables.map((tb) => tb.ref).join(' ');

  const hint = item.build(v);
  await withBusy(btn, async () => {
    try {
      const r = await api.addHint(ctx.getSql(side), hint);
      if (!r.ok) { toast(r.error || 'failed', 'warn'); return; }
      ctx.replace(side, r.sql);
      toast(`${t('hw.applied')} /*+ ${hint} */`, 'ok');
      close();
    } catch (e) {
      toast(errText(e), 'err');
    }
  }, '…');
}
