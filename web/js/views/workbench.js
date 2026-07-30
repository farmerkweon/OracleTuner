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
    name: '튜닝 전 SQL',
    value: '',
    onChange: () => updateMeta('before'),
    onAction: (act) => handleAction(act, 'before')
  });
  state.editors.after = new SqlEditor($('#editor-after'), {
    name: '튜닝 후 SQL',
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

/** 워크벤치를 빈 상태로 초기화한다(신규 SQL). 편집기·문서배지·결과패널을 모두 비운다. */
export function resetWorkbench() {
  state.editors.before.setValue('');
  state.editors.after.setValue('');
  setDoc('before', { isNew: true });
  setDoc('after', null);
  state.lastResult = { before: null, after: null };
  state.lastPlan = { before: null, after: null };
  state.lastAnalysis = { before: null, after: null };
  state.lastCompare = null;
  state.lastResultShown = null;
  // 결과 영역 비우기
  $('#grid-result').innerHTML = `<div class="pad muted">${esc(t('res.empty'))}</div>`;
  $('#result-summary').textContent = t('res.empty');
  $('#grid-plan').innerHTML = '';
  $('#plan-text').textContent = '';
  $('#grid-diag').innerHTML = '';
  $('#grid-stats').innerHTML = '';
  $('#verify-body').innerHTML = `<p class="muted pad">${t('verify.intro')}</p>`;
  $('#cand-body').innerHTML = `<p class="pad muted">${t('cd.intro')}</p>`;
  for (const id of ['badge-diag', 'badge-cands']) { const b = $('#' + id); b.textContent = ''; b.className = 'badge'; }
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
    node.textContent = side === 'after' ? '(비어 있음 — 튜닝안을 여기에 작성하세요)' : '';
    return;
  }
  const stmts = tk.splitStatements(sql);
  const cur = ed.currentStatement();
  const binds = tk.extractBinds(sql);
  const parts = [
    `${stmts.length}개 문장`,
    `현재: ${cur.type || '-'}`,
    `${sql.split('\n').length}줄`
  ];
  if (binds.length) parts.push(`바인드 ${binds.length}개`);
  const subs = tk.extractSubstitutions(sql);
  if (subs.length) parts.push(`치환변수 ${subs.join(',')}`);
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
        toast('튜닝 후 편집기로 복사했습니다.');
        return;
      }
      case 'compare': return await compare(btn);
      default: return;
    }
  } catch (e) {
    toast(errText(e), 'err');
    logMsg(`${act} 실패: ${errText(e)}`, 'err');
  }
}

function requireSession() {
  if (!session.connected) {
    toast('먼저 DB 에 접속하세요. (Ctrl+Shift+C)', 'warn');
    throw new Error('DB 에 접속되어 있지 않습니다.');
  }
}

// ── 실행 ───────────────────────────────────────────────────────────────────

