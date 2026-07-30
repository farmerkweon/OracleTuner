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

const GRADE_STYLE = {
  strong: { cls: 'v-identical', icon: '★', label: '강력 권고' },
  good: { cls: 'v-identical', icon: '✔', label: '권고' },
  moderate: { cls: 'v-sameset', icon: '△', label: '검토 권고' },
  marginal: { cls: 'v-skip', icon: '–', label: '차이 미미' },
  worse: { cls: 'v-different', icon: '✕', label: '역효과' },
  none: { cls: 'v-skip', icon: '–', label: '후보 없음' }
};

const VERDICT_PILL = {
  IDENTICAL: { cls: 'sev-low', text: '동일' },
  SAME_SET: { cls: 'sev-medium', text: '순서다름' },
  DIFFERENT: { cls: 'sev-high', text: '결과다름' },
  INCONCLUSIVE: { cls: 'sev-info', text: '확인불가' },
  SKIPPED: { cls: 'sev-info', text: '미검증' }
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
  if (!sql.trim()) return toast('원본 SQL 이 비어 있습니다.', 'warn');

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
        `후보 <b>${r.candidates.length}</b>개 생성` +
        (r.total > r.candidates.length ? ` <span class="muted">(전체 ${r.total}개 중)</span>` : '') +
        (r.meta && r.meta.usedDb ? ' · DB 정보 반영' : ' · <span class="muted">문장만 보고 생성(미접속)</span>');
      logMsg(`튜닝 후보 ${r.candidates.length}개 생성`);
      if (!session.connected) {
        toast('접속하면 인덱스·컬럼타입을 참고해 더 정확한 후보를 만들고, 실제로 재볼 수 있습니다.', 'warn', 6000);
      }
    } catch (e) {
      $('#cand-body').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
      toast(errText(e), 'err');
    }
  }, '생성 중…');
}

