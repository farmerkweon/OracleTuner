/**
 * 워크벤치 — 튜닝 전/후 SQL 을 나란히 놓고 실행·계획·진단·비교검증을 수행한다.
 *
 * 화면 구성 의도:
 *  - 왼쪽(전)/오른쪽(후)을 물리적으로 나란히 두어 "무엇을 바꿨는지"가 눈에 보이게 한다.
 *  - 아래 결과 영역은 탭으로 나누되, <b>비교·검증</b> 탭이 이 도구의 결론 화면이다.
 *    성능 수치만 보여주고 끝내지 않고 "결과가 같은가"를 함께 판정해 같은 화면에 놓는다.
 */

import { $, $$, el, esc, safeHtml, toast, logMsg, errText, fmtMs, fmtNum, fmtPct, fmtBig, withBusy, download, copyToClipboard } from '../util.js';
import { api, session } from '../api.js';
import { t } from '../i18n.js';
import { SqlEditor } from '../editor.js';
import { open as openLibrary, renderDock } from './library.js';
import { open as openHintWizard } from './hint-wizard.js';
import { makeGrid, renderResult, renderPlan, renderFindings, renderTable, renderCompareChart, resizeAll } from '../gridkit.js';
import { invalidate as invalidateCandidates } from './candidates.js';

const state = {
  editors: { before: null, after: null },
  lastResult: { before: null, after: null },
  lastPlan: { before: null, after: null },
  lastAnalysis: { before: null, after: null },
  lastCompare: null,
  running: false
};

export function initWorkbench() {
  // 예제 SQL 을 미리 채우지 않는다 — [신규] 를 누를 때 저장 여부를 계속 묻는 원인이 되고,
  // 랜딩이 SQL 목록이라 예제가 필요 없다. 빈 상태(배지 "신규")로 시작한다.
  state.editors.before = new SqlEditor($('#editor-before'), {
    name: t('wb.beforeTitle'),
    value: '',
    onChange: () => updateMeta('before'),
    onAction: (act) => handleAction(act, 'before')
  });
  state.editors.after = new SqlEditor($('#editor-after'), {
    name: t('wb.afterTitle'),
    value: '',
    onChange: () => updateMeta('after'),
    onAction: (act) => handleAction(act, act === 'compare' ? 'after' : 'after')
  });

  // 툴바 버튼
  for (const btn of $$('.editor-tools [data-act]')) {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.side || 'before', btn));
  }

  // 결과 탭
  for (const tab of $$('.rtab[data-tab]')) {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  }

  $('#btn-cancel-sql').addEventListener('click', cancelRunning);
  $('#btn-export-csv').addEventListener('click', () => exportResult('csv'));
  $('#btn-export-xlsx').addEventListener('click', () => exportResult('xlsx'));
  $('#btn-copy-result').addEventListener('click', copyResult);
  $('#btn-copy-plan').addEventListener('click', copyPlan);
  $('#plan-side').addEventListener('change', () => showPlan($('#plan-side').value));
  $('#btn-plan-cursor').addEventListener('click', loadActualPlan);

  initSplitter();
  initDock();
  updateMeta('before');
  updateMeta('after');
  setDoc('before', { isNew: true }); // 처음엔 빈 신규 문서
}

// ── 좌측 SQL 목록 도크 (고정/감추기) ───────────────────────────────────────

function initDock() {
  const dock = $('#wb-dock');
  const reveal = $('#btn-wb-dock-reveal');
  const collapsed = localStorage.getItem('ot.dock') === 'collapsed';
  applyDockState(collapsed);

  $('#btn-wb-dock-toggle').addEventListener('click', () => setDock(true));
  reveal.addEventListener('click', () => setDock(false));
  $('#btn-wb-dock-save').addEventListener('click', () => openLibrary('before'));
  // SQL 이 저장/삭제되면 도크를 갱신한다(순환 import 없이 이벤트로 연결)
  document.addEventListener('ot:snippets-changed', () => refreshDock());
}

function setDock(collapse) {
  localStorage.setItem('ot.dock', collapse ? 'collapsed' : 'open');
  applyDockState(collapse);
  if (!collapse) refreshDock();
  setTimeout(() => relayout(), 0);
}

function applyDockState(collapsed) {
  $('#wb-dock').hidden = collapsed;
  $('#btn-wb-dock-reveal').hidden = !collapsed;
}

/** 도크 SQL 트리를 다시 그린다(저장/불러오기/뷰 전환 시). */
export function refreshDock() {
  if ($('#wb-dock').hidden) return;
  renderDock($('#wb-dock-tree'));
}

export function getEditors() { return state.editors; }
export function getState() { return state; }

/**
 * 워크벤치가 보이게 됐을 때 편집기 크기를 다시 잡는다.
 * (랜딩이 SQL 목록이라 워크벤치는 처음에 display:none 으로 초기화되기 때문)
 */
export function relayout() {
  refreshDock();
  requestAnimationFrame(() => {
    try { state.editors.before.refresh(); } catch (e) { /* noop */ }
    try { state.editors.after.refresh(); } catch (e) { /* noop */ }
    resizeAll();
  });
}

/** 편집기별 현재 문서(불러온 SQL 이름 / 신규) 표시. */
const docState = { before: null, after: null };

/**
 * 편집기에 "지금 무엇이 열려 있는지"를 표시한다.
 * @param {'before'|'after'} side
 * @param {{title?:string, name?:string, isNew?:boolean}|null} doc
 */
export function setDoc(side, doc) {
  docState[side] = doc ? { ...doc, baseSql: state.editors[side].value } : null;
  renderDocBadge(side);
}

/** 현재 편집기에 열린 문서 정보(튜닝 저장 시 SQL 연결에 쓴다). */
export function getDoc(side) { return docState[side]; }