async function runSql(side, btn) {
  requireSession();
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast('실행할 문장이 없습니다.', 'warn');
  ed.markStatement();

  setRunning(true);
  const t0 = performance.now();
  try {
    logMsg(`[${side === 'before' ? '전' : '후'}] 실행: ${oneLine(st.sql)}`);
    const r = await api.execute({ sql: st.sql });
    state.lastResult[side] = r;

    showTab('result');
    renderResult($('#grid-result'), r);
    state.lastResultShown = r; // 결과 복사(TSV)가 참조한다
    renderStats(r);

    const wall = performance.now() - t0;
    const t = r.timings || {};
    if (r.kind === 'update') {
      $('#result-summary').innerHTML =
        `<b>${fmtNum(r.affectedRows)}행</b> 영향 · ${fmtMs(t.totalMs)}` +
        (r.rolledBack ? ' · <span style="color:var(--warn)">안전모드로 자동 롤백됨</span>' : ' · <b style="color:var(--danger)">커밋되지 않음(수동 커밋 필요)</b>');
      logMsg(`영향 행수 ${r.affectedRows}${r.rolledBack ? ' (자동 롤백)' : ''}`, 'ok');
    } else {
      // 소비(실제로 읽은 행수)와 표시(응답에 보관된 행수)를 분리해 보여준다 — 성능평가 목적상
      // 실제 소비 행수가 진실이고, 표시 행수는 keepRowsMax 로 묶인 UI 용 상한이다.
      const consumed = r.consumedRows != null ? r.consumedRows : r.rowCount;
      const kept = r.keptRowCount != null ? r.keptRowCount : r.rowCount;
      const keepNote = r.keepTruncated ? ' <span style="color:var(--warn)">(표시 상한 초과 — 일부만 보관)</span>' : '';
      $('#result-summary').innerHTML =
        `<b>소비 ${fmtNum(consumed)}행</b> · 표시 ${fmtNum(kept)}행${keepNote}` +
        `${r.truncated ? ' <span style="color:var(--warn)">(최대 인출 수에서 잘림)</span>' : ''}` +
        ` · 실행 ${fmtMs(t.executeMs)} + 인출 ${fmtMs(t.fetchMs)} = <b>${fmtMs(t.totalMs)}</b>` +
        ` · 왕복 ${fmtMs(wall)}` +
        (r.statsAvailable ? ' · 세션통계 수집됨' : ' · <span class="muted">세션통계 없음(권한)</span>');
      logMsg(`소비 ${consumed}행 · 표시 ${kept}행 / ${fmtMs(t.totalMs)}`, 'ok');
    }

    // 설정에 따라 계획도 같이
    if (window.__otConfig && window.__otConfig.execution && window.__otConfig.execution.autoExplain) {
      explainSql(side).catch(() => {});
    }
  } catch (e) {
    $('#result-summary').innerHTML = `<span style="color:var(--danger)">${esc(errText(e))}</span>`;
    logMsg(`실행 실패: ${errText(e)}`, 'err');
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

  setRunning(true);
  showTab('log');
  logMsg(`스크립트 실행 시작 — ${n}문장`);
  await withBusy(btn, async () => {
    try {
      const r = await api.runScript({ sql, continueOnError: true, commit: true });
      for (const item of r.results) {
        const head = `  [${item.no}/${r.total}] ${item.type}`;
        if (item.ok) {
          const detail = item.kind === 'update'
            ? `${fmtNum(item.affectedRows)}행 반영`
            : `${fmtNum(item.rowCount || 0)}행`;
          logMsg(`${head} ✓ ${detail} (${item.elapsedMs}ms) — ${item.preview}`, 'ok');
        } else {
          logMsg(`${head} ✗ ${item.ora || ''} ${item.error} — ${item.preview}`, 'err');
        }
      }
      const msg = t('wb.runScriptDone', { ok: r.ok, failed: r.failed });
      logMsg(msg, r.failed ? 'err' : 'ok');
      toast(msg, r.failed ? 'warn' : 'ok', 6000);
    } catch (e) {
      logMsg(`스크립트 실패: ${errText(e)}`, 'err');
      toast(errText(e), 'err', 8000);
    } finally {
      setRunning(false);
    }
  }, '…');
}

function setRunning(on) {
  state.running = on;
  $('#btn-cancel-sql').disabled = !on;
  $('#rail-msg').textContent = on ? '실행 중…' : '';
}

async function cancelRunning() {
  try {
    const r = await api.cancel();
    toast(r.cancelled ? '실행을 취소했습니다.' : `취소하지 못했습니다: ${r.reason || ''}`, r.cancelled ? '' : 'warn');
  } catch (e) {
    toast(errText(e), 'err');
  }
}

function oneLine(sql) {
  const s = String(sql).replace(/\s+/g, ' ').trim();
  return s.length > 110 ? s.slice(0, 110) + '…' : s;
}

// ── 실행계획 ───────────────────────────────────────────────────────────────

async function explainSql(side, btn) {
  requireSession();
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast('계획을 볼 문장이 없습니다.', 'warn');

  await withBusy(btn, async () => {
    const plan = await api.explain(st.sql);
    state.lastPlan[side] = plan;
    $('#plan-side').value = side;
    showTab('plan');
    showPlan(side);
    if (!plan.available) {
      logMsg(`실행계획 조회 불가: ${plan.error || plan.note || ''}`, 'err');
    } else {
      logMsg(`실행계획(${plan.source}) ${plan.rows.length}단계, 총비용 ${fmtBig((plan.summary || {}).totalCost)}`);
    }
  }, '…');
}

function showPlan(side) {
  const plan = state.lastPlan[side];
  const text = $('#plan-text');
  if (!plan) {
    $('#grid-plan').innerHTML = '<div class="pad muted">아직 조회하지 않았습니다.</div>';
    text.textContent = '';
    $('#plan-summary').textContent = '실행계획을 조회하면 여기에 표시됩니다.';
    return;
  }
  renderPlan($('#grid-plan'), plan);
  text.textContent = plan.text || plan.error || '(계획 텍스트 없음)';

  const s = plan.summary || {};
  const bits = [];
  if (plan.available) {
    bits.push(`출처: ${planSourceLabel(plan.source)}`);
    bits.push(`총 비용 ${fmtBig(s.totalCost)}`);
    bits.push(`예상 행수 ${fmtBig(s.estimatedRows)}`);
    bits.push(`${s.steps}단계`);
    if (s.fullScans) bits.push(`전체스캔 ${s.fullScans}`);
    if (s.cartesian) bits.push(`카티션 ${s.cartesian}`);
    if (s.sorts) bits.push(`정렬 ${s.sorts}`);
  } else {
    bits.push(`조회 불가 — ${plan.error || plan.note || ''}`);
  }
  $('#plan-summary').innerHTML = esc(bits.join(' · ')) + (plan.note ? ` <span class="muted">(${esc(plan.note)})</span>` : '');
}

function planSourceLabel(src) {
  return { DBMS_XPLAN: 'DBMS_XPLAN 표준서식', PLAN_TABLE: '계획테이블 직접조회', DISPLAY_CURSOR: '실제 실행 계획', NONE: '없음' }[src] || src;
}

async function loadActualPlan() {
  requireSession();
  const btn = $('#btn-plan-cursor');
  await withBusy(btn, async () => {
    const r = await api.displayCursor('ALLSTATS LAST +COST +BYTES');
    if (!r.available) {
      toast(`실제 계획을 볼 수 없습니다: ${r.error || 'V$ 권한 부족'}`, 'warn', 5000);
      logMsg(`DISPLAY_CURSOR 불가: ${r.error || ''}`, 'err');
      return;
    }
    $('#plan-text').textContent = r.text;
    $('#plan-summary').innerHTML = `출처: <b>실제 실행 계획(DISPLAY_CURSOR)</b> · SQL_ID ${esc(r.sqlId || '')}`;
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
        { field: 'elapsed_us', header: '경과(us)', width: 100, align: 'right' }
      ], { rowNumber: false });
    }
    logMsg(`실제 실행 계획 조회 완료 (SQL_ID ${r.sqlId})`, 'ok');
  }, '…');
}

