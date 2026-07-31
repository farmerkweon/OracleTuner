/**
 * 튜닝 후보 화면 — 이 도구의 결론 화면.
 *
 * <p>사용 흐름
 * <ol>
 *   <li><b>후보 생성</b> — SQL 을 뜯어보고 시도해 볼 수 있는 튜닝안을 자동으로 만든다(실행하지 않음).</li>
 *   <li><b>토너먼트 실행</b> — 원본과 후보들을 번갈아 여러 회전 실행해 속도·부하를 재고,
 *       결과가 원본과 같은지까지 확인한 뒤 순위를 매긴다.</li>
 *   <li><b>채택</b> — 고른 안을 튜닝 후 편집기로 넣는다.</li>
 * </ol>
 *
 * <p>화면 설계 의도: 순위표만 보여 주면 "왜 이게 1등인지" 알 수 없다.
 * 그래서 각 행을 펼치면 <b>바뀐 SQL</b>, <b>왜 이 변환을 시도했는지</b>,
 * <b>회차별 실측치</b>를 함께 보여 준다. 사용자가 납득하고 고르게 하는 것이 목적이다.
 */

import { $, el, esc, safeHtml, toast, logMsg, errText, fmtMs, fmtNum, fmtBig, withBusy, copyToClipboard } from '../util.js';
import { api, session } from '../api.js';
import { t } from '../i18n.js';
import { makeGrid, renderTable, renderCompareChart, wireDetailExpand } from '../gridkit.js';

const state = {
  generated: null,   // 후보 생성 결과
  result: null,      // 토너먼트 + 순위 결과
  onAdopt: null,     // 채택 시 콜백(튜닝 후 편집기로 전달)
  getSql: null       // 현재 원본 SQL 을 가져오는 함수
};

// 라벨 자체는 사전(grade.* / verdict.*)에서 가져오므로 여기서는 표시 스타일만 갖는다.
const GRADE_STYLE = {
  strong: { cls: 'v-identical', icon: '★' },
  good: { cls: 'v-identical', icon: '✔' },
  moderate: { cls: 'v-sameset', icon: '△' },
  marginal: { cls: 'v-skip', icon: '–' },
  worse: { cls: 'v-different', icon: '✕' },
  none: { cls: 'v-skip', icon: '–' }
};

const VERDICT_PILL = {
  IDENTICAL: { cls: 'sev-low' },
  SAME_SET: { cls: 'sev-medium' },
  DIFFERENT: { cls: 'sev-high' },
  INCONCLUSIVE: { cls: 'sev-info' },
  SKIPPED: { cls: 'sev-info' }
};

export function initCandidates(opts = {}) {
  state.onAdopt = opts.onAdopt || (() => {});
  state.getSql = opts.getSql || (() => '');

  $('#btn-gen-cands').addEventListener('click', () => generate($('#btn-gen-cands')));
  $('#btn-run-tournament').addEventListener('click', () => runTournament($('#btn-run-tournament')));
}

function opts() {
  return {
    runs: Number($('#cd-runs').value) || 3,
    warmup: Number($('#cd-warmup').value),
    maxCandidates: Number($('#cd-max').value) || 12,
    includeExperimental: $('#cd-exp').checked
  };
}

// ── 1단계: 후보 생성 ───────────────────────────────────────────────────────

async function generate(btn) {
  const sql = state.getSql();
  if (!sql.trim()) return toast(t('cd.needSql'), 'warn');

  await withBusy(btn, async () => {
    try {
      const o = opts();
      const r = await api.generateCandidates({
        sql,
        useDb: session.connected,
        maxCandidates: o.maxCandidates,
        includeExperimental: o.includeExperimental
      });
      state.generated = r;
      state.result = null;
      renderGenerated(r);
      setBadge(r.candidates.length, 'pending');
      $('#cd-summary').innerHTML =
        t('cd.genSummary', { n: r.candidates.length }) +
        (r.total > r.candidates.length ? t('cd.genSummaryTotal', { total: r.total }) : '') +
        (r.meta && r.meta.usedDb ? t('cd.genUsedDb') : t('cd.genNoDb'));
      logMsg(t('cd.genLog', { n: r.candidates.length }));
      if (!session.connected) {
        toast(t('cd.connectForBetter'), 'warn', 6000);
      }
    } catch (e) {
      $('#cand-body').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
      toast(errText(e), 'err');
    }
  }, t('cd.generating'));
}