/**
 * <b>파생 패널</b>(실행계획·진단·튜닝후보·비교검증·계측)을 비운다.
 *
 * SQL 을 실행하면 결과 탭만 새로 그려지고 나머지는 이전 SQL 것이 그대로 남아 있었다.
 * 튜닝 도구에서 이건 단순한 지저분함이 아니라 <b>잘못된 판단의 원인</b>이다 —
 * 사용자가 A 의 실행계획을 보면서 B 를 튜닝하게 된다.
 *
 * 편집기·문서 배지·결과 탭은 건드리지 않는다(그건 resetWorkbench 의 몫).
 *
 * @param {'before'|'after'} side 실행한 쪽. 그 쪽의 계획·진단만 버린다.
 */
function clearDerivedPanels(side) {
  state.lastPlan[side] = null;
  state.lastAnalysis[side] = null;
  // 비교검증과 튜닝후보는 전/후 <b>쌍</b>을 전제로 만든 결과라, 한쪽만 바뀌어도 무효다.
  state.lastCompare = null;
  invalidateCandidates();

  $('#grid-plan').innerHTML = '';
  $('#plan-text').textContent = '';
  $('#grid-diag').innerHTML = '';
  $('#grid-stats').innerHTML = '';
  $('#verify-body').innerHTML = `<p class="muted pad">${t('verify.intro')}</p>`;
  $('#cand-body').innerHTML = `<p class="pad muted">${t('cd.intro')}</p>`;
  for (const id of ['badge-diag', 'badge-cands']) {
    const b = $('#' + id);
    if (b) { b.textContent = ''; b.className = 'badge'; }
  }
}

/** 워크벤치를 빈 상태로 초기화한다(신규 SQL). 편집기·문서배지·결과패널을 모두 비운다. */
export function resetWorkbench() {
  state.editors.before.setValue('');
  state.editors.after.setValue('');
  setDoc('before', { isNew: true });
  setDoc('after', null);
  state.lastResult = { before: null, after: null };
  state.lastResultShown = null;
  // 파생 패널은 양쪽 모두 비운다(같은 규칙을 두 벌 쓰지 않도록 함수를 공유한다)
  clearDerivedPanels('before');
  clearDerivedPanels('after');
  // 결과 영역 비우기
  $('#grid-result').innerHTML = `<div class="pad muted">${esc(t('res.empty'))}</div>`;
  $('#result-summary').textContent = t('res.empty');
  showTab('result');
  state.editors.before.focus();
}

function renderDocBadge(side) {
  const badge = $(`#doc-${side}`);
  if (!badge) return;
  const doc = docState[side];
  if (!doc) { badge.textContent = ''; badge.className = 'doc-badge'; return; }
  const dirty = doc.baseSql !== undefined && state.editors[side].value !== doc.baseSql;
  if (doc.isNew) {
    badge.innerHTML = `<span class="doc-icon">✎</span>${esc(t('wb.docNew'))}`;
    badge.className = 'doc-badge doc-new';
  } else {
    badge.innerHTML = `<span class="doc-icon">📄</span>${esc(doc.title || doc.name || '')}` +
      (dirty ? ` <span class="doc-dirty">• ${esc(t('wb.docModified'))}</span>` : '');
    badge.className = 'doc-badge';
  }
  badge.title = doc.title || doc.name || t('wb.docNew');
}

// ── 편집기 상단 메타 표시 ──────────────────────────────────────────────────

function updateMeta(side) {
  const ed = state.editors[side];
  if (!ed) return;
  const tk = globalThis.SqlTokenizer;
  const sql = ed.value;
  const node = $(`#meta-${side}`);
  if (!sql.trim()) {
    node.textContent = side === 'after' ? t('wb.emptyAfter') : '';
    return;
  }
  const stmts = tk.splitStatements(sql);
  const cur = ed.currentStatement();
  const binds = tk.extractBinds(sql);
  const parts = [
    t('wb.metaStmts', { n: stmts.length }),
    t('wb.metaCurrent', { type: cur.type || '-' }),
    t('wb.metaLines', { n: sql.split('\n').length })
  ];
  if (binds.length) parts.push(t('wb.metaBinds', { n: binds.length }));
  const subs = tk.extractSubstitutions(sql);
  if (subs.length) parts.push(t('wb.metaSubs', { vars: subs.join(',') }));
  node.textContent = parts.join(' · ');
}

// ── 액션 라우팅 ────────────────────────────────────────────────────────────

async function handleAction(act, side, btn) {
  const ed = state.editors[side];
  try {
    switch (act) {
      case 'run': return await runSql(side, btn);
      case 'explain': return await explainSql(side, btn);
      case 'analyze': return await analyzeSql(side, btn);
      case 'format': return await formatSql(side);
      case 'expandStar': return await expandStar(side, btn);
      case 'hint': return openHintWizard(side);
      case 'copy': {
        const sql = ed.currentStatement().sql.trim() || ed.value;
        const ok = await copyToClipboard(sql);
        toast(ok ? t('common.copied') : t('common.copyFail'), ok ? 'ok' : 'err');
        return;
      }
      case 'library': {
        openLibrary(side);
        return;
      }
      case 'runScript': return await runScript(side, btn);
      case 'copyToAfter': {
        state.editors.after.setValue(ed.value);
        toast(t('wb.copiedToAfter'));
        return;
      }
      case 'compare': return await compare(btn);
      default: return;
    }
  } catch (e) {
    if (!(e && e.toasted)) toast(errText(e), 'err'); // D17 — 이미 안내한 오류는 두 번 띄우지 않는다
    logMsg(t('wb.actionFail', { act, msg: errText(e) }), 'err');
  }
}