// ── 진단 ───────────────────────────────────────────────────────────────────

async function analyzeSql(side, btn) {
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast('진단할 문장이 없습니다.', 'warn');

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
      ? `DB 연동 분석 (계획 ${r.plan && r.plan.available ? '있음' : '없음'}, 컬럼타입 ${r.meta.columnTypeCount}개, 통계 ${r.meta.tableCount}개 테이블)`
      : '정적 분석만 (DB 미접속)';
    $('#diag-summary').innerHTML =
      `점수 <b>${r.score}</b>/100 · 지적 ${s.total}건 (높음 ${s.high} / 보통 ${s.medium} / 낮음 ${s.low} / 참고 ${s.info}) · <span class="muted">${esc(src)}</span>` +
      (r.meta && r.meta.errors && r.meta.errors.length
        ? ` <span class="muted" title="${esc(r.meta.errors.map((x) => x.step + ': ' + x.message).join('\n'))}">· 일부 조회 실패 ${r.meta.errors.length}건</span>` : '');

    if (r.plan) {
      state.lastPlan[side] = r.plan;
      $('#plan-side').value = side;
      showPlan(side);
    }
    logMsg(`진단(${side === 'before' ? '전' : '후'}): ${s.total}건, 점수 ${r.score}`);
  }, '…');
}