function renderGenerated(r) {
  const host = $('#cand-body');
  host.innerHTML = '';

  if (!r.candidates.length) {
    host.innerHTML = `<div class="pad muted">${esc(t('cd.noneFound'))}</div>`;
    return;
  }

  host.appendChild(el('div', {
    class: 'verdict v-skip',
    html: `<div class="verdict-icon">•</div><div>
      <div class="verdict-title">${esc(t('cd.pendingTitle', { n: r.candidates.length }))}</div>
      <div class="verdict-desc">${esc(t('cd.pendingDesc', { total: (r.candidates.length + 1) * (Number($('#cd-runs').value) || 3) }))}</div>
    </div>`
  }));

  const gridHost = el('div', { class: 'cand-grid' });
  host.appendChild(gridHost);

  const grid = makeGrid(gridHost, {
    columns: [
      { field: 'no', header: '#', width: 46, align: 'right' },
      { field: 'title', header: t('col.tuneItem'), width: 300 },
      { field: 'riskHtml', header: t('col.risk'), width: 100, renderer: 'html', align: 'center' },
      { field: 'category', header: t('col.type'), width: 80, align: 'center' },
      { field: 'changeText', header: t('col.change'), width: 420 }
    ],
    rowNumber: false,
    filterable: false,
    masterDetail: {
      enabled: true, height: 280, heightMode: 'auto', expandMultiple: true,
      renderer: (row, hostEl) => {
        const draw = (target) => { target.innerHTML = candDetailHtml(row, null); wireDetailButtons(target, row); };
        draw(hostEl);
        wireDetailExpand(hostEl, row.title, draw);
      }
    }
  });
  grid.setData(r.candidates.map((c, i) => ({
    ...c,
    no: i + 1,
    riskHtml: riskPill(c.risk),
    changeText: (c.changes || []).join(' / ')
  })));

  if (r.skipped && r.skipped.length) {
    host.appendChild(skippedBlock(r.skipped));
  }
}

// ── 2단계: 토너먼트 ────────────────────────────────────────────────────────

let progressTimer = null;

function stopProgressPoll() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

/** 후보 탭이 실제로 화면에 보이는지 — 다른 탭/뷰로 이탈했으면 폴링을 멈춘다(누수 방지). */
function isCandsTabVisible() {
  const rp = document.querySelector('.rpanel[data-tab="cands"]');
  const wv = document.querySelector('.view[data-view="workbench"]');
  return !!(rp && rp.classList.contains('is-active') && wv && wv.classList.contains('is-active'));
}

/** 프로그래스바 뼈대를 만든다. total 을 모르는 초기 상태는 불확정 막대로 보여준다. */
function buildProgressScaffold() {
  const fill = el('div', {
    style: 'height:100%;border-radius:4px;background:var(--accent);width:22%;' +
      'transition:width .3s,margin-left .25s'
  });
  const track = el('div', {
    style: 'height:8px;border-radius:4px;background:var(--border);overflow:hidden;position:relative'
  }, [fill]);
  const label = el('span', { style: 'font-weight:600' }, [t('cd.progress.starting')]);
  const elapsed = el('span', { class: 'muted' });
  const wrap = el('div', { class: 'pad', id: 'cd-progress' }, [
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:12px' },
      [label, elapsed]),
    track
  ]);
  return { wrap, fill, label, elapsed };
}