function requireSession() {
  if (!session.connected) {
    // D17(QA-SWEEP): 여기서 토스트를 띄우고 던진 오류를 handleAction 의 catch 가 다시 토스트로
    // 띄워서 "먼저 DB 에 접속하세요" + "DB 에 접속되어 있지 않습니다" 두 개가 동시에 떴다.
    // 이미 안내했다는 표시를 달아 두 번째 토스트를 막는다(로그에는 그대로 남긴다).
    toast(t('common.needConnect'), 'warn');
    const e = new Error(t('wb.notConnected'));
    e.toasted = true;
    throw e;
  }
}

// ── 실행 ───────────────────────────────────────────────────────────────────

async function runSql(side, btn) {
  requireSession();
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast(t('wb.noStmtRun'), 'warn');
  ed.markStatement();

  // 이전 SQL 의 계획·진단·후보가 새 결과 옆에 남지 않게 먼저 비운다.
  // 실행 전에 비워야 질의가 도는 동안에도 낡은 내용이 보이지 않는다.
  clearDerivedPanels(side);

  setRunning(true);
  const t0 = performance.now();
  try {
    logMsg(t('wb.runLog', { side: t(side === 'before' ? 'wb.sideBefore' : 'wb.sideAfter'), sql: oneLine(st.sql) }));
    const r = await api.execute({ sql: st.sql });
    state.lastResult[side] = r;

    showTab('result');
    renderResult($('#grid-result'), r);
    state.lastResultShown = r; // 결과 복사(TSV)가 참조한다
    renderStats(r);

    const wall = performance.now() - t0;
    const tm = r.timings || {};
    if (r.kind === 'update') {
      $('#result-summary').innerHTML =
        t('wb.affected', { n: fmtNum(r.affectedRows), ms: fmtMs(tm.totalMs) }) +
        (r.rolledBack ? t('wb.rolledBack') : t('wb.notCommitted'));
      logMsg(t('wb.affectedLog', { n: r.affectedRows, note: r.rolledBack ? t('wb.autoRollbackShort') : '' }), 'ok');
    } else {
      // 소비(실제로 읽은 행수)와 표시(응답에 보관된 행수)를 분리해 보여준다 — 성능평가 목적상
      // 실제 소비 행수가 진실이고, 표시 행수는 keepRowsMax 로 묶인 UI 용 상한이다.
      const consumed = r.consumedRows != null ? r.consumedRows : r.rowCount;
      const kept = r.keptRowCount != null ? r.keptRowCount : r.rowCount;
      const keepNote = r.keepTruncated ? t('wb.keepTruncated') : '';
      $('#result-summary').innerHTML =
        t('wb.consumedKept', { consumed: fmtNum(consumed), kept: fmtNum(kept), note: keepNote }) +
        (r.truncated ? t('wb.fetchTruncated') : '') +
        t('wb.timingBreak', { exec: fmtMs(tm.executeMs), fetch: fmtMs(tm.fetchMs), total: fmtMs(tm.totalMs) }) +
        t('wb.roundTrip', { ms: fmtMs(wall) }) +
        (r.statsAvailable ? t('wb.statsCollected') : t('wb.statsMissing'));
      logMsg(t('wb.resultLog', { consumed, kept, ms: fmtMs(tm.totalMs) }), 'ok');
    }

    // 설정에 따라 계획도 같이
    if (window.__otConfig && window.__otConfig.execution && window.__otConfig.execution.autoExplain) {
      // 자동 조회는 계획을 채워만 두고 탭은 결과에 남긴다(D13).
      explainSql(side, null, { switchTab: false }).catch(() => {});
    }
  } catch (e) {
    $('#result-summary').innerHTML = `<span style="color:var(--danger)">${esc(errText(e))}</span>`;
    logMsg(t('wb.runFail', { msg: errText(e) }), 'err');
    toast(errText(e), 'err', 6000);
  } finally {
    setRunning(false);
  }
}

/**
 * 스크립트 전체 실행 — 편집기의 모든 문장을 순서대로 돌린다(데모 설치·DDL 용).
 * 커밋 여부를 이 실행에 한해 사용자가 확인한다(전역 안전모드 설정은 건드리지 않음).
 */
async function runScript(side, btn) {
  requireSession();
  const ed = state.editors[side];
  const sql = ed.value;
  if (!sql.trim()) return toast(t('res.empty'), 'warn');

  const tk = globalThis.SqlTokenizer;
  const n = tk ? tk.splitStatements(sql).filter((s) => s.sql.trim()).length : 1;
  if (!confirm(t('wb.runScriptConfirm', { n }))) return;

  // 스크립트 실행도 마찬가지다 — DDL·데모 생성으로 스키마가 바뀌면
  // 이전 실행계획·진단은 더더욱 믿을 수 없는 값이 된다.
  clearDerivedPanels(side);

  setRunning(true);
  showTab('log');
  logMsg(t('wb.scriptStart', { n }));
  await withBusy(btn, async () => {
    try {
      const r = await api.runScript({ sql, continueOnError: true, commit: true });
      for (const item of r.results) {
        const head = `  [${item.no}/${r.total}] ${item.type}`;
        if (item.ok) {
          const detail = item.kind === 'update'
            ? t('wb.scriptApplied', { n: fmtNum(item.affectedRows) })
            : t('wb.scriptRows', { n: fmtNum(item.rowCount || 0) });
          logMsg(`${head} ✓ ${detail} (${item.elapsedMs}ms) — ${item.preview}`, 'ok');
        } else {
          logMsg(`${head} ✗ ${item.ora || ''} ${item.error} — ${item.preview}`, 'err');
        }
      }
      const msg = t('wb.runScriptDone', { ok: r.ok, failed: r.failed });
      logMsg(msg, r.failed ? 'err' : 'ok');
      toast(msg, r.failed ? 'warn' : 'ok', 6000);
    } catch (e) {
      logMsg(t('wb.scriptFail', { msg: errText(e) }), 'err');
      toast(errText(e), 'err', 8000);
    } finally {
      setRunning(false);
    }
  }, '…');
}

