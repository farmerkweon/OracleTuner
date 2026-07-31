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

// 라벨은 언어 변경 후에도 갱신돼야 하므로 상수가 아니라 조회 함수로 둔다.
const statusLabel = (s) => ({ draft: t('st.draft'), verified: t('st.verified'), applied: t('st.applied'), rejected: t('st.rejected') })[s];
const verdictLabel = (v) => ({
  IDENTICAL: t('verdict.identical'), SAME_SET: t('verdict.sameset'), DIFFERENT: t('verdict.different'),
  INCONCLUSIVE: t('verdict.inconclusive'), SKIPPED: t('verdict.skipped')
})[v];

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
      t('hist.count', { n: items.length }) + (r.tags && r.tags.length ? t('hist.tagSummary', { tags: r.tags.map((x) => `${x.tag}(${x.count})`).join(', ') }) : '');
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
          <div class="empty-title">${esc(t('hist.noSearchTitle'))}</div>
          <div class="empty-desc">${esc(t('hist.noSearchDesc'))}</div></div>`
      : `<div class="empty-guide">
          <div class="empty-icon">📁</div>
          <div class="empty-title">${esc(t('hist.emptyTitle'))}</div>
          <div class="empty-desc">${t('hist.emptyDesc')}</div>
          <ol class="empty-steps">
            <li>${t('hist.emptyStep1')}</li>
            <li>${t('hist.emptyStep2')}</li>
            <li>${t('hist.emptyStep3')}</li>
            <li>${t('hist.emptyStep4')}</li>
          </ol>
          <div class="empty-actions">
            <button class="btn btn-primary btn-sm" id="empty-go-wb">${esc(t('hist.goWorkbench'))}</button>
          </div>
        </div>`;
    const go = $('#empty-go-wb');
    if (go) go.addEventListener('click', () => document.querySelector('.rail-tab[data-view="workbench"]').click());
    return;
  }

  const data = items.map((i) => ({
    ...i,
    statusHtml: `<span class="tag-pill ${i.status === 'applied' ? '' : i.status === 'rejected' ? 'warn' : ''}">${esc(statusLabel(i.status) || i.status)}</span>`,
    verdictHtml: i.verdict
      ? `<span class="sev-pill ${verdictClass(i.verdict)}">${esc(verdictLabel(i.verdict) || i.verdict)}</span>`
      : '<span class="muted">-</span>',
    improveText: i.improvementPct === null || i.improvementPct === undefined ? '' : fmtPct(i.improvementPct),
    tagText: (i.tags || []).join(', '),
    updatedText: fmtDate(i.updatedAt)
  }));

  const grid = makeGrid(host, {
    columns: [
      { field: 'title', header: t('col.title'), width: 260 },
      { field: 'statusHtml', header: t('col.status'), width: 90, renderer: 'html', align: 'center' },
      { field: 'verdictHtml', header: t('col.verdictCheck'), width: 100, renderer: 'html', align: 'center' },
      { field: 'improveText', header: t('hist.improve'), width: 90, align: 'right' },
      { field: 'beforeMedianMs', header: t('col.beforeMs'), width: 90, align: 'right', type: 'number' },
      { field: 'afterMedianMs', header: t('col.afterMs'), width: 90, align: 'right', type: 'number' },
      { field: 'highCount', header: t('sev.high'), width: 60, align: 'right', type: 'number' },
      { field: 'findingCount', header: t('col.findings'), width: 60, align: 'right', type: 'number' },
      { field: 'connectionName', header: t('col.connection'), width: 130 },
      { field: 'tagText', header: t('col.tags'), width: 150 },
      { field: 'updatedText', header: t('col.updated'), width: 130 },
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
  hostEl.innerHTML = `<div class="pad muted">${esc(t('hist.loading'))}</div>`;
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
        <div class="dp-label">${esc(t('hist.summary'))}</div>
        <div>
          ${esc(t('hist.summaryStatus'))} <b>${esc(statusLabel(rec.status) || rec.status)}</b> ·
          ${esc(t('hist.summaryVerify'))} <b>${esc(verdictLabel(v.verdict) || '-')}</b> ·
          ${esc(t('hist.summaryPerf'))} ${d.beforeMedianMs !== undefined ? `${fmtMs(d.beforeMedianMs)} → ${fmtMs(d.afterMedianMs)} (${fmtPct(d.improvementPct)})` : '-'} ·
          ${esc(t('hist.summaryFindings', { n: fmtNum((rec.findings || []).length) }))} ·
          ${esc(t('hist.summaryCreated', { date: fmtDate(rec.createdAt) }))}
        </div>
      </div>
      ${rec.note ? `<div class="dp-block"><div class="dp-label">${esc(t('hist.memo'))}</div><div>${esc(rec.note)}</div></div>` : ''}
      <div class="dp-block">
        <div class="dp-label">${esc(t('plan.before'))}</div>
        <pre class="sqled-highlight" style="position:static;padding:8px 10px;background:#fafbfc;border:1px solid var(--border);border-radius:6px;max-height:180px;overflow:auto;">${hl((rec.before || {}).sql)}</pre>
      </div>
      ${(rec.after || {}).sql ? `<div class="dp-block">
        <div class="dp-label">${esc(t('plan.after'))}</div>
        <pre class="sqled-highlight" style="position:static;padding:8px 10px;background:#f7fbf8;border:1px solid var(--border);border-radius:6px;max-height:180px;overflow:auto;">${hl(rec.after.sql)}</pre>
      </div>` : ''}
      <div class="dp-block">
        <button class="btn btn-sm btn-primary" data-load>${esc(t('hist.loadToWb'))}</button>
        <button class="btn btn-sm" data-export="md">${esc(t('hist.exportMd'))}</button>
        <button class="btn btn-sm" data-export="sql">${esc(t('hist.exportSql'))}</button>
        <button class="btn btn-sm" data-export="json">JSON</button>
        <button class="btn btn-sm btn-danger btn-ghost" data-del>${esc(t('lib.delete'))}</button>
      </div>
    </div>`;

  hostEl.querySelector('[data-load]').addEventListener('click', () => {
    if (editorsRef) {
      editorsRef.before.setValue((rec.before || {}).sql || '');
      editorsRef.after.setValue((rec.after || {}).sql || '');
    }
    onLoadToWorkbench(rec);
    toast(t('hist.loaded', { title: rec.title || rec.id }), 'ok');
    document.querySelector('.rail-tab[data-view="workbench"]').click();
  });

  for (const btn of hostEl.querySelectorAll('[data-export]')) {
    btn.addEventListener('click', () => {
      window.location.href = api.exportUrl(rec.id, btn.dataset.export);
    });
  }

  hostEl.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm(t('hist.deleteConfirm', { title: rec.title || rec.id }))) return;
    try {
      await api.removeTuning(rec.id);
      toast(t('hist.deleted'));
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
    <div>· ${esc(t('tab.verify'))} ${esc(verdictLabel(v.verdict) || '—')}</div>
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
  const tables = a && a.tables && a.tables.length ? a.tables.map((x) => x.name).filter((n) => n !== '(inline view)').slice(0, 2).join(', ') : '';
  const type = a ? a.type : 'SQL';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return tables ? t('hist.titleGuess', { tables, type, stamp }) : t('hist.titleGuessNoTable', { type, stamp });
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
      } catch (e) { logMsg(t('hist.snippetSaveFail', { msg: errText(e) }), 'err'); }
    }
    const r = await api.saveTuning(rec);
    saveContext.id = r.tuning.id;
    saveContext.sqlRef = rec.sqlRef;
    $('#modal-save').hidden = true;
    toast(linkedNew ? t('sv.linkedNew') : `${t('res.saveTuning')} ✓`, 'ok');
    logMsg(t('hist.savedLog', { id: r.tuning.id, title: r.tuning.title, link: rec.sqlRef ? ' → ' + rec.sqlRef.name : '' }), 'ok');
    refresh();
  } catch (e) {
    toast(errText(e), 'err');
  }
}
