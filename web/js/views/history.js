/**
 * 튜닝 이력 화면.
 *
 * 저장된 튜닝 기록을 목록으로 보여주고, 행을 펼치면 전/후 SQL 과 검증 결과를 한눈에 보여준다.
 * 여기서 워크벤치로 다시 불러오거나(이어서 작업), Markdown/SQL 로 내보낼 수 있다.
 */

import { $, $$, el, esc, toast, errText, fmtMs, fmtPct, fmtDate, fmtNum, logMsg } from '../util.js';
import { t } from '../i18n.js';
import { api } from '../api.js';
import { makeGrid } from '../gridkit.js';

let editorsRef = null;
let onLoadToWorkbench = null;

const STATUS_LABEL = { draft: '작성중', verified: '검증완료', applied: '적용됨', rejected: '보류' };
const VERDICT_LABEL = {
  IDENTICAL: '완전 동일', SAME_SET: '집합 동일', DIFFERENT: '결과 다름',
  INCONCLUSIVE: '비교 불가', SKIPPED: '미검증'
};

export function initHistory(opts = {}) {
  editorsRef = opts.editors || null;
  onLoadToWorkbench = opts.onLoad || (() => {});

  $('#btn-hist-refresh').addEventListener('click', refresh);
  $('#hist-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') refresh(); });
  $('#hist-status').addEventListener('change', refresh);
}

export async function refresh() {
  try {
    const r = await api.listTunings({
      q: $('#hist-q').value.trim(),
      status: $('#hist-status').value
    });
    const items = r.items || [];
    $('#hist-summary').textContent =
      `${items.length}건` + (r.tags && r.tags.length ? ` · 태그 ${r.tags.map((t) => `${t.tag}(${t.count})`).join(', ')}` : '');
    renderGrid(items);
  } catch (e) {
    $('#grid-history').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
  }
}

function renderGrid(items) {
  const host = $('#grid-history');
  if (!items.length) {
    const filtered = $('#hist-q').value.trim() || $('#hist-status').value;
    host.innerHTML = filtered
      ? `<div class="empty-guide"><div class="empty-icon">🔍</div>
          <div class="empty-title">검색 결과가 없습니다</div>
          <div class="empty-desc">검색어나 상태 필터를 바꿔보세요.</div></div>`
      : `<div class="empty-guide">
          <div class="empty-icon">📁</div>
          <div class="empty-title">아직 저장된 튜닝 기록이 없습니다</div>
          <div class="empty-desc">
            튜닝 이력은 <b>전/후 SQL·실행계획·검증 결과</b>를 한 건으로 묶어 파일로 남긴 기록입니다.<br>
            아래 순서로 첫 기록을 만들어 보세요:
          </div>
          <ol class="empty-steps">
            <li><b>워크벤치</b> 탭에서 튜닝 전/후 SQL 을 작성합니다.</li>
            <li><b>비교 검증</b>(Ctrl+Shift+K) 또는 <b>튜닝 후보</b> 토너먼트로 효과를 확인합니다.</li>
            <li>결과 영역 오른쪽 위 <b>[튜닝 저장]</b> 버튼을 누릅니다.</li>
            <li>여기 목록에 나타나고, 행을 펼치면 상세·내보내기·다시 불러오기가 됩니다.</li>
          </ol>
          <div class="empty-actions">
            <button class="btn btn-primary btn-sm" id="empty-go-wb">워크벤치로 가기</button>
          </div>
        </div>`;
    const go = $('#empty-go-wb');
    if (go) go.addEventListener('click', () => document.querySelector('.rail-tab[data-view="workbench"]').click());
    return;
  }

  const data = items.map((i) => ({
    ...i,
    statusHtml: `<span class="tag-pill ${i.status === 'applied' ? '' : i.status === 'rejected' ? 'warn' : ''}">${esc(STATUS_LABEL[i.status] || i.status)}</span>`,
    verdictHtml: i.verdict
      ? `<span class="sev-pill ${verdictClass(i.verdict)}">${esc(VERDICT_LABEL[i.verdict] || i.verdict)}</span>`
      : '<span class="muted">-</span>',
    improveText: i.improvementPct === null || i.improvementPct === undefined ? '' : fmtPct(i.improvementPct),
    tagText: (i.tags || []).join(', '),
    updatedText: fmtDate(i.updatedAt)
  }));

  const grid = makeGrid(host, {
    columns: [
      { field: 'title', header: '제목', width: 260 },
      { field: 'statusHtml', header: '상태', width: 90, renderer: 'html', align: 'center' },
      { field: 'verdictHtml', header: '결과검증', width: 100, renderer: 'html', align: 'center' },
      { field: 'improveText', header: '개선율', width: 90, align: 'right' },
      { field: 'beforeMedianMs', header: '전(ms)', width: 90, align: 'right', type: 'number' },
      { field: 'afterMedianMs', header: '후(ms)', width: 90, align: 'right', type: 'number' },
      { field: 'highCount', header: '높음', width: 60, align: 'right', type: 'number' },
      { field: 'findingCount', header: '지적', width: 60, align: 'right', type: 'number' },
      { field: 'connectionName', header: '접속', width: 130 },
      { field: 'tagText', header: '태그', width: 150 },
      { field: 'updatedText', header: '수정일시', width: 130 },
      { field: 'id', header: 'ID', width: 190 }
    ],
    masterDetail: {
      enabled: true,
      height: 300,
      heightMode: 'auto',
      expandMultiple: false,
      renderer: (row, hostEl) => renderDetail(row, hostEl)
    }
  });
  grid.setData(data);
}