async function applyFix(side, finding) {
  if (finding.fixAction === 'expandStar') return expandStar(side);
  toast('이 지적에는 자동 수정이 없습니다.', 'warn');
}

// ── 편집 보조 ──────────────────────────────────────────────────────────────

async function formatSql(side) {
  const ed = state.editors[side];
  const st = ed.currentStatement();
  const target = st.sql.trim() ? st : { sql: ed.value, start: 0, end: ed.value.length };
  const r = await api.format(target.sql);
  const v = ed.value;
  ed.setValue(v.slice(0, target.start) + r.sql + v.slice(target.end));
  toast('SQL 을 정렬했습니다.');
}

async function expandStar(side, btn) {
  const ed = state.editors[side];
  const st = ed.currentStatement();
  if (!st.sql.trim()) return toast('대상 문장이 없습니다.', 'warn');

  await withBusy(btn, async () => {
    if (!session.connected) {
      toast('컬럼 목록을 얻으려면 DB 접속이 필요합니다.', 'warn');
      return;
    }
    const r = await api.expandStar({ sql: st.sql });
    if (!r.ok) {
      toast(r.error || '펼치지 못했습니다.', 'warn');
      return;
    }
    ed.replaceCurrentStatement(r.sql);
    toast(`컬럼 ${r.expanded}개로 펼쳤습니다.`, 'ok');
  }, '…');
}


// ── 계측 탭 ────────────────────────────────────────────────────────────────

function renderStats(result) {
  const host = $('#grid-stats');
  const t = result.timings || {};
  const rows = [
    { name: '파싱/준비 (prepare)', value: t.prepareMs, unit: 'ms', note: 'PreparedStatement 생성 시간' },
    { name: '실행 (execute)', value: t.executeMs, unit: 'ms', note: '서버가 커서를 열 때까지' },
    { name: '인출 (fetch)', value: t.fetchMs, unit: 'ms', note: '결과 행을 모두 받아오는 시간' },
    { name: '합계', value: t.totalMs, unit: 'ms', note: '' }
  ];
  if (result.stats) {
    for (const [k, v] of Object.entries(result.stats)) {
      rows.push({ name: k, value: v, unit: '', note: statNote(k) });
    }
    $('#stats-summary').textContent = '세션 통계 증분(V$MYSTAT)입니다. 시간보다 흔들림이 적어 튜닝 판정의 1차 근거로 쓰세요.';
  } else {
    $('#stats-summary').textContent = 'V$MYSTAT 접근 권한이 없어 시간만 측정했습니다. 이 환경에서는 반복 측정(벤치마크)으로 보완하세요.';
  }
  renderTable(host, rows, [
    { field: 'name', header: '항목', width: 250 },
    { field: 'value', header: '값', width: 120, align: 'right', type: 'number' },
    { field: 'unit', header: '단위', width: 60 },
    { field: 'note', header: '설명', width: 420 }
  ], { rowNumber: false, filterable: false });
}

const STAT_NOTES = {
  'session logical reads': '논리적 블록 읽기 총량. 튜닝 효과를 가장 잘 반영하는 지표.',
  'consistent gets': '일관성 읽기(주로 SELECT). 줄어들면 실질적으로 빨라진 것.',
  'db block gets': '현재 모드 읽기(주로 DML).',
  'physical reads': '디스크에서 읽은 블록. 버퍼 캐시 상태에 따라 흔들린다.',
  'sorts (memory)': '메모리 정렬 횟수.',
  'sorts (disk)': '디스크 정렬 횟수. 0 이 아니면 PGA 부족 신호.',
  'table scans (long tables)': '큰 테이블 전체 스캔 횟수.',
  'table fetch by rowid': '인덱스를 타고 행을 찾은 횟수.',
  'CPU used by this session': 'CPU 사용(1/100초).',
  'parse count (hard)': '하드 파싱 횟수. 바인드 변수 미사용의 대표 신호.'
};