function renderProgress(scaffold, data) {
  const { fill, label, elapsed } = scaffold;
  const total = data.total;
  const done = data.done || 0;
  if (total === null || total === undefined || total <= 0) {
    // total 을 아직 모른다 — 0/0 을 "0%" 로 보여주면 멈춘 것처럼 보이므로 불확정 막대를 움직인다.
    fill.style.background = 'var(--accent)';
    fill.style.width = '22%';
    const tt = Date.now() % 1600;
    const pos = tt < 800 ? (tt / 800) * 78 : ((1600 - tt) / 800) * 78;
    fill.style.marginLeft = pos.toFixed(1) + '%';
    label.textContent = t('cd.progress.starting');
  } else {
    const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
    fill.style.background = 'var(--primary)';
    fill.style.marginLeft = '0';
    fill.style.width = pct + '%';
    const phaseKey = data.phase === 'verify' ? 'cd.progress.phaseVerify'
      : data.phase === 'measure' ? 'cd.progress.phaseMeasure' : '';
    label.textContent = t('cd.progress.status', {
      phase: phaseKey ? t(phaseKey) : '', done, total, label: data.label || ''
    });
  }
  const sec = data.startedAt ? Math.max(0, Math.floor((Date.now() - data.startedAt) / 1000)) : 0;
  elapsed.textContent = t('cd.progress.elapsed', { sec });
}

/** 500ms 마다 진행률 API 를 폴링해 프로그래스바를 갱신한다. 탭 이탈·완료 시 스스로 멈춘다. */
function startProgressPoll(scaffold) {
  stopProgressPoll();
  progressTimer = setInterval(async () => {
    if (!isCandsTabVisible()) { stopProgressPoll(); return; }
    let p;
    try {
      p = await api.tournamentProgress();
    } catch (e) {
      return; // 폴링 실패는 조용히 다음 tick 에 재시도 — 콘솔을 어지럽히지 않는다
    }
    if (!p) return;
    if (p.running === false) {
      if (p.total != null) renderProgress(scaffold, p);
      stopProgressPoll();
      return;
    }
    renderProgress(scaffold, p);
  }, 500);
}

async function runTournament(btn) {
  if (!session.connected) return toast(t('cd.needConnect'), 'warn');
  const sql = state.getSql();
  if (!sql.trim()) return toast(t('cd.needSql'), 'warn');

  const o = opts();
  const chosen = state.generated ? state.generated.candidates : null;
  const n = chosen ? chosen.length : o.maxCandidates;
  const total = (n + 1) * (o.runs + o.warmup) + n + 1;

  if (!confirm(t('cd.runConfirm', { n, runs: o.runs, warmup: o.warmup, total }))) return;

  const candBody = $('#cand-body');
  candBody.innerHTML = '';
  const scaffold = buildProgressScaffold();
  candBody.appendChild(scaffold.wrap);
  candBody.appendChild(el('div', { class: 'pad muted', text: t('cd.progress.hint', { total }) }));
  startProgressPoll(scaffold);

  await withBusy(btn, async () => {
    try {
      const r = await api.tournament({
        sql,
        candidates: chosen || undefined,
        runs: o.runs,
        warmup: o.warmup,
        maxCandidates: o.maxCandidates,
        includeExperimental: o.includeExperimental
      });
      state.result = r;
      renderResult(r);
      const rec = r.ranking.recommendation;
      setBadge(r.ranking.ranked.length, rec.grade);
      $('#cd-summary').innerHTML =
        t('cd.resultSummary', { ok: r.ranking.ranked.length, rejected: r.ranking.rejected.length, failed: r.ranking.failed.length }) +
        t('cd.resultSummaryRuns', { runs: r.settings.runs });
      logMsg(t('cd.doneLog', { headline: rec.headline }), rec.grade === 'worse' ? 'err' : 'ok');
    } catch (e) {
      $('#cand-body').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
      toast(errText(e), 'err', 8000);
      logMsg(t('cd.failLog', { msg: errText(e) }), 'err');
    } finally {
      stopProgressPoll();
    }
  }, t('cd.measuring'));
}