function setRunning(on) {
  state.running = on;
  $('#btn-cancel-sql').disabled = !on;
  $('#rail-msg').textContent = on ? t('wb.running') : '';
}

async function cancelRunning() {
  try {
    const r = await api.cancel();
    toast(r.cancelled ? t('wb.cancelled') : t('wb.cancelFail', { reason: r.reason || '' }), r.cancelled ? '' : 'warn');
  } catch (e) {
    toast(errText(e), 'err');
  }
}

function oneLine(sql) {
  const s = String(sql).replace(/\s+/g, ' ').trim();
  return s.length > 110 ? s.slice(0, 110) + '…' : s;
}

// ── 실행계획 ───────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {boolean} [opts.switchTab=true] 실행계획 탭으로 전환할지. 사용자가 직접 [실행계획] 을
 *   눌렀을 때는 true, [실행]에 딸려 자동 조회될 때는 false 다 — D13(QA-SWEEP): 사용자가 요청한
 *   것은 결과인데 자동 조회가 탭을 빼앗아 결과가 안 보였다.
 */
async function explainSql(side, btn, { switchTab = true } = {}) {
  requireSession();
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast(t('wb.noStmtPlan'), 'warn');

  await withBusy(btn, async () => {
    const plan = await api.explain(st.sql);
    state.lastPlan[side] = plan;
    $('#plan-side').value = side;
    if (switchTab) showTab('plan');
    showPlan(side);
    if (!plan.available) {
      logMsg(t('wb.planUnavailable', { msg: plan.error || plan.note || '' }), 'err');
    } else {
      logMsg(t('wb.planLog', { source: plan.source, steps: plan.rows.length, cost: fmtBig((plan.summary || {}).totalCost) }));
    }
  }, '…');
}

function showPlan(side) {
  const plan = state.lastPlan[side];
  const text = $('#plan-text');
  if (!plan) {
    $('#grid-plan').innerHTML = `<div class="pad muted">${esc(t('wb.planNotQueried'))}</div>`;
    text.textContent = '';
    $('#plan-summary').textContent = t('plan.empty');
    return;
  }
  renderPlan($('#grid-plan'), plan);
  text.textContent = plan.text || plan.error || t('wb.planNoText');

  const s = plan.summary || {};
  const bits = [];
  if (plan.available) {
    bits.push(t('wb.planSource', { source: planSourceLabel(plan.source) }));
    bits.push(t('wb.planTotalCost', { v: fmtBig(s.totalCost) }));
    bits.push(t('wb.planEstRows', { v: fmtBig(s.estimatedRows) }));
    bits.push(t('wb.planSteps', { n: s.steps }));
    if (s.fullScans) bits.push(t('wb.planFullScans', { n: s.fullScans }));
    if (s.cartesian) bits.push(t('wb.planCartesian', { n: s.cartesian }));
    if (s.sorts) bits.push(t('wb.planSorts', { n: s.sorts }));
  } else {
    bits.push(t('wb.planFailed', { msg: plan.error || plan.note || '' }));
  }
  $('#plan-summary').innerHTML = esc(bits.join(' · ')) + (plan.note ? ` <span class="muted">(${esc(plan.note)})</span>` : '');
}

function planSourceLabel(src) {
  return { DBMS_XPLAN: t('wb.srcXplan'), PLAN_TABLE: t('wb.srcPlanTable'), DISPLAY_CURSOR: t('wb.srcDisplayCursor'), NONE: t('wb.srcNone') }[src] || src;
}

async function loadActualPlan() {
  requireSession();
  const btn = $('#btn-plan-cursor');
  await withBusy(btn, async () => {
    const r = await api.displayCursor('ALLSTATS LAST +COST +BYTES');
    if (!r.available) {
      toast(t('wb.actualPlanFail', { msg: r.error || t('wb.noVPriv') }), 'warn', 5000);
      logMsg(t('wb.displayCursorFail', { msg: r.error || '' }), 'err');
      return;
    }
    $('#plan-text').textContent = r.text;
    $('#plan-summary').innerHTML = t('wb.actualPlanSource', { id: esc(r.sqlId || '') });
    if (r.rowsourceStats && r.rowsourceStats.length) {
      renderTable($('#grid-plan'), r.rowsourceStats, [
        { field: 'id', header: 'Id', width: 50, align: 'right' },
        { field: 'operation', header: 'Operation', width: 180 },
        { field: 'options', header: 'Options', width: 140 },
        { field: 'object_name', header: 'Name', width: 160 },
        { field: 'e_rows', header: 'E-Rows', width: 90, align: 'right' },
        { field: 'a_rows', header: 'A-Rows', width: 90, align: 'right' },
        { field: 'starts', header: 'Starts', width: 70, align: 'right' },
        { field: 'cr_gets', header: 'Buffers', width: 90, align: 'right' },
        { field: 'disk_reads', header: 'Reads', width: 80, align: 'right' },
        { field: 'elapsed_us', header: t('col.elapsedUs'), width: 100, align: 'right' }
      ], { rowNumber: false });
    }
    logMsg(t('wb.actualPlanDone', { id: r.sqlId }), 'ok');
  }, '…');
}

// ── 진단 ───────────────────────────────────────────────────────────────────

