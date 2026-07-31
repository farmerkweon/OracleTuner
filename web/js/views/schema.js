/**
 * 스키마 탐색기.
 *
 * 권한이 없으면 없는 대로 보여준다 — 조회에 사용한 출처(ALL_/USER_/JDBC/DESCRIBE_QUERY)를
 * 화면에 그대로 표시해, 사용자가 "이 정보가 어디서 온 것인지" 알 수 있게 한다.
 */

import { $, $$, el, esc, toast, errText, withBusy, fmtNum } from '../util.js';
import { t } from '../i18n.js';
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
    toast(t('sc.listFailed', { err: errText(e) }), 'warn');
  }
}

export async function loadObjects() {
  if (!session.connected) return toast(t('sc.needConnect'), 'warn');
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
        { field: 'name', header: t('sc.colName'), width: 210 },
        { field: 'type', header: t('sc.colType'), width: 110 },
        { field: 'status', header: t('sc.colStatus'), width: 80 },
        { field: 'lastDdl', header: t('sc.colLastDdl'), width: 150 }
      ], {
        rowNumber: false,
        onRowClick: (e) => selectTable(e.row.owner || state.owner, e.row.name),
        onRowDblClick: (e) => {
          selectTable(e.row.owner || state.owner, e.row.name);
          generateSelect();
        }
      });
      $('#schema-detail-title').innerHTML =
        t('sc.objectsCount', { n: String(rows.length), source: esc(r.source) }) +
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
  const cnt = $('#sc-count-msg');
  if (cnt) cnt.textContent = ''; // 다른 표를 고르면 이전 표의 실측값은 지운다(D14)
  loadDetail();
}

async function loadDetail() {
  if (!state.table) return;
  const host = $('#grid-schema-detail');
  host.innerHTML = `<div class="pad muted">${esc(t('sc.loadingDetail'))}</div>`;
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
      `<b>${esc(state.owner)}.${esc(state.table)}</b> — ` + t('sc.detailCount', { n: String(rows.length), source: esc(r.source) }) +
      (r.note ? ` <span class="muted">(${esc(r.note)})</span>` : '');
  } catch (e) {
    host.innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
  }
}

async function loadStats(args) {
  const [ts, c] = await Promise.all([api.tableStats(args), api.columnStats(args).catch(() => ({ rows: [], source: 'NONE' }))]);
  const rows = [];
  for (const r of (ts.rows || [])) {
    rows.push({ kind: t('sc.kindTable'), name: state.table, num_rows: r.num_rows, blocks: r.blocks, avg_row_len: r.avg_row_len, last_analyzed: r.last_analyzed, extra: r.stale_stats || '' });
  }
  for (const r of (c.rows || [])) {
    rows.push({
      kind: t('sc.kindColumn'), name: r.column_name, num_rows: r.num_distinct, blocks: r.num_nulls,
      avg_row_len: r.avg_col_len, last_analyzed: '', extra: t('sc.density', { density: r.density || '-', histogram: r.histogram || 'NONE' })
    });
  }
  return { rows, source: `${ts.source}${c.source !== 'NONE' ? ' + ' + c.source : ''}`, note: ts.note || c.note };
}