function renderResult(r) {
  const host = $('#cand-body');
  host.innerHTML = '';
  const ranking = r.ranking;
  const rec = ranking.recommendation;
  const gs = GRADE_STYLE[rec.grade] || GRADE_STYLE.none;

  // ── 권고 배너 — 사용자가 제일 먼저 읽어야 할 결론 ──
  const banner = el('div', { class: `verdict ${gs.cls}` }, [
    el('div', { class: 'verdict-icon', text: gs.icon }),
    el('div', { style: 'flex:1' }, [
      el('div', { class: 'verdict-title', text: `${t('grade.' + (rec.grade || 'none'))} — ${rec.headline}` }),
      el('div', { class: 'verdict-desc', style: 'white-space:pre-wrap', text: rec.body }),
      rec.cautions && rec.cautions.length
        ? el('ul', { class: 'caution-list', html: rec.cautions.map((c) => `<li>${safeHtml(c)}</li>`).join('') })
        : null
    ])
  ]);
  if (rec.topId) {
    banner.appendChild(el('button', {
      class: 'btn btn-primary',
      text: t('cd.adoptTop'),
      onclick: () => adopt(rec.topId)
    }));
  }
  host.appendChild(banner);

  // ── 기준(원본) 수치 ──
  const b = ranking.baseline;
  const cards = el('div', { class: 'metric-cards' });
  cards.appendChild(card(t('cd.baseTime'), fmtMs(b.medianMs), t('cd.baseTimeSub', { runs: r.settings.runs })));
  cards.appendChild(card(t('cd.baseReads'),
    b.logicalReads === null ? t('cd.notMeasurable') : fmtBig(b.logicalReads),
    b.logicalReads === null ? t('cd.noMystat') : t('cd.readsSub')));
  cards.appendChild(card(t('cd.baseCost'),
    b.planCost === null ? t('cd.notAvailable') : fmtBig(b.planCost), t('cd.costSub')));
  cards.appendChild(card(t('cd.baseRows'), fmtNum(b.rowCount), t('cd.rowsSub')));
  host.appendChild(cards);

  // 측정 방식을 명시한다 — 사용자가 수치를 믿을 수 있어야 한다
  host.appendChild(el('div', { class: 'measure-note', html: t('cd.measureNote') }));

  // ── 순위 차트 — 원본과 상위 후보들의 응답시간을 한눈에 ──
  if (ranking.ranked.length) {
    const chartHost = el('div', { class: 'chart-host' });
    host.appendChild(el('div', { class: 'chart-label muted', text: t('cd.chartLabel') }));
    host.appendChild(chartHost);
    const top = ranking.ranked.slice(0, 6);
    const rows = [{ label: t('cd.original'), before: b.medianMs, after: b.medianMs }]
      .concat(top.map((x) => ({ label: shortTitle(x.title), before: b.medianMs, after: x.medianMs })));
    setTimeout(() => {
      renderCompareChart(chartHost, {
        title: '', rows, beforeName: t('cd.chartBefore'), afterName: t('cd.chartAfter'), height: 320
      });
    }, 0);
  }

  // ── 순위표 ──
  if (ranking.ranked.length) {
    host.appendChild(el('h3', { class: 'cand-h3', text: t('cd.rankHeading', { n: ranking.ranked.length }) }));
    const gridHost = el('div', { class: 'cand-grid' });
    host.appendChild(gridHost);

    const grid = makeGrid(gridHost, {
      columns: [
        { field: 'rank', header: t('col.rank'), width: 52, align: 'right' },
        { field: 'gradeHtml', header: t('col.grade'), width: 92, renderer: 'html', align: 'center' },
        { field: 'title', header: t('col.tuneItem'), width: 270 },
        { field: 'riskHtml', header: t('col.risk'), width: 96, renderer: 'html', align: 'center' },
        { field: 'verdictHtml', header: t('col.verdictShort'), width: 82, renderer: 'html', align: 'center' },
        { field: 'score', header: t('col.scorePct'), width: 92, align: 'right', type: 'number' },
        { field: 'timeImprovePct', header: t('col.timePct'), width: 92, align: 'right', type: 'number' },
        { field: 'medianMs', header: t('col.medianMs'), width: 96, align: 'right', type: 'number' },
        { field: 'logicalReadImprovePct', header: t('col.readPct'), width: 92, align: 'right', type: 'number' },
        { field: 'logicalReads', header: t('col.logicalReads'), width: 96, align: 'right', type: 'number' },
        { field: 'planCostImprovePct', header: t('col.costPct'), width: 92, align: 'right', type: 'number' },
        { field: 'spreadPct', header: t('col.spreadPct'), width: 72, align: 'right', type: 'number' }
      ],
      rowNumber: false,
      filterable: false,
      masterDetail: {
        enabled: true, height: 340, heightMode: 'auto', expandMultiple: true,
        renderer: (row, hostEl) => {
          const draw = (target) => { target.innerHTML = candDetailHtml(row, ranking.baseline); wireDetailButtons(target, row); };
          draw(hostEl);
          wireDetailExpand(hostEl, row.title, draw);
        }
      }
    });
    grid.setData(ranking.ranked.map((x) => ({
      ...x,
      gradeHtml: gradePill(x.grade),
      riskHtml: riskPill(x.risk),
      verdictHtml: verdictPill(x.verdict)
    })));
  } else {
    host.appendChild(el('div', { class: 'pad muted', text: t('cd.noPassed') }));
  }

  // ── 결과가 다른 후보 ──
  if (ranking.rejected.length) {
    host.appendChild(el('h3', {
      class: 'cand-h3 danger',
      text: t('cd.rejectedHeading', { n: ranking.rejected.length })
    }));
    host.appendChild(el('div', {
      class: 'muted', style: 'margin:-4px 0 6px;font-size:11.5px',
      html: t('cd.rejectedNote')
    }));
    const rh = el('div', { class: 'cand-grid short' });
    host.appendChild(rh);
    const g = makeGrid(rh, {
      columns: [
        { field: 'title', header: t('col.tuneItem'), width: 280 },
        { field: 'riskHtml', header: t('col.risk'), width: 96, renderer: 'html', align: 'center' },
        { field: 'rowCount', header: t('col.rows'), width: 90, align: 'right', type: 'number' },
        { field: 'medianMs', header: t('col.medianMs'), width: 100, align: 'right', type: 'number' },
        { field: 'reason', header: t('col.excludeReason'), width: 420 }
      ],
      rowNumber: false, filterable: false,
      masterDetail: {
        enabled: true, height: 300, heightMode: 'auto',
        renderer: (row, hostEl) => {
          const draw = (target) => { target.innerHTML = candDetailHtml(row, ranking.baseline); wireDetailButtons(target, row); };
          draw(hostEl);
          wireDetailExpand(hostEl, row.title, draw);
        }
      }
    });
    g.setData(ranking.rejected.map((x) => ({ ...x, riskHtml: riskPill(x.risk) })));
  }

  // ── 실행 실패 후보 ──
  if (ranking.failed.length) {
    host.appendChild(el('h3', { class: 'cand-h3', text: t('cd.failedHeading', { n: ranking.failed.length }) }));
    const fh = el('div', { class: 'cand-grid short' });
    host.appendChild(fh);
    renderTable(fh, ranking.failed.map((x) => ({
      title: x.title, ora: x.ora || '', error: x.error || ''
    })), [
      { field: 'title', header: t('col.tuneItem'), width: 280 },
      { field: 'ora', header: 'ORA', width: 100 },
      { field: 'error', header: t('col.errorMsg'), width: 560 }
    ], { rowNumber: false, filterable: false });
    host.appendChild(el('div', {
      class: 'muted', style: 'font-size:11.5px;margin-top:4px',
      text: t('cd.failedNote')
    }));
  }

  if (r.generated && r.generated.skipped && r.generated.skipped.length) {
    host.appendChild(skippedBlock(r.generated.skipped));
  }
}