function verdictClass(v) {
  return v === 'IDENTICAL' ? 'sev-low' : v === 'SAME_SET' ? 'sev-medium' : v === 'DIFFERENT' ? 'sev-high' : 'sev-info';
}

async function renderDetail(row, hostEl) {
  hostEl.innerHTML = '<div class="pad muted">불러오는 중…</div>';
  let rec;
  try {
    rec = await api.getTuning(row.id);
  } catch (e) {
    hostEl.innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
    return;
  }

  const v = rec.verification || {};
  const d = (rec.metrics && rec.metrics.delta) || {};
  const tk = globalThis.SqlTokenizer;
  const hl = (sql) => (tk ? tk.highlight(sql || '') : esc(sql || ''));

  hostEl.innerHTML = `
    <div class="detail-panel">
      <div class="dp-block">
        <div class="dp-label">요약</div>
        <div>
          상태 <b>${esc(STATUS_LABEL[rec.status] || rec.status)}</b> ·
          검증 <b>${esc(VERDICT_LABEL[v.verdict] || '-')}</b> ·
          성능 ${d.beforeMedianMs !== undefined ? `${fmtMs(d.beforeMedianMs)} → ${fmtMs(d.afterMedianMs)} (${fmtPct(d.improvementPct)})` : '-'} ·
          지적 ${fmtNum((rec.findings || []).length)}건 ·
          작성 ${esc(fmtDate(rec.createdAt))}
        </div>
      </div>
      ${rec.note ? `<div class="dp-block"><div class="dp-label">메모</div><div>${esc(rec.note)}</div></div>` : ''}
      <div class="dp-block">
        <div class="dp-label">튜닝 전</div>
        <pre class="sqled-highlight" style="position:static;padding:8px 10px;background:#fafbfc;border:1px solid var(--border);border-radius:6px;max-height:180px;overflow:auto;">${hl((rec.before || {}).sql)}</pre>
      </div>
      ${(rec.after || {}).sql ? `<div class="dp-block">
        <div class="dp-label">튜닝 후</div>
        <pre class="sqled-highlight" style="position:static;padding:8px 10px;background:#f7fbf8;border:1px solid var(--border);border-radius:6px;max-height:180px;overflow:auto;">${hl(rec.after.sql)}</pre>
      </div>` : ''}
      <div class="dp-block">
        <button class="btn btn-sm btn-primary" data-load>워크벤치로 불러오기</button>
        <button class="btn btn-sm" data-export="md">Markdown 보고서</button>
        <button class="btn btn-sm" data-export="sql">.sql 파일</button>
        <button class="btn btn-sm" data-export="json">JSON</button>
        <button class="btn btn-sm btn-danger btn-ghost" data-del>삭제</button>
      </div>
    </div>`;

  hostEl.querySelector('[data-load]').addEventListener('click', () => {
    if (editorsRef) {
      editorsRef.before.setValue((rec.before || {}).sql || '');
      editorsRef.after.setValue((rec.after || {}).sql || '');
    }
    onLoadToWorkbench(rec);
    toast(`"${rec.title || rec.id}" 을(를) 워크벤치로 불러왔습니다.`, 'ok');
    document.querySelector('.rail-tab[data-view="workbench"]').click();
  });

  for (const btn of hostEl.querySelectorAll('[data-export]')) {
    btn.addEventListener('click', () => {
      window.location.href = api.exportUrl(rec.id, btn.dataset.export);
    });
  }

  hostEl.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm(`"${rec.title || rec.id}" 을(를) 삭제할까요?\n(삭제해도 data/tunings/.trash 에 백업본이 남습니다)`)) return;
    try {
      await api.removeTuning(rec.id);
      toast('삭제했습니다.');
      refresh();
    } catch (e) {
      toast(errText(e), 'err');
    }
  });
}

// ── 저장 모달 ──────────────────────────────────────────────────────────────

let saveContext = null;