function statNote(k) { return STAT_NOTES[k] || ''; }

// ── 비교 검증 ──────────────────────────────────────────────────────────────

async function compare(btn) {
  requireSession();
  const before = state.editors.before.currentStatement().sql.trim();
  const after = state.editors.after.currentStatement().sql.trim();
  if (!before || !after) {
    toast('튜닝 전/후 SQL 이 모두 필요합니다.', 'warn');
    return;
  }

  showTab('verify');
  $('#verify-body').innerHTML = '<p class="pad muted">전·후 SQL 을 번갈아 실행하며 측정하고 있습니다…</p>';
  setRunning(true);

  await withBusy(btn, async () => {
    try {
      const r = await api.compare({ before: { sql: before }, after: { sql: after } });
      state.lastCompare = r;
      renderCompare(r);
      const v = r.verification || {};
      const d = (r.performance && r.performance.delta) || {};
      logMsg(`비교 검증: ${v.verdictLabel || v.verdict || '-'} / 성능 ${fmtPct(d.improvementPct)}`,
        v.verdict === 'DIFFERENT' ? 'err' : 'ok');
    } catch (e) {
      $('#verify-body').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
      logMsg(`비교 검증 실패: ${errText(e)}`, 'err');
    } finally {
      setRunning(false);
    }
  }, '검증 중…');
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
  cards.appendChild(metricCard('응답시간 (중앙값)',
    `${fmtMs(d.beforeMedianMs)} → ${fmtMs(d.afterMedianMs)}`,
    d.speedup ? `${d.speedup}배` : '', improvementClass(d.improvementPct)));
  cards.appendChild(metricCard('개선율', fmtPct(d.improvementPct),
    `${r.runs}회 교차 실행 (워밍업 ${r.warmup}회 제외)`, improvementClass(d.improvementPct)));

  const lr = (d.stats || []).find((s) => s.name === 'session logical reads')
    || (d.stats || []).find((s) => s.name === 'consistent gets');
  if (lr) {
    cards.appendChild(metricCard('논리적 읽기',
      `${fmtBig(lr.before)} → ${fmtBig(lr.after)}`,
      `${fmtPct(lr.improvementPct)} · 시간보다 안정적인 지표`, improvementClass(lr.improvementPct)));
  }
  if (r.planDiff) {
    const cost = r.planDiff.rows.find((x) => x.metric === 'totalCost');
    if (cost) {
      cards.appendChild(metricCard('옵티마이저 비용',
        `${fmtBig(cost.before)} → ${fmtBig(cost.after)}`,
        `${fmtPct(cost.improvementPct)} · 추정치(실측 아님)`, improvementClass(cost.improvementPct)));
    }
  }
  host.appendChild(cards);

  // 2.5) 차트 — 전/후를 한눈에 비교. 시간과 논리읽기를 각각 정규화해 같은 축에 놓는다.
  host.appendChild(compareChartSection(d));

  // 3) 세부 표들
  if (d.statsAvailable) {
    host.appendChild(section('세션 통계 비교 (중앙값)', (hostEl) => {
      renderTable(hostEl, d.stats, [
        { field: 'name', header: '통계 항목', width: 240 },
        { field: 'before', header: '튜닝 전', width: 120, align: 'right', type: 'number' },
        { field: 'after', header: '튜닝 후', width: 120, align: 'right', type: 'number' },
        { field: 'delta', header: '증감', width: 110, align: 'right', type: 'number' },
        { field: 'improvementPct', header: '개선율(%)', width: 110, align: 'right', type: 'number' }
      ], { rowNumber: false, filterable: false });
    }, 'mini-grid tall'));
  } else {
    host.appendChild(el('div', { class: 'verify-section' }, [
      el('h3', { text: '세션 통계 비교' }),
      el('div', { class: 'pad muted', html: 'V$MYSTAT 접근 권한이 없어 통계 증분을 수집하지 못했습니다. ' +
        '이 환경에서는 <b>반복 실행의 중앙값</b>과 <b>결과 동일성</b>이 판단 근거입니다.' })
    ]));
  }

  host.appendChild(section('실행별 소요시간', (hostEl) => {
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
      { field: 'run', header: '회차', width: 60, align: 'right' },
      { field: 'beforeMs', header: '전 합계(ms)', width: 110, align: 'right', type: 'number' },
      { field: 'beforeExecMs', header: '전 실행(ms)', width: 110, align: 'right', type: 'number' },
      { field: 'afterMs', header: '후 합계(ms)', width: 110, align: 'right', type: 'number' },
      { field: 'afterExecMs', header: '후 실행(ms)', width: 110, align: 'right', type: 'number' },
      { field: 'rows', header: '행수', width: 100, align: 'right' }
    ], { rowNumber: false, filterable: false });
  }));

  if (r.planDiff) {
    host.appendChild(section('실행계획 요약 비교 (옵티마이저 추정치)', (hostEl) => {
      renderTable(hostEl, r.planDiff.rows.map((x) => ({ ...x, metric: PLAN_METRIC_LABEL[x.metric] || x.metric })), [
        { field: 'metric', header: '지표', width: 180 },
        { field: 'before', header: '튜닝 전', width: 120, align: 'right', type: 'number' },
        { field: 'after', header: '튜닝 후', width: 120, align: 'right', type: 'number' },
        { field: 'delta', header: '증감', width: 110, align: 'right', type: 'number' },
        { field: 'improvementPct', header: '개선율(%)', width: 110, align: 'right', type: 'number' }
      ], { rowNumber: false, filterable: false });
    }));
  }

  // 4) 결과 차이 표본
  if (v.verdict === 'DIFFERENT' && v.diff) {
    host.appendChild(diffBlock(v, r));
  }
}