// ── 상세 패널 ──────────────────────────────────────────────────────────────

/** 후보 상세 패널의 [채택]/[복사] 버튼을 배선한다. 세 곳의 masterDetail 렌더러가 공유한다. */
function wireDetailButtons(hostEl, row) {
  const adoptBtn = hostEl.querySelector('[data-adopt]');
  if (adoptBtn) adoptBtn.addEventListener('click', () => adopt(row.id));
  const copy = hostEl.querySelector('[data-copy]');
  if (copy) {
    copy.addEventListener('click', async () => {
      const ok = await copyToClipboard(row.sql || '');
      toast(ok ? t('common.copied') : t('common.copyFail'), ok ? 'ok' : 'err');
    });
  }
}

function candDetailHtml(c, baseline) {
  const tk = globalThis.SqlTokenizer;
  const hl = (sql) => (tk ? tk.highlight(sql || '') : esc(sql || ''));

  const runsTable = (c.runs && c.runs.length)
    ? `<table class="mini-table">
        <thead><tr><th>${esc(t('cd.runNo'))}</th><th>${esc(t('cd.runSlot'))}</th><th>${esc(t('cd.runTotal'))}</th><th>${esc(t('cd.runExec'))}</th><th>${esc(t('cd.runFetch'))}</th><th>${esc(t('col.rows'))}</th></tr></thead>
        <tbody>${c.runs.map((r) => `<tr>
          <td>${esc(r.run)}</td><td>${esc(r.slot || '')}</td>
          <td class="num">${r.timings ? Number(r.timings.totalMs).toFixed(1) : '-'}</td>
          <td class="num">${r.timings ? Number(r.timings.executeMs).toFixed(1) : '-'}</td>
          <td class="num">${r.timings ? Number(r.timings.fetchMs).toFixed(1) : '-'}</td>
          <td class="num">${esc(r.rowCount === undefined ? '-' : r.rowCount)}</td>
        </tr>`).join('')}</tbody></table>`
    : '';

  const baseRuns = (baseline && baseline.runs && baseline.runs.length)
    ? `<div class="dp-block"><div class="dp-label">${esc(t('cd.baseRuns'))}</div>
        <div class="run-inline">${baseline.runs.map((r) => (r.timings ? Number(r.timings.totalMs).toFixed(1) : '-')).join(' · ')} ms</div></div>`
    : '';

  return `<div class="detail-panel">
    <h4>${esc(c.title)} ${c.grade ? gradePill(c.grade) : ''} ${riskPill(c.risk)}</h4>

    ${c.error ? `<div class="dp-block"><div class="dp-label" style="color:var(--danger)">${esc(t('cd.execError'))}</div>
        <pre>${esc(c.ora ? c.ora + ' ' : '')}${esc(c.error)}</pre></div>` : ''}

    ${c.reason ? `<div class="dp-block"><div class="dp-label">${esc(t('col.grade'))}</div><div>${esc(c.reason)}</div></div>` : ''}

    <div class="dp-block">
      <div class="dp-label">${esc(t('cd.whyTry'))}</div>
      <div>${safeHtml(c.rationale)}</div>
    </div>
    ${c.expectation ? `<div class="dp-block">
      <div class="dp-label">${esc(t('cd.whenEffective'))}</div><div>${safeHtml(c.expectation)}</div></div>` : ''}
    ${c.riskNote ? `<div class="dp-block">
      <div class="dp-label" style="color:var(--warn)">${esc(t('cd.caution'))}</div><div>${safeHtml(c.riskNote)}</div></div>` : ''}
    ${(c.changes && c.changes.length) ? `<div class="dp-block">
      <div class="dp-label">${esc(t('cd.changed'))}</div><ul class="change-list">${c.changes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

    ${c.score !== undefined ? `<div class="dp-block">
      <div class="dp-label">${esc(t('cd.measured'))}</div>
      <div>${t('cd.mScore', { score: esc(c.score), basis: esc(c.scoreBasis || '') })}<br>
      ${esc(t('cd.mTimeLabel'))} ${baseline ? fmtMs(baseline.medianMs) + ' → ' : ''}${fmtMs(c.medianMs)}
      ${c.timeImprovePct !== null && c.timeImprovePct !== undefined ? esc(t('cd.mImprove', { pct: c.timeImprovePct })) : ''}<br>
      ${c.logicalReads !== null && c.logicalReads !== undefined
        ? `${esc(t('cd.mReadsLabel'))} ${baseline && baseline.logicalReads !== null ? fmtBig(baseline.logicalReads) + ' → ' : ''}${fmtBig(c.logicalReads)}
           ${c.logicalReadImprovePct !== null ? esc(t('cd.mImprove', { pct: c.logicalReadImprovePct })) : ''}<br>` : ''}
      ${c.planCost !== null && c.planCost !== undefined
        ? `${esc(t('cd.mCostLabel'))} ${baseline && baseline.planCost !== null ? fmtBig(baseline.planCost) + ' → ' : ''}${fmtBig(c.planCost)}<br>` : ''}
      ${esc(t('cd.mRowsSpread', { rows: fmtNum(c.rowCount), spread: c.spreadPct === null || c.spreadPct === undefined ? '-' : c.spreadPct + '%' }))}
      ${c.unstable ? t('cd.mUnstable') : ''}
      </div></div>` : ''}

    ${runsTable ? `<div class="dp-block"><div class="dp-label">${esc(t('cd.runsDetail'))}</div>${runsTable}</div>` : ''}
    ${baseRuns}

    <div class="dp-block">
      <div class="dp-label">${esc(t('cd.candSql'))}</div>
      <pre class="sql-preview">${hl(c.sql)}</pre>
    </div>

    <div class="dp-block dp-actions">
      <button class="btn btn-sm btn-primary" data-adopt>${esc(t('common.adopt'))}</button>
      <button class="btn btn-sm btn-ghost" data-copy>${esc(t('common.copy'))}</button>
    </div>
  </div>`;
}

// ── 채택 ───────────────────────────────────────────────────────────────────

function adopt(id) {
  const all = []
    .concat(state.result ? state.result.ranking.ranked : [])
    .concat(state.result ? state.result.ranking.rejected : [])
    .concat(state.result ? state.result.ranking.failed : [])
    .concat(state.generated ? state.generated.candidates : []);
  const c = all.find((x) => x.id === id);
  if (!c || !c.sql) return toast(t('cd.adoptFail'), 'err');
  state.onAdopt(c.sql, c);
  toast(t('cd.adopted', { title: c.title }), 'ok');
  logMsg(t('cd.adoptLog', { id: c.id, title: c.title }), 'ok');
}

// ── 표시 조각 ──────────────────────────────────────────────────────────────

function shortTitle(s) {
  const x = String(s || '').split('—')[0].trim();
  return x.length > 18 ? x.slice(0, 18) + '…' : x;
}

function card(label, value, sub) {
  return el('div', { class: 'metric-card' }, [
    el('div', { class: 'metric-label', text: label }),
    el('div', { class: 'metric-value', text: value }),
    sub ? el('div', { class: 'metric-sub', text: sub }) : null
  ]);
}

function riskPill(risk) {
  const cls = { safe: 'sev-low', semantic: 'sev-medium', experimental: 'sev-high' }[risk] || 'sev-low';
  return `<span class="sev-pill ${cls}">${esc(t('risk.' + (risk || 'safe')))}</span>`;
}

function gradePill(grade) {
  const cls = { strong: 'sev-low', good: 'sev-low', moderate: 'sev-medium', marginal: 'sev-info', worse: 'sev-high' }[grade] || 'sev-info';
  return `<span class="sev-pill ${cls}">${esc(t('grade.' + (grade || 'marginal')))}</span>`;
}

function verdictPill(v) {
  const cls = (VERDICT_PILL[v] || VERDICT_PILL.SKIPPED).cls;
  // 사전 키는 'verdict.sameset' 처럼 밑줄이 없다. SAME_SET → sameset 으로 맞춘다.
  const key = 'verdict.' + String(v || 'SKIPPED').toLowerCase().replace(/_/g, '');
  return `<span class="sev-pill ${cls}">${esc(t(key))}</span>`;
}

function skippedBlock(skipped) {
  return el('details', { class: 'skipped-block' }, [
    el('summary', { text: t('cd.skippedHeading', { n: skipped.length }) }),
    el('ul', {
      html: skipped.map((s) => `<li>${esc(s.reason)}${s.detail ? ` <span class="muted">— ${esc(s.detail)}</span>` : ''}</li>`).join('')
    })
  ]);
}

function setBadge(n, grade) {
  const badge = $('#badge-cands');
  badge.textContent = String(n || 0);
  badge.className = 'badge show ' +
    (grade === 'strong' || grade === 'good' ? 'sev-none' : grade === 'pending' ? 'sev-medium' : grade === 'worse' ? '' : 'sev-medium');
}

/** 워크벤치가 원본 SQL 을 바꾸면 이전 결과를 무효화한다. */
export function invalidate() {
  state.generated = null;
  state.result = null;
}