const COLUMN_DEFS = {
  get columns() { return [
    { field: 'column_id', header: '#', width: 50, align: 'right' },
    { field: 'column_name', header: t('sc.colColumnName'), width: 190 },
    { field: 'data_type', header: t('sc.colDataType'), width: 120 },
    { field: 'data_length', header: t('sc.colLength'), width: 70, align: 'right' },
    { field: 'data_precision', header: t('sc.colPrecision'), width: 70, align: 'right' },
    { field: 'data_scale', header: t('sc.colScale'), width: 70, align: 'right' },
    { field: 'nullable', header: 'NULL', width: 60, align: 'center' },
    { field: 'data_default', header: t('sc.colDefault'), width: 160 }
  ]; },
  get indexes() { return [
    { field: 'index_name', header: t('sc.colIndexName'), width: 200 },
    { field: 'columns', header: t('sc.colIndexColumns'), width: 260 },
    { field: 'uniqueness', header: t('sc.colUniqueness'), width: 90 },
    { field: 'index_type', header: t('sc.colType'), width: 110 },
    { field: 'status', header: t('sc.colStatus'), width: 80 },
    { field: 'num_rows', header: t('sc.colRows'), width: 100, align: 'right' },
    { field: 'distinct_keys', header: t('sc.colDistinctKeys'), width: 90, align: 'right' },
    { field: 'clustering_factor', header: t('sc.colClusteringFactor'), width: 90, align: 'right' },
    { field: 'blevel', header: 'BLevel', width: 70, align: 'right' },
    { field: 'last_analyzed', header: t('sc.colLastAnalyzed'), width: 110 }
  ]; },
  get constraints() { return [
    { field: 'constraint_name', header: t('sc.colConstraintName'), width: 220 },
    { field: 'constraint_type', header: t('sc.colType'), width: 70, align: 'center' },
    { field: 'columns', header: t('sc.colColumns'), width: 240 },
    { field: 'status', header: t('sc.colStatus'), width: 90 },
    { field: 'r_constraint_name', header: t('sc.colRefConstraint'), width: 200 },
    { field: 'search_condition', header: t('sc.colCondition'), width: 260 }
  ]; },
  get stats() { return [
    { field: 'kind', header: t('sc.colKind'), width: 70 },
    { field: 'name', header: t('sc.colTarget'), width: 190 },
    { field: 'num_rows', header: t('sc.colRowsDistinct'), width: 120, align: 'right' },
    { field: 'blocks', header: t('sc.colBlocksNulls'), width: 120, align: 'right' },
    { field: 'avg_row_len', header: t('sc.colAvgLen'), width: 90, align: 'right' },
    { field: 'last_analyzed', header: t('sc.colLastAnalyzed'), width: 150 },
    { field: 'extra', header: t('sc.colNote'), width: 220 }
  ]; }
};

/** 선택한 테이블의 SELECT 문을 만들어 워크벤치로 보낸다. */
async function generateSelect() {
  if (!state.table) return toast(t('sc.pickTable'), 'warn');
  try {
    const r = await api.columns({ owner: state.owner, table: state.table });
    const names = (r.rows || []).map((c) => c.column_name).filter(Boolean);
    const cols = names.length ? names.join('\n     , ') : '*';
    const sql = `SELECT ${cols}\n  FROM ${state.owner}.${state.table}\n WHERE 1 = 1\n;`;
    if (editorsRef && editorsRef.before) {
      const ed = editorsRef.before;
      ed.setValue(ed.value ? `${ed.value}\n\n${sql}` : sql);
      toast(t('sc.selectAdded'), 'ok');
      document.querySelector('.rail-tab[data-view="workbench"]').click();
    }
  } catch (e) {
    toast(errText(e), 'err');
  }
}

/** 행수 실측 결과를 토스트 + 인라인(#sc-count-msg) 양쪽에 남긴다(D14). */
function say(text, kind = 'ok') {
  const box = $('#sc-count-msg');
  if (box) box.textContent = text;
  toast(text, kind, 6000);
}

/** 통계를 못 볼 때를 위한 실제 행수 실측. 비용이 크므로 확인을 받는다. */
async function countRows() {
  if (!state.table) return toast(t('sc.pickTable'), 'warn');
  if (!confirm(t('sc.countConfirm', { owner: state.owner, table: state.table }))) return;
  const btn = $('#btn-count-rows');
  await withBusy(btn, async () => {
    try {
      const r = await api.estimateRows({ owner: state.owner, table: state.table, timeoutSec: 300 });
      // D14(QA-SWEEP): 토스트만 띄우면 6초 뒤 사라지고 화면에는 옵티마이저 추정치만 남아,
      // "추정치 말고 실측을 보려고" 누른 사용자가 결과를 못 찾는다. 인라인으로도 남긴다.
      if (r.ok) {
        say(t('sc.countResult', { table: state.table, rows: fmtNum(r.rows), ms: Math.round(r.elapsedMs) }), 'ok');
      } else {
        say(t('sc.countFailed', { err: r.error }), 'err');
      }
    } catch (e) {
      say(errText(e), 'err');
    }
  }, t('sc.counting'));
}