async function analyzeSql(side, btn) {
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast(t('wb.noStmtAnalyze'), 'warn');

  await withBusy(btn, async () => {
    const r = await api.analyze({ sql: st.sql, useDb: session.connected });
    state.lastAnalysis[side] = r;
    showTab('diag');

    renderFindings($('#grid-diag'), r.findings, (finding) => applyFix(side, finding));

    const s = r.summary || {};
    const badge = $('#badge-diag');
    badge.textContent = String(s.total || 0);
    badge.className = `badge show ${s.high ? '' : s.medium ? 'sev-medium' : 'sev-none'}`;

    const src = r.meta && r.meta.usedDb
      ? t('wb.diagSrcDb', { plan: r.plan && r.plan.available ? t('wb.present') : t('wb.absent'), cols: r.meta.columnTypeCount, tables: r.meta.tableCount })
      : t('wb.diagSrcStatic');
    $('#diag-summary').innerHTML =
      t('wb.diagSummary', { score: r.score, total: s.total, high: s.high, medium: s.medium, low: s.low, info: s.info, src: esc(src) }) +
      (r.meta && r.meta.errors && r.meta.errors.length
        ? t('wb.diagPartialFail', { detail: esc(r.meta.errors.map((x) => x.step + ': ' + x.message).join('\n')), n: r.meta.errors.length }) : '');

    if (r.plan) {
      state.lastPlan[side] = r.plan;
      $('#plan-side').value = side;
      showPlan(side);
    }
    logMsg(t('wb.diagLog', { side: t(side === 'before' ? 'wb.sideBefore' : 'wb.sideAfter'), total: s.total, score: r.score }));
  }, '…');
}

async function applyFix(side, finding) {
  if (finding.fixAction === 'expandStar') return expandStar(side);
  toast(t('wb.noAutoFix'), 'warn');
}

// ── 편집 보조 ──────────────────────────────────────────────────────────────

async function formatSql(side) {
  const ed = state.editors[side];
  const st = ed.currentStatement();
  const target = st.sql.trim() ? st : { sql: ed.value, start: 0, end: ed.value.length };
  const r = await api.format(target.sql);
  const v = ed.value;
  ed.setValue(v.slice(0, target.start) + r.sql + v.slice(target.end));
  toast(t('wb.formatted'));
}

async function expandStar(side, btn) {
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast(t('wb.noStmtTarget'), 'warn');

  await withBusy(btn, async () => {
    if (!session.connected) {
      toast(t('wb.needDbForColumns'), 'warn');
      return;
    }
    const r = await api.expandStar({ sql: st.sql });
    if (!r.ok) {
      toast(r.error || t('wb.expandFail'), 'warn');
      return;
    }
    ed.replaceCurrentStatement(r.sql);
    toast(t('wb.expandDone', { n: r.expanded }), 'ok');
  }, '…');
}


// ── 계측 탭 ────────────────────────────────────────────────────────────────

function renderStats(result) {
  const host = $('#grid-stats');
  const tm = result.timings || {};
  const rows = [
    { name: t('wb.tPrepare'), value: tm.prepareMs, unit: 'ms', note: t('wb.tPrepareNote') },
    { name: t('wb.tExecute'), value: tm.executeMs, unit: 'ms', note: t('wb.tExecuteNote') },
    { name: t('wb.tFetch'), value: tm.fetchMs, unit: 'ms', note: t('wb.tFetchNote') },
    { name: t('wb.tTotal'), value: tm.totalMs, unit: 'ms', note: '' }
  ];
  if (result.stats) {
    for (const [k, v] of Object.entries(result.stats)) {
      rows.push({ name: k, value: v, unit: '', note: statNote(k) });
    }
    $('#stats-summary').textContent = t('wb.statsNote');
  } else {
    $('#stats-summary').textContent = t('wb.statsNoPriv');
  }
  renderTable(host, rows, [
    { field: 'name', header: t('col.item'), width: 250 },
    { field: 'value', header: t('col.value'), width: 120, align: 'right', type: 'number' },
    { field: 'unit', header: t('col.unit'), width: 60 },
    { field: 'note', header: t('col.desc'), width: 420 }
  ], { rowNumber: false, filterable: false });
}

// 통계 이름 → 사전 키. 언어 변경 후에도 갱신되도록 값이 아니라 키만 고정한다.
const STAT_NOTE_KEYS = {
  'session logical reads': 'wb.sn.logicalReads',
  'consistent gets': 'wb.sn.consistentGets',
  'db block gets': 'wb.sn.dbBlockGets',
  'physical reads': 'wb.sn.physicalReads',
  'sorts (memory)': 'wb.sn.sortsMemory',
  'sorts (disk)': 'wb.sn.sortsDisk',
  'table scans (long tables)': 'wb.sn.tableScans',
  'table fetch by rowid': 'wb.sn.fetchByRowid',
  'CPU used by this session': 'wb.sn.cpuUsed',
  'parse count (hard)': 'wb.sn.hardParse'
};

function statNote(k) { return STAT_NOTE_KEYS[k] ? t(STAT_NOTE_KEYS[k]) : ''; }

// ── 비교 검증 ──────────────────────────────────────────────────────────────

async function compare(btn) {
  requireSession();
  const before = state.editors.before.currentStatement().sql.trim();
  const after = state.editors.after.currentStatement().sql.trim();
  if (!before || !after) {
    toast(t('wb.needBothSql'), 'warn');
    return;
  }

  showTab('verify');
  $('#verify-body').innerHTML = `<p class="pad muted">${esc(t('wb.comparing'))}</p>`;
  setRunning(true);

  await withBusy(btn, async () => {
    try {
      const r = await api.compare({ before: { sql: before }, after: { sql: after } });
      state.lastCompare = r;
      renderCompare(r);
      const v = r.verification || {};
      const d = (r.performance && r.performance.delta) || {};
      logMsg(t('wb.compareLog', { verdict: v.verdictLabel || v.verdict || '-', perf: fmtPct(d.improvementPct) }),
        v.verdict === 'DIFFERENT' ? 'err' : 'ok');
    } catch (e) {
      $('#verify-body').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
      logMsg(t('wb.compareFail', { msg: errText(e) }), 'err');
    } finally {
      setRunning(false);
    }
  }, t('wb.verifying'));
}