/** 워크벤치에서 [튜닝 저장] 을 눌렀을 때 열린다. */
export function openSaveModal(ctx) {
  saveContext = ctx;
  const modal = $('#modal-save');
  modal.hidden = false;

  const tk = globalThis.SqlTokenizer;
  const guess = guessTitle(ctx.before, tk);
  $('#sv-title').value = ctx.title || guess;
  $('#sv-tags').value = (ctx.tags || []).join(', ');
  $('#sv-status').value = ctx.status || (ctx.verification && ctx.verification.verdict === 'IDENTICAL' ? 'verified' : 'draft');
  $('#sv-note').value = ctx.note || '';

  const v = ctx.verification || {};
  const d = (ctx.metrics && ctx.metrics.delta) || {};
  $('#sv-preview').innerHTML = `
    <div><b>${esc(t('sv.saveTargets'))}</b></div>
    <div>· ${esc(t('wb.beforeTitle'))} ${ctx.before ? `${ctx.before.split('\n').length}` : '(0)'}</div>
    <div>· ${esc(t('wb.afterTitle'))} ${ctx.after ? `${ctx.after.split('\n').length}` : '(0)'}</div>
    <div>· ${esc(t('tab.diag'))} ${(ctx.findings || []).length}</div>
    <div>· ${esc(t('tab.plan'))} ${ctx.plans && ctx.plans.before ? '✓' : '—'}</div>
    <div>· ${esc(t('tab.verify'))} ${VERDICT_LABEL[v.verdict] || '—'}</div>
    <div>· ${esc(t('hist.improve'))} ${d.improvementPct !== undefined ? fmtPct(d.improvementPct) : '—'}</div>`;

  // 이미 연결된 SQL 이 있으면 연결 체크박스는 숨긴다(이미 그 SQL 의 이력이므로)
  $('#sv-link-row').style.display = (ctx.sqlRef && ctx.sqlRef.name) ? 'none' : '';
  $('#sv-link-sql').checked = true;

  $('#sv-title').focus();
}

export function initSaveModal(opts = {}) {
  $('#modal-save').addEventListener('click', (e) => {
    if (e.target.id === 'modal-save' || e.target.hasAttribute('data-close')) $('#modal-save').hidden = true;
  });
  $('#btn-do-save').addEventListener('click', doSave);
}

function guessTitle(sql, tk) {
  if (!sql) return '';
  const a = tk ? tk.analyze(sql) : null;
  const t = a && a.tables && a.tables.length ? a.tables.map((x) => x.name).filter((n) => n !== '(inline view)').slice(0, 2).join(', ') : '';
  const type = a ? a.type : 'SQL';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return t ? `${t} ${type} 튜닝 (${stamp})` : `${type} 튜닝 (${stamp})`;
}

async function doSave() {
  if (!saveContext) return;
  const rec = {
    id: saveContext.id || undefined,
    title: $('#sv-title').value.trim(),
    tags: $('#sv-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    status: $('#sv-status').value,
    note: $('#sv-note').value,
    connectionId: saveContext.connectionId || '',
    connectionName: saveContext.connectionName || '',
    schema: saveContext.schema || '',
    before: {
      sql: saveContext.before || '',
      plan: (saveContext.plans && saveContext.plans.before) || null,
      metrics: saveContext.beforeMetrics || null
    },
    after: {
      sql: saveContext.after || '',
      plan: (saveContext.plans && saveContext.plans.after) || null,
      metrics: saveContext.afterMetrics || null
    },
    metrics: saveContext.metrics || null,
    verification: saveContext.verification || null,
    findings: saveContext.findings || [],
    sqlRef: saveContext.sqlRef || null
  };
  try {
    // 연결된 SQL 이 없고 사용자가 "목록에 저장·연결" 을 켰으면, 원본 SQL 을 라이브러리에 만들고 연결한다.
    // 이렇게 해야 라이브러리를 거치지 않고 바로 튜닝해도 이력이 그 SQL 에 붙는다(고아 방지).
    let linkedNew = false;
    if (!rec.sqlRef && $('#sv-link-sql') && $('#sv-link-sql').checked && rec.before.sql.trim()) {
      const name = rec.title || guessTitle(rec.before.sql, globalThis.SqlTokenizer);
      try {
        const s = await api.saveSnippet({ name, tags: rec.tags, sql: rec.before.sql });
        rec.sqlRef = { name: s.name, title: s.name };
        linkedNew = true;
        document.dispatchEvent(new CustomEvent('ot:snippets-changed'));
      } catch (e) { logMsg(`SQL 자동 저장 실패(튜닝만 저장): ${errText(e)}`, 'err'); }
    }
    const r = await api.saveTuning(rec);
    saveContext.id = r.tuning.id;
    saveContext.sqlRef = rec.sqlRef;
    $('#modal-save').hidden = true;
    toast(linkedNew ? t('sv.linkedNew') : `${t('res.saveTuning')} ✓`, 'ok');
    logMsg(`튜닝 저장 ${r.tuning.id} (${r.tuning.title})${rec.sqlRef ? ' → ' + rec.sqlRef.name : ''}`, 'ok');
    refresh();
  } catch (e) {
    toast(errText(e), 'err');
  }
}