function renderGenerated(r) {
  const host = $('#cand-body');
  host.innerHTML = '';

  if (!r.candidates.length) {
    host.innerHTML = '<div class="pad muted">이 SQL 에서 자동으로 만들 수 있는 튜닝안을 찾지 못했습니다. ' +
      '[진단] 탭의 지적사항을 참고해 직접 수정해 보세요.</div>';
    return;
  }

  host.appendChild(el('div', {
    class: 'verdict v-skip',
    html: `<div class="verdict-icon">•</div><div>
      <div class="verdict-title">후보 ${r.candidates.length}개를 만들었습니다 — 아직 실행하지 않았습니다</div>
      <div class="verdict-desc">[토너먼트 실행] 을 누르면 원본과 번갈아 실행해 실제 성능과 결과 동일성을 재고 순위를 매깁니다.
        예상 실행 횟수: 약 ${(r.candidates.length + 1) * (Number($('#cd-runs').value) || 3)}회</div>
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

async function runTournament(btn) {
  if (!session.connected) return toast('토너먼트는 실제 실행이 필요합니다. 먼저 DB 에 접속하세요.', 'warn');
  const sql = state.getSql();
  if (!sql.trim()) return toast('원본 SQL 이 비어 있습니다.', 'warn');

  const o = opts();
  const chosen = state.generated ? state.generated.candidates : null;
  const n = chosen ? chosen.length : o.maxCandidates;
  const total = (n + 1) * (o.runs + o.warmup) + n + 1;

  if (!confirm(
    `원본과 후보 ${n}개를 ${o.runs}회전(워밍업 ${o.warmup}회) 번갈아 실행합니다.\n` +
    `총 실행 횟수는 약 ${total}회입니다.\n\n` +
    '조회(SELECT)가 아니면 데이터가 바뀔 수 있으니 주의하세요. 진행할까요?')) return;

  $('#cand-body').innerHTML =
    `<div class="pad muted">원본과 후보 ${n}개를 번갈아 실행하며 측정하고 있습니다… ` +
    `(약 ${total}회 실행)<br>완료될 때까지 이 탭을 벗어나도 됩니다.</div>`;

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
        `유효 <b>${r.ranking.ranked.length}</b> · 결과불일치 ${r.ranking.rejected.length} · 실행실패 ${r.ranking.failed.length}` +
        ` · ${r.settings.runs}회전`;
      logMsg(`토너먼트 완료 — ${rec.headline}`, rec.grade === 'worse' ? 'err' : 'ok');
    } catch (e) {
      $('#cand-body').innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
      toast(errText(e), 'err', 8000);
      logMsg(`토너먼트 실패: ${errText(e)}`, 'err');
    }
  }, '측정 중…');
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
      el('div', { class: 'verdict-title', text: `${gs.label} — ${rec.headline}` }),
      el('div', { class: 'verdict-desc', style: 'white-space:pre-wrap', text: rec.body }),
      rec.cautions && rec.cautions.length
        ? el('ul', { class: 'caution-list', html: rec.cautions.map((c) => `<li>${safeHtml(c)}</li>`).join('') })
        : null
    ])
  ]);
  if (rec.topId) {
    banner.appendChild(el('button', {
      class: 'btn btn-primary',
      text: '1순위 채택',
      onclick: () => adopt(rec.topId)
    }));
  }
  host.appendChild(banner);

  // ── 기준(원본) 수치 ──
  const b = ranking.baseline;
  const cards = el('div', { class: 'metric-cards' });
  cards.appendChild(card('원본 응답시간 (중앙값)', fmtMs(b.medianMs), `${r.settings.runs}회전 측정`));
  cards.appendChild(card('원본 논리적 읽기',
    b.logicalReads === null ? '측정 불가' : fmtBig(b.logicalReads),
    b.logicalReads === null ? 'V$MYSTAT 권한 없음' : '읽은 블록 수 — 부하의 실제 척도'));
  cards.appendChild(card('원본 옵티마이저 비용',
    b.planCost === null ? '조회 불가' : fmtBig(b.planCost), '추정치(실측 아님)'));
  cards.appendChild(card('원본 결과 행수', fmtNum(b.rowCount), '이 행수를 기준으로 동일성을 판정'));
  host.appendChild(cards);

  // 측정 방식을 명시한다 — 사용자가 수치를 믿을 수 있어야 한다
  host.appendChild(el('div', { class: 'measure-note', html: t('cd.measureNote') }));

  // ── 순위 차트 — 원본과 상위 후보들의 응답시간을 한눈에 ──
  if (ranking.ranked.length) {
    const chartHost = el('div', { class: 'chart-host' });
    host.appendChild(el('div', { class: 'chart-label muted', text: '응답시간 비교 (ms, 낮을수록 좋음) — 원본 vs 상위 후보' }));
    host.appendChild(chartHost);
    const top = ranking.ranked.slice(0, 6);
    const rows = [{ label: '원본', before: b.medianMs, after: b.medianMs }]
      .concat(top.map((x) => ({ label: shortTitle(x.title), before: b.medianMs, after: x.medianMs })));
    setTimeout(() => {
      renderCompareChart(chartHost, {
        title: '', rows, beforeName: '원본 기준', afterName: '각 안', height: 320
      });
    }, 0);
  }

  // ── 순위표 ──
  if (ranking.ranked.length) {
    host.appendChild(el('h3', { class: 'cand-h3', text: `순위 (결과 동일성 통과 ${ranking.ranked.length}건)` }));
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
    host.appendChild(el('div', { class: 'pad muted', text: '결과 동일성을 통과한 후보가 없습니다.' }));
  }

  // ── 결과가 다른 후보 ──
  if (ranking.rejected.length) {
    host.appendChild(el('h3', {
      class: 'cand-h3 danger',
      text: `결과가 달라 제외된 후보 (${ranking.rejected.length}건)`
    }));
    host.appendChild(el('div', {
      class: 'muted', style: 'margin:-4px 0 6px;font-size:11.5px',
      html: '이 후보들은 <b>빠를 수는 있어도 결과가 다릅니다</b>. 업무 의미를 확인하기 전에는 적용하면 안 됩니다. ' +
        '다만 원본 쪽이 틀렸을 가능성도 있으니(예: ROWNUM + ORDER BY) 어느 쪽이 옳은지 판단해 보세요.'
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
    host.appendChild(el('h3', { class: 'cand-h3', text: `실행하지 못한 후보 (${ranking.failed.length}건)` }));
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
      text: '자동 생성한 변환이 이 SQL 구조에는 맞지 않았다는 뜻입니다. 다른 후보의 결과에는 영향이 없습니다.'
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
        <thead><tr><th>회차</th><th>순번</th><th>합계(ms)</th><th>실행(ms)</th><th>인출(ms)</th><th>행수</th></tr></thead>
        <tbody>${c.runs.map((r) => `<tr>
          <td>${esc(r.run)}</td><td>${esc(r.slot || '')}</td>
          <td class="num">${r.timings ? Number(r.timings.totalMs).toFixed(1) : '-'}</td>
          <td class="num">${r.timings ? Number(r.timings.executeMs).toFixed(1) : '-'}</td>
          <td class="num">${r.timings ? Number(r.timings.fetchMs).toFixed(1) : '-'}</td>
          <td class="num">${esc(r.rowCount === undefined ? '-' : r.rowCount)}</td>
        </tr>`).join('')}</tbody></table>`
    : '';

  const baseRuns = (baseline && baseline.runs && baseline.runs.length)
    ? `<div class="dp-block"><div class="dp-label">원본 회차별 (비교용)</div>
        <div class="run-inline">${baseline.runs.map((r) => (r.timings ? Number(r.timings.totalMs).toFixed(1) : '-')).join(' · ')} ms</div></div>`
    : '';

  return `<div class="detail-panel">
    <h4>${esc(c.title)} ${c.grade ? gradePill(c.grade) : ''} ${riskPill(c.risk)}</h4>

    ${c.error ? `<div class="dp-block"><div class="dp-label" style="color:var(--danger)">실행 오류</div>
        <pre>${esc(c.ora ? c.ora + ' ' : '')}${esc(c.error)}</pre></div>` : ''}

    ${c.reason ? `<div class="dp-block"><div class="dp-label">판정</div><div>${esc(c.reason)}</div></div>` : ''}

    <div class="dp-block">
      <div class="dp-label">왜 이걸 시도하나</div>
      <div>${safeHtml(c.rationale)}</div>
    </div>
    ${c.expectation ? `<div class="dp-block">
      <div class="dp-label">언제 효과가 있나</div><div>${safeHtml(c.expectation)}</div></div>` : ''}
    ${c.riskNote ? `<div class="dp-block">
      <div class="dp-label" style="color:var(--warn)">주의</div><div>${safeHtml(c.riskNote)}</div></div>` : ''}
    ${(c.changes && c.changes.length) ? `<div class="dp-block">
      <div class="dp-label">바뀐 내용</div><ul class="change-list">${c.changes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

    ${c.score !== undefined ? `<div class="dp-block">
      <div class="dp-label">측정 결과</div>
      <div>종합 개선 <b>${esc(c.score)}%</b> <span class="muted">(${esc(c.scoreBasis || '')})</span><br>
      응답시간 중앙값 ${baseline ? fmtMs(baseline.medianMs) + ' → ' : ''}${fmtMs(c.medianMs)}
      ${c.timeImprovePct !== null && c.timeImprovePct !== undefined ? `(${esc(c.timeImprovePct)}% 개선)` : ''}<br>
      ${c.logicalReads !== null && c.logicalReads !== undefined
        ? `논리적 읽기 ${baseline && baseline.logicalReads !== null ? fmtBig(baseline.logicalReads) + ' → ' : ''}${fmtBig(c.logicalReads)}
           ${c.logicalReadImprovePct !== null ? `(${esc(c.logicalReadImprovePct)}% 개선)` : ''}<br>` : ''}
      ${c.planCost !== null && c.planCost !== undefined
        ? `옵티마이저 비용 ${baseline && baseline.planCost !== null ? fmtBig(baseline.planCost) + ' → ' : ''}${fmtBig(c.planCost)}<br>` : ''}
      결과 행수 ${fmtNum(c.rowCount)} · 회차 편차 ${c.spreadPct === null || c.spreadPct === undefined ? '-' : c.spreadPct + '%'}
      ${c.unstable ? ' <span style="color:var(--warn)">(편차가 커서 감점됨)</span>' : ''}
      </div></div>` : ''}

    ${runsTable ? `<div class="dp-block"><div class="dp-label">회차별 실측</div>${runsTable}</div>` : ''}
    ${baseRuns}

    <div class="dp-block">
      <div class="dp-label">이 후보의 SQL</div>
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
  if (!c || !c.sql) return toast('채택할 SQL 을 찾지 못했습니다.', 'err');
  state.onAdopt(c.sql, c);
  toast(`"${c.title}" 을(를) 튜닝 후 편집기에 넣었습니다.`, 'ok');
  logMsg(`후보 채택: ${c.id} — ${c.title}`, 'ok');
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
  return `<span class="sev-pill ${cls}">${esc(t('verdict.' + String(v || 'SKIPPED').toLowerCase()))}</span>`;
}

function skippedBlock(skipped) {
  return el('details', { class: 'skipped-block' }, [
    el('summary', { text: `생성 단계에서 제외된 항목 (${skipped.length}건)` }),
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