function renderCompare(r) {
  const v = r.verification || {};
  const perf = r.performance || {};
  const d = perf.delta || {};
  const host = $('#verify-body');
  host.innerHTML = '';

  // 1) 결과 동일성 판정 — 가장 위에 둔다. 빨라져도 결과가 다르면 소용없다.
  host.appendChild(verdictBlock(v));

  // 2) 성능 카드
  const cards = el('div', { class: 'metric-cards' });
  cards.appendChild(metricCard(t('wb.respTimeMedian'),
    `${fmtMs(d.beforeMedianMs)} → ${fmtMs(d.afterMedianMs)}`,
    d.speedup ? t('wb.speedup', { v: d.speedup }) : '', improvementClass(d.improvementPct)));
  cards.appendChild(metricCard(t('hist.improve'), fmtPct(d.improvementPct),
    t('wb.crossRuns', { runs: r.runs, warmup: r.warmup }), improvementClass(d.improvementPct)));

  const lr = (d.stats || []).find((s) => s.name === 'session logical reads')
    || (d.stats || []).find((s) => s.name === 'consistent gets');
  if (lr) {
    cards.appendChild(metricCard(t('wb.logicalReadsCard'),
      `${fmtBig(lr.before)} → ${fmtBig(lr.after)}`,
      t('wb.moreStableThanTime', { pct: fmtPct(lr.improvementPct) }), improvementClass(lr.improvementPct)));
  }
  if (r.planDiff) {
    const cost = r.planDiff.rows.find((x) => x.metric === 'totalCost');
    if (cost) {
      cards.appendChild(metricCard(t('wb.optimizerCost'),
        `${fmtBig(cost.before)} → ${fmtBig(cost.after)}`,
        t('wb.estimateNotMeasured', { pct: fmtPct(cost.improvementPct) }), improvementClass(cost.improvementPct)));
    }
  }
  host.appendChild(cards);

  // 2.5) 차트 — 전/후를 한눈에 비교. 시간과 논리읽기를 각각 정규화해 같은 축에 놓는다.
  host.appendChild(compareChartSection(d));

  // 3) 세부 표들
  if (d.statsAvailable) {
    host.appendChild(section(t('wb.statsCompareMedian'), (hostEl) => {
      renderTable(hostEl, d.stats, [
        { field: 'name', header: t('col.statName'), width: 240 },
        { field: 'before', header: t('plan.before'), width: 120, align: 'right', type: 'number' },
        { field: 'after', header: t('plan.after'), width: 120, align: 'right', type: 'number' },
        { field: 'delta', header: t('col.delta'), width: 110, align: 'right', type: 'number' },
        { field: 'improvementPct', header: t('col.improvePct'), width: 110, align: 'right', type: 'number' }
      ], { rowNumber: false, filterable: false });
    }, 'mini-grid tall'));
  } else {
    host.appendChild(el('div', { class: 'verify-section' }, [
      el('h3', { text: t('wb.statsCompare') }),
      el('div', { class: 'pad muted', html: t('wb.statsCompareNoPriv') })
    ]));
  }

  host.appendChild(section(t('wb.perRunTime'), (hostEl) => {
    const rows = [];
    const bruns = perf.beforeRuns || [], aruns = perf.afterRuns || [];
    for (let i = 0; i < Math.max(bruns.length, aruns.length); i++) {
      const b = bruns[i] || {}, a = aruns[i] || {};
      rows.push({
        run: i + 1,
        beforeMs: (b.timings || {}).totalMs,
        beforeExecMs: (b.timings || {}).executeMs,
        afterMs: (a.timings || {}).totalMs,
        afterExecMs: (a.timings || {}).executeMs,
        rows: (b.rowCount === a.rowCount) ? b.rowCount : `${b.rowCount} / ${a.rowCount}`
      });
    }
    renderTable(hostEl, rows, [
      { field: 'run', header: t('cd.runNo'), width: 60, align: 'right' },
      { field: 'beforeMs', header: t('col.beforeTotalMs'), width: 110, align: 'right', type: 'number' },
      { field: 'beforeExecMs', header: t('col.beforeExecMs'), width: 110, align: 'right', type: 'number' },
      { field: 'afterMs', header: t('col.afterTotalMs'), width: 110, align: 'right', type: 'number' },
      { field: 'afterExecMs', header: t('col.afterExecMs'), width: 110, align: 'right', type: 'number' },
      { field: 'rows', header: t('col.rows'), width: 100, align: 'right' }
    ], { rowNumber: false, filterable: false });
  }));

  if (r.planDiff) {
    host.appendChild(section(t('wb.planCompare'), (hostEl) => {
      renderTable(hostEl, r.planDiff.rows.map((x) => ({ ...x, metric: planMetricLabel(x.metric) })), [
        { field: 'metric', header: t('col.metric'), width: 180 },
        { field: 'before', header: t('plan.before'), width: 120, align: 'right', type: 'number' },
        { field: 'after', header: t('plan.after'), width: 120, align: 'right', type: 'number' },
        { field: 'delta', header: t('col.delta'), width: 110, align: 'right', type: 'number' },
        { field: 'improvementPct', header: t('col.improvePct'), width: 110, align: 'right', type: 'number' }
      ], { rowNumber: false, filterable: false });
    }));
  }

  // 4) 결과 차이 표본
  if (v.verdict === 'DIFFERENT' && v.diff) {
    host.appendChild(diffBlock(v, r));
  }
}

