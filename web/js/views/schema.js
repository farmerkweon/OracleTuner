/**
 * 스키마 탐색기.
 *
 * 권한이 없으면 없는 대로 보여준다 — 조회에 사용한 출처(ALL_/USER_/JDBC/DESCRIBE_QUERY)를
 * 화면에 그대로 표시해, 사용자가 "이 정보가 어디서 온 것인지" 알 수 있게 한다.
 */

import { $, $$, el, esc, toast, errText, withBusy, fmtNum } from '../util.js';
import { api, session } from '../api.js';
import { renderTable, makeGrid } from '../gridkit.js';

const state = { owner: '', table: '', tab: 'columns', cache: {} };
let editorsRef = null;

export function initSchema(opts = {}) {
  editorsRef = opts.editors || null;

  $('#btn-schema-refresh').addEventListener('click', loadObjects);
  $('#schema-filter').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadObjects(); });
  $('#schema-owner').addEventListener('change', () => {
    state.owner = $('#schema-owner').value;
    loadObjects();
  });
  for (const t of $$('.stab[data-stab]')) {
    t.addEventListener('click', () => {
      state.tab = t.dataset.stab;
      for (const x of $$('.stab')) x.classList.toggle('is-active', x === t);
      loadDetail();
    });
  }
  $('#btn-gen-select').addEventListener('click', generateSelect);
  $('#btn-count-rows').addEventListener('click', countRows);
}

/** 접속 직후 스키마 목록을 채운다. */
export async function onConnected() {
  const sel = $('#schema-owner');
  sel.innerHTML = '';
  if (!session.connected) return;
  try {
    const r = await api.schemas();
    const rows = r.rows || [];
    const current = (session.meta && session.meta.server && session.meta.server.currentSchema) || '';
    for (const row of rows) {
      const owner = row.owner || row.OWNER;
      const opt = el('option', { value: owner, text: row.table_count ? `${owner} (${row.table_count})` : owner });
      sel.appendChild(opt);
    }
    if (current && rows.some((x) => (x.owner || x.OWNER) === current)) sel.value = current;
    state.owner = sel.value || current;
    if (r.note) $('#schema-detail-title').textContent = r.note;
  } catch (e) {
    toast(`스키마 목록 조회 실패: ${errText(e)}`, 'warn');
  }
}

export async function loadObjects() {
  if (!session.connected) return toast('DB 에 접속하세요.', 'warn');
  const btn = $('#btn-schema-refresh');
  await withBusy(btn, async () => {
    try {
      const r = await api.objects({
        owner: state.owner || $('#schema-owner').value,
        pattern: $('#schema-filter').value.trim(),
        limit: 1000
      });
      const rows = (r.rows || []).map((x) => ({
        owner: x.owner || x.OWNER || '',
        name: x.object_name || x.OBJECT_NAME || '',
        type: x.object_type || x.OBJECT_TYPE || '',
        status: x.status || x.STATUS || '',
        lastDdl: x.last_ddl_time || ''
      }));
      const grid = renderTable($('#grid-objects'), rows, [
        { field: 'name', header: '객체명', width: 210 },
        { field: 'type', header: '유형', width: 110 },
        { field: 'status', header: '상태', width: 80 },
        { field: 'lastDdl', header: '최종 DDL', width: 150 }
      ], {
        rowNumber: false,
        onRowClick: (e) => selectTable(e.row.owner || state.owner, e.row.name),
        onRowDblClick: (e) => {
          selectTable(e.row.owner || state.owner, e.row.name);
          generateSelect();
        }
      });
      $('#schema-detail-title').innerHTML =
        `${esc(String(rows.length))}개 객체 · 출처 <b>${esc(r.source)}</b>` +
        (r.note ? ` <span class="muted">(${esc(r.note)})</span>` : '');
    } catch (e) {
      $('#grid-objects').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
    }
  }, '…');
}

function selectTable(owner, name) {
  state.owner = owner || state.owner;
  state.table = name;
  state.cache = {};
  $('#schema-detail-title').innerHTML = `<b>${esc(state.owner)}.${esc(name)}</b>`;
  loadDetail();
}

async function loadDetail() {
  if (!state.table) return;
  const host = $('#grid-schema-detail');
  host.innerHTML = '<div class="pad muted">조회 중…</div>';
  const key = `${state.owner}.${state.table}.${state.tab}`;
  try {
    let r = state.cache[key];
    if (!r) {
      const args = { owner: state.owner, table: state.table };
      r = state.tab === 'columns' ? await api.columns(args)
        : state.tab === 'indexes' ? await api.indexes(args)
        : state.tab === 'constraints' ? await api.constraints(args)
        : await loadStats(args);
      state.cache[key] = r;
    }
    const rows = r.rows || [];
    const cols = COLUMN_DEFS[state.tab];
    renderTable(host, rows, cols, { rowNumber: false });
    const src = el('div');
    $('#schema-detail-title').innerHTML =
      `<b>${esc(state.owner)}.${esc(state.table)}</b> — ${esc(String(rows.length))}건 · 출처 <b>${esc(r.source)}</b>` +
      (r.note ? ` <span class="muted">(${esc(r.note)})</span>` : '');
  } catch (e) {
    host.innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
  }
}