const PLAN_METRIC_LABEL = {
  totalCost: '총 비용', estimatedRows: '예상 행수', steps: '계획 단계 수',
  fullScans: '전체 테이블 스캔', cartesian: '카티션 조인', indexScans: '인덱스 접근',
  sorts: '정렬 단계', hashJoins: '해시 조인', nestedLoops: '중첩 루프'
};

/**
 * 전/후 비교 차트.
 *
 * <p>시간(ms)과 논리읽기(블록 수)는 <b>단위가 달라 한 축에 그대로 못 올린다.</b>
 * 그래서 두 계열을 나눠 보여준다:
 *  1) 응답시간 절대값 막대 (ms)
 *  2) 주요 지표를 "원본=100" 으로 정규화한 상대 막대(값이 낮을수록 좋음)
 */
function compareChartSection(d) {
  const wrap = el('div', { class: 'verify-section' }, [el('h3', { text: '전 / 후 비교 차트' })]);

  // 정규화 상대 비교(원본=100) 데이터 준비
  const relRows = [];
  if (isNum(d.beforeMedianMs) && d.beforeMedianMs > 0) {
    relRows.push({ label: '응답시간', before: 100, after: rel(d.afterMedianMs, d.beforeMedianMs) });
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
    relRows.push({ label: '옵티마이저 비용', before: 100, after: rel(costRow.after, costRow.before) });
  }

  // 두 그래프를 한 줄에(비교 대상이 전/후 둘뿐이라 나란히 두는 편이 읽기 좋다)
  const hasRel = relRows.length > 1;
  const row = el('div', { class: `chart-row ${hasRel ? '' : 'single'}` });
  const timeCol = el('div', { class: 'chart-col' }, [
    el('div', { class: 'chart-label muted', text: '응답시간 (ms, 낮을수록 좋음)' }),
    el('div', { class: 'chart-host' })
  ]);
  row.appendChild(timeCol);
  let relCol = null;
  if (hasRel) {
    relCol = el('div', { class: 'chart-col' }, [
      el('div', { class: 'chart-label muted', text: '상대 비교 (원본 = 100, 낮을수록 개선)' }),
      el('div', { class: 'chart-host' })
    ]);
    row.appendChild(relCol);
  }
  wrap.appendChild(row);

  setTimeout(() => {
    renderCompareChart(timeCol.querySelector('.chart-host'), {
      title: '',
      rows: [{ label: '응답시간(ms)', before: d.beforeMedianMs, after: d.afterMedianMs }],
      beforeName: '튜닝 전', afterName: '튜닝 후', height: 220
    });
    if (relCol) {
      renderCompareChart(relCol.querySelector('.chart-host'), {
        title: '', rows: relRows, beforeName: '튜닝 전(100)', afterName: '튜닝 후', height: 220
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
  return { 'session logical reads': '논리읽기', 'consistent gets': '일관성읽기', 'physical reads': '물리읽기' }[name] || name;
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
    IDENTICAL: { cls: 'v-identical', icon: '✔', title: '결과 완전 동일',
      desc: '행 내용과 순서까지 같습니다. 튜닝 후 SQL 로 안전하게 교체할 수 있습니다.' },
    SAME_SET: { cls: 'v-sameset', icon: '≈', title: '행 집합은 같지만 순서가 다릅니다',
      desc: 'ORDER BY 유무나 정렬 기준이 달라졌습니다. 호출하는 쪽이 순서에 의존한다면 문제가 됩니다.' },
    DIFFERENT: { cls: 'v-different', icon: '✕', title: '결과가 다릅니다',
      desc: '튜닝 후 SQL 이 다른 결과를 냅니다. 성능과 무관하게 그대로 적용하면 안 됩니다.' },
    INCONCLUSIVE: { cls: 'v-skip', icon: '?', title: '결과 비교 불가',
      desc: v.reason || '조회문이 아니어서 행 단위 비교를 하지 못했습니다.' },
    SKIPPED: { cls: 'v-skip', icon: '–', title: '결과 검증을 건너뛰었습니다', desc: '' }
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
  const eq = (a, b) => (a === b ? '<span class="hash-eq">일치</span>' : '<span class="hash-ne">불일치</span>');
  const b = v.beforeHash, a = v.afterHash;
  return el('div', {
    class: 'hash-row',
    html:
      `행수 ${fmtNum(v.beforeRowCount)} → ${fmtNum(v.afterRowCount)} ${eq(v.beforeRowCount, v.afterRowCount)}<br>` +
      `순서포함 지문 ${esc(String(b.ordered).slice(0, 16))} → ${esc(String(a.ordered).slice(0, 16))} ${eq(b.ordered, a.ordered)}<br>` +
      `집합 지문 ${esc(String(b.unordered).slice(0, 16))} → ${esc(String(a.unordered).slice(0, 16))} ${eq(b.unordered, a.unordered)}` +
      (v.truncated ? '<br><span style="color:var(--warn)">※ 최대 인출 행수에서 잘린 상태의 비교입니다.</span>' : '')
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
    el('h3', { text: '결과 차이 표본' }),
    el('div', {
      class: 'muted', style: 'margin-bottom:6px;',
      text: `튜닝 전에만 있는 행 ${fmtNum(v.diff.onlyInBefore)}건, 튜닝 후에만 있는 행 ${fmtNum(v.diff.onlyInAfter)}건 (각 최대 20건 표본)`
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
    wrap.appendChild(mk('튜닝 전에만 있는 행', v.diff.beforeSampleRows, bcols));
  }
  if (v.diff.afterSampleRows && v.diff.afterSampleRows.length) {
    wrap.appendChild(mk('튜닝 후에만 있는 행', v.diff.afterSampleRows, acols));
  }
  return wrap;
}

// ── 결과 내보내기 ──────────────────────────────────────────────────────────

function exportResult(kind) {
  const host = $('#grid-result');
  if (!host._ogGrid) return toast('내보낼 결과가 없습니다.', 'warn');
  try {
    if (kind === 'csv') host._ogGrid.exportCsv({ filename: `result_${stamp()}.csv` });
    else host._ogGrid.exportExcel({ filename: `result_${stamp()}.xlsx` });
  } catch (e) {
    toast(`내보내기 실패: ${e.message}`, 'err');
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
  toast(ok ? `${t('common.copied')} (${lines.length}행)` : t('common.copyFail'), ok ? 'ok' : 'err');
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