// 지표명은 사전에서 가져온다 — 언어를 바꿔도 다시 그리면 갱신된다.
function planMetricLabel(m) {
  const keys = {
    totalCost: 'wb.pm.totalCost', estimatedRows: 'wb.pm.estimatedRows', steps: 'wb.pm.steps',
    fullScans: 'wb.pm.fullScans', cartesian: 'wb.pm.cartesian', indexScans: 'wb.pm.indexScans',
    sorts: 'wb.pm.sorts', hashJoins: 'wb.pm.hashJoins', nestedLoops: 'wb.pm.nestedLoops'
  };
  return keys[m] ? t(keys[m]) : m;
}

/**
 * 전/후 비교 차트.
 *
 * <p>시간(ms)과 논리읽기(블록 수)는 <b>단위가 달라 한 축에 그대로 못 올린다.</b>
 * 그래서 두 계열을 나눠 보여준다:
 *  1) 응답시간 절대값 막대 (ms)
 *  2) 주요 지표를 "원본=100" 으로 정규화한 상대 막대(값이 낮을수록 좋음)
 */
function compareChartSection(d) {
  const wrap = el('div', { class: 'verify-section' }, [el('h3', { text: t('wb.compareChart') })]);

  // 정규화 상대 비교(원본=100) 데이터 준비
  const relRows = [];
  if (isNum(d.beforeMedianMs) && d.beforeMedianMs > 0) {
    relRows.push({ label: t('wb.respTime'), before: 100, after: rel(d.afterMedianMs, d.beforeMedianMs) });
  }
  for (const name of ['session logical reads', 'consistent gets', 'physical reads']) {
    const s = (d.stats || []).find((x) => x.name === name);
    if (s && s.before > 0) {
      relRows.push({ label: statShort(name), before: 100, after: rel(s.after, s.before) });
    }
  }
  const costRow = (state.lastCompare && state.lastCompare.planDiff && state.lastCompare.planDiff.rows || [])
    .find((x) => x.metric === 'totalCost');
  if (costRow && costRow.before > 0) {
    relRows.push({ label: t('wb.optimizerCost'), before: 100, after: rel(costRow.after, costRow.before) });
  }

  // 두 그래프를 한 줄에(비교 대상이 전/후 둘뿐이라 나란히 두는 편이 읽기 좋다)
  const hasRel = relRows.length > 1;
  const row = el('div', { class: `chart-row ${hasRel ? '' : 'single'}` });
  const timeCol = el('div', { class: 'chart-col' }, [
    el('div', { class: 'chart-label muted', text: t('wb.chartTimeLabel') }),
    el('div', { class: 'chart-host' })
  ]);
  row.appendChild(timeCol);
  let relCol = null;
  if (hasRel) {
    relCol = el('div', { class: 'chart-col' }, [
      el('div', { class: 'chart-label muted', text: t('wb.chartRelLabel') }),
      el('div', { class: 'chart-host' })
    ]);
    row.appendChild(relCol);
  }
  wrap.appendChild(row);

  setTimeout(() => {
    renderCompareChart(timeCol.querySelector('.chart-host'), {
      title: '',
      rows: [{ label: t('wb.respTimeMs'), before: d.beforeMedianMs, after: d.afterMedianMs }],
      beforeName: t('plan.before'), afterName: t('plan.after'), height: 220
    });
    if (relCol) {
      renderCompareChart(relCol.querySelector('.chart-host'), {
        title: '', rows: relRows, beforeName: t('wb.beforeIs100'), afterName: t('plan.after'), height: 220
      });
    }
  }, 0);
  return wrap;
}

function rel(after, before) {
  return Math.round((Number(after) / Number(before)) * 1000) / 10;
}
function isNum(v) { return v !== null && v !== undefined && Number.isFinite(Number(v)); }
function statShort(name) {
  const keys = { 'session logical reads': 'wb.ss.logicalReads', 'consistent gets': 'wb.ss.consistentGets', 'physical reads': 'wb.ss.physicalReads' };
  return keys[name] ? t(keys[name]) : name;
}

function improvementClass(pct) {
  if (pct === null || pct === undefined) return '';
  if (Number(pct) > 5) return 'metric-good';
  if (Number(pct) < -5) return 'metric-bad';
  return '';
}

function metricCard(label, value, sub, cls) {
  return el('div', { class: `metric-card ${cls || ''}` }, [
    el('div', { class: 'metric-label', text: label }),
    el('div', { class: 'metric-value', text: value }),
    sub ? el('div', { class: 'metric-sub', text: sub }) : null
  ]);
}

function verdictBlock(v) {
  const map = {
    IDENTICAL: { cls: 'v-identical', icon: '✔', title: t('wb.vd.identicalTitle'),
      desc: t('wb.vd.identicalDesc') },
    SAME_SET: { cls: 'v-sameset', icon: '≈', title: t('wb.vd.samesetTitle'),
      desc: t('wb.vd.samesetDesc') },
    DIFFERENT: { cls: 'v-different', icon: '✕', title: t('wb.vd.differentTitle'),
      desc: t('wb.vd.differentDesc') },
    INCONCLUSIVE: { cls: 'v-skip', icon: '?', title: t('wb.vd.inconclusiveTitle'),
      desc: v.reason || t('wb.vd.inconclusiveDesc') },
    SKIPPED: { cls: 'v-skip', icon: '–', title: t('wb.vd.skippedTitle'), desc: '' }
  };
  const info = map[v.verdict] || map.SKIPPED;
  const box = el('div', { class: `verdict ${info.cls}` }, [
    el('div', { class: 'verdict-icon', text: info.icon }),
    el('div', {}, [
      el('div', { class: 'verdict-title', text: info.title }),
      el('div', { class: 'verdict-desc', text: v.note ? `${info.desc} ${v.note}` : info.desc }),
      hashRow(v)
    ])
  ]);
  return box;
}