async function loadStats(args) {
  const [t, c] = await Promise.all([api.tableStats(args), api.columnStats(args).catch(() => ({ rows: [], source: 'NONE' }))]);
  const rows = [];
  for (const r of (t.rows || [])) {
    rows.push({ kind: '테이블', name: state.table, num_rows: r.num_rows, blocks: r.blocks, avg_row_len: r.avg_row_len, last_analyzed: r.last_analyzed, extra: r.stale_stats || '' });
  }
  for (const r of (c.rows || [])) {
    rows.push({
      kind: '컬럼', name: r.column_name, num_rows: r.num_distinct, blocks: r.num_nulls,
      avg_row_len: r.avg_col_len, last_analyzed: '', extra: `밀도 ${r.density || '-'} / ${r.histogram || 'NONE'}`
    });
  }
  return { rows, source: `${t.source}${c.source !== 'NONE' ? ' + ' + c.source : ''}`, note: t.note || c.note };
}

const COLUMN_DEFS = {
  columns: [
    { field: 'column_id', header: '#', width: 50, align: 'right' },
    { field: 'column_name', header: '컬럼명', width: 190 },
    { field: 'data_type', header: '타입', width: 120 },
    { field: 'data_length', header: '길이', width: 70, align: 'right' },
    { field: 'data_precision', header: '정밀도', width: 70, align: 'right' },
    { field: 'data_scale', header: '스케일', width: 70, align: 'right' },
    { field: 'nullable', header: 'NULL', width: 60, align: 'center' },
    { field: 'data_default', header: '기본값', width: 160 }
  ],
  indexes: [
    { field: 'index_name', header: '인덱스명', width: 200 },
    { field: 'columns', header: '구성 컬럼', width: 260 },
    { field: 'uniqueness', header: '유일성', width: 90 },
    { field: 'index_type', header: '유형', width: 110 },
    { field: 'status', header: '상태', width: 80 },
    { field: 'num_rows', header: '행수', width: 100, align: 'right' },
    { field: 'distinct_keys', header: '고유키', width: 90, align: 'right' },
    { field: 'clustering_factor', header: '군집도', width: 90, align: 'right' },
    { field: 'blevel', header: 'BLevel', width: 70, align: 'right' },
    { field: 'last_analyzed', header: '최종분석', width: 110 }
  ],
  constraints: [
    { field: 'constraint_name', header: '제약명', width: 220 },
    { field: 'constraint_type', header: '유형', width: 70, align: 'center' },
    { field: 'columns', header: '컬럼', width: 240 },
    { field: 'status', header: '상태', width: 90 },
    { field: 'r_constraint_name', header: '참조 제약', width: 200 },
    { field: 'search_condition', header: '조건', width: 260 }
  ],
  stats: [
    { field: 'kind', header: '구분', width: 70 },
    { field: 'name', header: '대상', width: 190 },
    { field: 'num_rows', header: '행수/고유값', width: 120, align: 'right' },
    { field: 'blocks', header: '블록/NULL수', width: 120, align: 'right' },
    { field: 'avg_row_len', header: '평균길이', width: 90, align: 'right' },
    { field: 'last_analyzed', header: '최종분석', width: 150 },
    { field: 'extra', header: '비고', width: 220 }
  ]
};

/** 선택한 테이블의 SELECT 문을 만들어 워크벤치로 보낸다. */
async function generateSelect() {
  if (!state.table) return toast('테이블을 선택하세요.', 'warn');
  try {
    const r = await api.columns({ owner: state.owner, table: state.table });
    const names = (r.rows || []).map((c) => c.column_name).filter(Boolean);
    const cols = names.length ? names.join('\n     , ') : '*';
    const sql = `SELECT ${cols}\n  FROM ${state.owner}.${state.table}\n WHERE 1 = 1\n;`;
    if (editorsRef && editorsRef.before) {
      const ed = editorsRef.before;
      ed.setValue(ed.value ? `${ed.value}\n\n${sql}` : sql);
      toast('워크벤치(튜닝 전)에 SELECT 문을 추가했습니다.', 'ok');
      document.querySelector('.rail-tab[data-view="workbench"]').click();
    }
  } catch (e) {
    toast(errText(e), 'err');
  }
}

/** 통계를 못 볼 때를 위한 실제 행수 실측. 비용이 크므로 확인을 받는다. */
async function countRows() {
  if (!state.table) return toast('테이블을 선택하세요.', 'warn');
  if (!confirm(`${state.owner}.${state.table} 의 실제 행수를 COUNT(*) 로 셉니다.\n큰 테이블이면 시간이 오래 걸릴 수 있습니다. 진행할까요?`)) return;
  const btn = $('#btn-count-rows');
  await withBusy(btn, async () => {
    try {
      const r = await api.estimateRows({ owner: state.owner, table: state.table, timeoutSec: 300 });
      if (r.ok) {
        toast(`${state.table}: ${fmtNum(r.rows)}행 (${Math.round(r.elapsedMs)}ms)`, 'ok', 6000);
      } else {
        toast(`실측 실패: ${r.error}`, 'err', 6000);
      }
    } catch (e) {
      toast(errText(e), 'err');
    }
  }, '세는 중…');
}