function hashRow(v) {
  if (!v.beforeHash || !v.afterHash) return el('div');
  const eq = (a, b) => (a === b ? t('wb.hashEq') : t('wb.hashNe'));
  const b = v.beforeHash, a = v.afterHash;
  return el('div', {
    class: 'hash-row',
    html:
      t('wb.hashRows', { before: fmtNum(v.beforeRowCount), after: fmtNum(v.afterRowCount), eq: eq(v.beforeRowCount, v.afterRowCount) }) + '<br>' +
      t('wb.hashOrdered', { before: esc(String(b.ordered).slice(0, 16)), after: esc(String(a.ordered).slice(0, 16)), eq: eq(b.ordered, a.ordered) }) + '<br>' +
      t('wb.hashUnordered', { before: esc(String(b.unordered).slice(0, 16)), after: esc(String(a.unordered).slice(0, 16)), eq: eq(b.unordered, a.unordered) }) +
      (v.truncated ? t('wb.hashTruncated') : '')
  });
}

function section(title, builder, gridClass = 'mini-grid') {
  const wrap = el('div', { class: 'verify-section' }, [el('h3', { text: title })]);
  const gridHost = el('div', { class: gridClass });
  wrap.appendChild(gridHost);
  setTimeout(() => builder(gridHost), 0);
  return wrap;
}

function diffBlock(v, r) {
  const wrap = el('div', { class: 'verify-section' }, [
    el('h3', { text: t('wb.diffSample') }),
    el('div', {
      class: 'muted', style: 'margin-bottom:6px;',
      text: t('wb.diffSummary', { before: fmtNum(v.diff.onlyInBefore), after: fmtNum(v.diff.onlyInAfter) })
    })
  ]);
  const mk = (label, rows, cols) => {
    const h = el('div', {});
    h.appendChild(el('h3', { text: label, style: 'margin-top:8px;' }));
    const gh = el('div', { class: 'mini-grid' });
    h.appendChild(gh);
    setTimeout(() => {
      const columns = (cols || []).map((c, i) => ({ field: `c${i + 1}`, header: c.name, width: 140 }));
      const data = (rows || []).map((row) => {
        const o = {};
        row.forEach((val, i) => { o[`c${i + 1}`] = val; });
        return o;
      });
      renderTable(gh, data, columns, { rowNumber: true, filterable: false });
    }, 0);
    return h;
  };
  const bcols = (r.beforeSample && r.beforeSample.columns) || [];
  const acols = (r.afterSample && r.afterSample.columns) || [];
  if (v.diff.beforeSampleRows && v.diff.beforeSampleRows.length) {
    wrap.appendChild(mk(t('wb.onlyBefore'), v.diff.beforeSampleRows, bcols));
  }
  if (v.diff.afterSampleRows && v.diff.afterSampleRows.length) {
    wrap.appendChild(mk(t('wb.onlyAfter'), v.diff.afterSampleRows, acols));
  }
  return wrap;
}

// ── 결과 내보내기 ──────────────────────────────────────────────────────────

function exportResult(kind) {
  const host = $('#grid-result');
  if (!host._ogGrid) return toast(t('wb.noExport'), 'warn');
  try {
    if (kind === 'csv') host._ogGrid.exportCsv({ filename: `result_${stamp()}.csv` });
    else host._ogGrid.exportExcel({ filename: `result_${stamp()}.xlsx` });
  } catch (e) {
    toast(t('wb.exportFail', { msg: e.message }), 'err');
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 현재 결과 그리드를 TSV(엑셀·표 붙여넣기용)로 클립보드에 복사한다. */
async function copyResult() {
  const last = state.lastResultShown; // 결과 탭에 마지막으로 렌더된 결과
  if (!last || !last.columns || !last.columns.length) return toast(t('common.nothingToCopy'), 'warn');
  const header = last.columns.map((c) => c.name).join('\t');
  const lines = (last.rows || []).map((row) =>
    last.columns.map((c, i) => {
      const v = Array.isArray(row) ? row[i] : row[c.name];
      return v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]/g, ' ');
    }).join('\t'));
  const tsv = [header].concat(lines).join('\n');
  const ok = await copyToClipboard(tsv);
  toast(ok ? t('wb.copiedRows', { msg: t('common.copied'), n: lines.length }) : t('common.copyFail'), ok ? 'ok' : 'err');
}

/** 현재 실행계획 텍스트를 복사한다. */
async function copyPlan() {
  const plan = state.lastPlan[$('#plan-side').value];
  const text = (plan && (plan.text || '')) || $('#plan-text').textContent;
  if (!text.trim()) return toast(t('common.nothingToCopy'), 'warn');
  const ok = await copyToClipboard(text);
  toast(ok ? t('common.copied') : t('common.copyFail'), ok ? 'ok' : 'err');
}

// ── 탭 / 분할 ──────────────────────────────────────────────────────────────

export function showTab(name) {
  for (const t of $$('.rtab[data-tab]')) t.classList.toggle('is-active', t.dataset.tab === name);
  for (const p of $$('.rpanel[data-tab]')) p.classList.toggle('is-active', p.dataset.tab === name);
  setTimeout(resizeAll, 0);
}

function initSplitter() {
  const splitter = $('#splitter-v');
  const top = $('#pane-editors');
  let dragging = false;

  splitter.addEventListener('mousedown', (e) => {
    dragging = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = top.parentElement.getBoundingClientRect();
    const h = Math.min(Math.max(e.clientY - rect.top, 120), rect.height - 140);
    top.style.flex = `0 0 ${h}px`;
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizeAll();
  });
  window.addEventListener('resize', () => resizeAll());
}
