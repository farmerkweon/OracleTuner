/**
 * Open Grid 래퍼.
 *
 * 그리드를 쓰는 곳마다 옵션을 반복하지 않도록 공통 기본값(테마/스킨/행번호/필터)을 여기서 준다.
 * 또 만든 그리드를 등록해 두었다가 테마 변경 시 한 번에 갈아끼운다.
 */

import { OpenGrid } from '/vendor/open-grid/open-grid.js';
import { esc, safeHtml, fmtBig } from './util.js';
import { t } from './i18n.js';
import { icon } from './icons.js';

const registry = new Set();
let currentTheme = 'default';
let currentSkin = 'rounded';
let currentLocale = 'ko';

/** 공통 옵션을 얹어 그리드를 만든다. 같은 host 에 이미 있으면 정리하고 새로 만든다. */
export function makeGrid(host, options) {
  if (!host) throw new Error('그리드를 붙일 요소가 없습니다.');
  if (host._ogGrid) {
    try { host._ogGrid.destroy(); } catch (e) { /* 이미 정리됨 */ }
    registry.delete(host._ogGrid);
    host._ogGrid = null;
  }
  host.innerHTML = '';

  const grid = new OpenGrid(host, {
    theme: currentTheme,
    skin: currentSkin,
    locale: currentLocale,
    rowNumber: true,
    sortable: true,
    multiSort: true,
    filterable: true,
    resizable: true,
    columnReorder: true,
    clipboard: true,
    tooltips: true,
    autoHeight: false,
    height: '100%',
    ...options
  });
  host._ogGrid = grid;
  registry.add(grid);
  return grid;
}

export function destroyGrid(host) {
  if (host && host._ogGrid) {
    try { host._ogGrid.destroy(); } catch (e) { /* noop */ }
    registry.delete(host._ogGrid);
    host._ogGrid = null;
  }
}

export function setTheme(theme) {
  currentTheme = theme;
  for (const g of registry) {
    try { g.setTheme(theme); } catch (e) { /* noop */ }
  }
  // 앱 전체 톤을 테마에 맞추기 위한 <b>전역 훅</b>.
  //
  // Open Grid 는 data-og-theme 을 <b>자기 그리드 컨테이너에만</b> 붙인다. 그래서 상단바·
  // 레일바·에디터·푸터 같은 앱 껍데기는 테마가 바뀐 사실을 알 방법이 없었고, 어떤 테마를
  // 골라도 흰 바탕 그대로였다(그리드만 색이 바뀌어 "붕뜬다"는 지적의 원인).
  //
  // 여기서 <html> 에 표식을 남겨 app.css 가 :root[data-ot-theme="..."] 로 받아쓸 수 있게 한다.
  // og-* 와 이름을 나누는 이유: 라이브러리 변수와 앱 변수의 소유권을 섞지 않기 위해서다.
  document.documentElement.dataset.otTheme = theme;
}

export function setSkin(skin) {
  currentSkin = skin;
  for (const g of registry) {
    try { g.setSkin(skin); } catch (e) { /* noop */ }
  }
}

/** 모든 그리드의 로케일(필터/정렬 UI 문구)을 바꾼다. 이후 만들어질 그리드도 이 로케일로 생성된다. */
export function setLocale(locale) {
  currentLocale = locale;
  for (const g of registry) {
    try { g.setLocale(locale); } catch (e) { /* 내장 로케일이 없으면 무시 */ }
  }
}

// i18n.js 가 순환 import 없이 로케일을 바꾸도록 전역 훅을 남긴다.
if (typeof globalThis !== 'undefined') {
  globalThis.__otSetGridLocale = setLocale;
}

/** 창 크기 변경 시 모든 그리드를 다시 맞춘다. */
export function resizeAll() {
  for (const g of registry) {
    try { g.resize(); } catch (e) { /* noop */ }
  }
}

// ── 결과 그리드 ────────────────────────────────────────────────────────────

/**
 * 실행 결과(columns/rows 배열 형태)를 그리드가 먹는 형태로 바꿔 붙인다.
 * 서버는 행을 <b>배열</b>로 준다(컬럼명 중복·순서 보존을 위해). 여기서 c1..cN 객체로 변환한다.
 */
export function renderResult(host, result) {
  const cols = (result && result.columns) || [];
  const rows = (result && result.rows) || [];

  if (!cols.length) {
    host.innerHTML = '<div class="pad muted">표시할 결과 집합이 없습니다.</div>';
    return null;
  }

  const columns = cols.map((c, i) => ({
    field: `c${i + 1}`,
    header: c.name,
    width: guessWidth(c),
    align: c.numeric ? 'right' : 'left',
    type: c.numeric ? 'number' : 'text',
    tooltip: `${c.name} (${c.typeName}${c.precision ? `(${c.precision}${c.scale ? ',' + c.scale : ''})` : ''})`,
    cellStyle: c.numeric ? { fontVariantNumeric: 'tabular-nums' } : undefined
  }));

  const data = rows.map((r) => {
    const o = {};
    for (let i = 0; i < cols.length; i++) o[`c${i + 1}`] = Array.isArray(r) ? r[i] : r[cols[i].name];
    return o;
  });

  const grid = makeGrid(host, { columns, pagination: data.length > 2000, pageSize: 1000 });
  grid.setData(data);
  return grid;
}

function guessWidth(col) {
  const name = String(col.name || '');
  const t = String(col.typeName || '').toUpperCase();
  if (t.includes('DATE') || t.includes('TIMESTAMP')) return 160;
  if (col.numeric) return Math.max(90, Math.min(150, name.length * 9 + 30));
  const len = Number(col.precision) || 30;
  return Math.max(90, Math.min(320, Math.max(len * 7, name.length * 9 + 30)));
}

// ── 실행계획 그리드 ────────────────────────────────────────────────────────

/**
 * 실행계획을 그리드로 그린다.
 * 계획은 트리 구조지만, 화면에서는 DBMS_XPLAN 처럼 <b>들여쓴 한 줄</b>로 읽는 편이 익숙하다.
 * 대신 행을 펼치면(masterDetail) 접근/필터 술어와 상세 수치를 보여준다.
 */
export function renderPlan(host, plan) {
  const rows = (plan && plan.rows) || [];
  if (!rows.length) {
    host.innerHTML = `<div class="pad muted">${esc((plan && (plan.error || plan.note)) || '실행계획이 없습니다.')}</div>`;
    return null;
  }

  const columns = [
    { field: 'id', header: 'Id', width: 50, align: 'right' },
    { field: 'opIndented', header: 'Operation', width: 300, tooltip: (v) => String(v || '').trim() },
    { field: 'objFull', header: 'Name', width: 190 },
    { field: 'cardinality', header: 'Rows', width: 90, align: 'right' },
    { field: 'bytes', header: 'Bytes', width: 90, align: 'right' },
    { field: 'cost', header: 'Cost', width: 80, align: 'right' },
    { field: 'time', header: 'Time', width: 80, align: 'right' },
    { field: 'tagText', header: '신호', width: 150 },
    { field: 'optimizer', header: 'Optimizer', width: 110, hidden: true },
    { field: 'partition_start', header: 'Pstart', width: 80, hidden: true },
    { field: 'partition_stop', header: 'Pstop', width: 80, hidden: true }
  ];

  const data = rows.map((r) => ({
    ...r,
    tagText: (r.tags || []).join(' '),
    cardinality: r.cardinality,
    bytes: r.bytes,
    cost: r.cost
  }));

  const grid = makeGrid(host, {
    columns,
    filterable: false,
    rowNumber: false,
    masterDetail: {
      enabled: true,
      height: 170,
      heightMode: 'auto',
      expandMultiple: true,
      renderer: (row, hostEl) => {
        const draw = (target) => { target.innerHTML = planDetailHtml(row); };
        draw(hostEl);
        wireDetailExpand(hostEl, `${row.opFull || ''}${row.objFull ? ' — ' + row.objFull : ''}`, draw);
      }
    }
  });
  grid.setData(data);
  return grid;
}

function planDetailHtml(r) {
  const block = (label, value, mono) => {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="dp-block"><div class="dp-label">${esc(label)}</div>` +
      (mono ? `<pre>${esc(value)}</pre>` : `<div>${esc(value)}</div>`) + '</div>';
  };
  const tags = (r.tags || []).map((t) => `<span class="tag-pill ${riskClass(t)}">${esc(t)}</span>`).join('');
  return `<div class="detail-panel">
    <h4>${esc(r.opFull || '')} ${r.objFull ? '— ' + esc(r.objFull) : ''}</h4>
    ${tags ? `<div class="dp-block">${tags}</div>` : ''}
    ${block('접근 술어 (ACCESS)', r.access_predicates, true)}
    ${block('필터 술어 (FILTER)', r.filter_predicates, true)}
    ${block('프로젝션', r.projection, true)}
    <div class="dp-block">
      <div class="dp-label">추정치</div>
      <div>행 ${fmtBig(r.cardinality)} · 바이트 ${fmtBig(r.bytes)} · 비용 ${fmtBig(r.cost)}
        · CPU ${fmtBig(r.cpu_cost)} · IO ${fmtBig(r.io_cost)} · 임시공간 ${fmtBig(r.temp_space)}</div>
    </div>
    ${block('질의 블록', r.qblock_name)}
    ${block('객체 별칭', r.object_alias)}
    ${block('파티션', r.partition_start ? `${r.partition_start} ~ ${r.partition_stop}` : '')}
    ${block('분산 방식', r.distribution)}
  </div>`;
}

function riskClass(tag) {
  if (['FULL_SCAN', 'CARTESIAN', 'INDEX_FULL_SCAN'].includes(tag)) return 'risk';
  if (['SORT', 'REMOTE', 'INDEX_SKIP_SCAN'].includes(tag)) return 'warn';
  return '';
}

// ── 진단 그리드 ────────────────────────────────────────────────────────────

const sevLabel = (s) => t('sev.' + s);

/** 지적사항 목록. 행을 펼치면 근거와 조치 방법 전문이 나온다. */
export function renderFindings(host, findings, onFix) {
  if (!findings || !findings.length) {
    host.innerHTML = '<div class="pad muted">지적사항이 없습니다. 정적 규칙 기준으로는 문제가 발견되지 않았습니다.</div>';
    return null;
  }
  const columns = [
    // Open Grid 의 html 렌더러는 셀 <b>값</b>을 HTML 로 그린다(포매터 콜백이 아니라).
    // 그래서 표시용 마크업을 미리 만들어 sevHtml 필드에 담아 둔다.
    { field: 'sevHtml', header: t('col.severity'), width: 78, align: 'center', renderer: 'html', sortable: false },
    { field: 'category', header: t('col.category'), width: 90 },
    { field: 'title', header: t('col.finding'), width: 340 },
    { field: 'line', header: t('col.line'), width: 55, align: 'right' },
    { field: 'snippet', header: t('col.location'), width: 300 },
    { field: 'id', header: t('col.ruleId'), width: 190 }
  ];
  const grid = makeGrid(host, {
    columns,
    masterDetail: {
      enabled: true,
      height: 200,
      heightMode: 'auto',
      expandMultiple: true,
      renderer: (row, hostEl) => {
        const draw = (target) => {
          target.innerHTML = findingDetailHtml(row);
          if (row.autoFixable && onFix) {
            const btn = target.querySelector('[data-fix]');
            if (btn) btn.addEventListener('click', () => onFix(row));
          }
        };
        draw(hostEl);
        wireDetailExpand(hostEl, row.title, draw);
      }
    }
  });
  grid.setData(findings.map((f) => ({
    ...f,
    sevHtml: `<span class="sev-pill sev-${esc(f.severity)}">${esc(sevLabel(f.severity))}</span>`
  })));
  return grid;
}

function findingDetailHtml(f) {
  return `<div class="detail-panel">
    <h4><span class="sev-pill sev-${esc(f.severity)}">${sevLabel(f.severity)}</span> ${esc(f.title)}</h4>
    <div class="dp-block">
      <div class="dp-label">왜 문제인가</div>
      <div>${safeHtml(f.detail)}</div>
    </div>
    <div class="dp-block">
      <div class="dp-label">어떻게 고치나</div>
      <div>${safeHtml(f.suggestion)}</div>
    </div>
    ${f.snippet ? `<div class="dp-block"><div class="dp-label">해당 위치${f.line ? ` (${f.line}번째 줄)` : ''}</div><pre>${esc(f.snippet)}</pre></div>` : ''}
    ${f.autoFixable ? '<div class="dp-block"><button class="btn btn-sm btn-primary" data-fix>자동 수정 적용</button></div>' : ''}
    <div class="dp-block"><div class="dp-label">규칙 ID</div><code>${esc(f.id)}</code></div>
  </div>`;
}

// ── 차트 ───────────────────────────────────────────────────────────────────

/**
 * 비교 막대 차트. Open Grid 내장 차트 엔진을 쓴다(외부 차트 라이브러리 없음).
 *
 * <p>차트는 그리드 데이터를 소스로 삼으므로, 화면 밖 그리드에 비교 데이터를 담고
 * 그 그리드의 createChart 로 차트를 만들어 host 에 mount 한다.
 *
 * @param {HTMLElement} host   차트를 그릴 요소
 * @param {object} spec
 * @param {string} spec.title
 * @param {Array<{label:string, before:number, after:number}>} spec.rows
 * @param {string} [spec.beforeName] 계열 이름(기본 '튜닝 전')
 * @param {string} [spec.afterName]  계열 이름(기본 '튜닝 후')
 * @param {number} [spec.height]
 * @returns {object|null} ChartInstance
 */
export function renderCompareChart(host, spec) {
  const rows = (spec.rows || []).filter((r) => r && (isFiniteNum(r.before) || isFiniteNum(r.after)));
  if (!rows.length) {
    host.innerHTML = `<div class="pad muted">${esc(spec.emptyText || '차트로 표시할 수치가 없습니다.')}</div>`;
    return null;
  }
  const beforeName = spec.beforeName || 'before';
  const afterName = spec.afterName || 'after';
  // 범주(막대 그룹) 수에 따라 높이를 넉넉히 잡는다. x축 라벨이 잘리지 않게 최소치를 둔다.
  const height = Math.max(spec.height || 240, 200 + rows.length * 6);

  // 데이터를 담을 화면 밖 그리드(차트의 데이터 소스)
  host.innerHTML = '';
  host.style.height = 'auto';
  const dataHost = document.createElement('div');
  dataHost.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
  const chartMount = document.createElement('div');
  // 실제 폭을 알아내 차트 size 로 넘긴다(mount 폭이 0 으로 잡히는 타이밍 이슈 방지)
  const width = Math.max(host.clientWidth || host.offsetWidth || 600, 320);
  chartMount.style.cssText = `width:100%;height:${height}px;`;
  host.appendChild(dataHost);
  host.appendChild(chartMount);

  const grid = makeGrid(dataHost, {
    columns: [
      { field: 'label', header: '지표' },
      { field: 'before', header: beforeName, type: 'number' },
      { field: 'after', header: afterName, type: 'number' }
    ],
    rowNumber: false, filterable: false, sortable: false, height: 1
  });
  grid.setData(rows.map((r) => ({
    label: r.label,
    before: isFiniteNum(r.before) ? Number(r.before) : 0,
    after: isFiniteNum(r.after) ? Number(r.after) : 0
  })));

  try {
    const chart = grid.createChart({
      source: { kind: 'columns', category: 'label', series: [
        { field: 'before', name: beforeName },
        { field: 'after', name: afterName }
      ] },
      type: 'bar-grouped',
      engine: 'builtin',
      placement: 'inline',
      mount: chartMount,
      title: spec.title || '',
      legend: true,
      tooltip: true,
      palette: ['#94a3b8', '#1976d2'],
      size: { width, height }
    });
    // 레이아웃이 잡힌 뒤 실제 폭으로 다시 맞춘다(초기 mount 폭이 0 이던 경우 보정)
    requestAnimationFrame(() => {
      try {
        const w = Math.max(host.clientWidth || width, 320);
        chart.update({ size: { width: w, height } });
        chart.refresh();
      } catch (e) { /* refresh 실패해도 초기 렌더는 유지 */ }
    });
    return chart;
  } catch (e) {
    chartMount.innerHTML = `<div class="pad muted">차트를 그릴 수 없습니다: ${esc(e.message)}</div>`;
    return null;
  }
}

function isFiniteNum(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

// ── 단순 표 ────────────────────────────────────────────────────────────────

/** 객체 배열을 그대로 표로 그린다(메타데이터 조회 결과 등). */
export function renderTable(host, rows, columnDefs, gridOpts) {
  if (!rows || !rows.length) {
    host.innerHTML = '<div class="pad muted">조회된 자료가 없습니다.</div>';
    return null;
  }
  const columns = columnDefs || Object.keys(rows[0]).map((k) => ({
    field: k,
    header: k.toUpperCase(),
    width: 130,
    align: typeof rows[0][k] === 'number' ? 'right' : 'left'
  }));
  const grid = makeGrid(host, { columns, ...(gridOpts || {}) });
  grid.setData(rows);
  return grid;
}

// ── 서브그리드 상세 확대 팝업 ────────────────────────────────────────────
// masterDetail 패널은 라이브러리 제약으로 높이가 고정된다(heightMode:'auto' 무시됨).
// 내용이 길면 이 팝업으로 크게 다시 그린다. 콘텐츠는 각 호출부의 렌더 함수를 재사용한다.

let _detailModal = null;
let _detailModalLastFocus = null;

function _ensureDetailModal() {
  if (_detailModal) return _detailModal;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <div class="modal modal-xl" role="dialog" aria-modal="true"
         aria-labelledby="grid-detail-modal-title" tabindex="-1">
      <div class="modal-head">
        <h2 id="grid-detail-modal-title"></h2>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-close>✕</button>
      </div>
      <div class="modal-body"></div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('[data-close]').addEventListener('click', closeDetailModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDetailModal(); });
  backdrop.addEventListener('keydown', _onDetailModalKeydown);
  _detailModal = backdrop;
  return backdrop;
}

function _focusableIn(root) {
  return Array.from(root.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter((el) => !el.disabled && el.offsetParent !== null);
}

function _onDetailModalKeydown(e) {
  if (!_detailModal || _detailModal.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDetailModal(); return; }
  if (e.key === 'Tab') {
    const f = _focusableIn(_detailModal);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

/**
 * 서브그리드 상세를 확대 모달로 연다.
 * @param {string} title 모달 제목(상세 패널의 <h4> 와 같은 문자열을 재사용할 것)
 * @param {(bodyEl: HTMLElement) => void} render 모달 본문에 내용을 그리는 콜백.
 *   masterDetail 렌더러가 인라인 패널에 쓰던 것과 같은 렌더 함수를 새 대상 엘리먼트로 다시 부른다.
 */
export function openDetailModal(title, render) {
  const backdrop = _ensureDetailModal();
  backdrop.querySelector('#grid-detail-modal-title').textContent = title || '';
  const body = backdrop.querySelector('.modal-body');
  body.innerHTML = '';
  render(body);
  _detailModalLastFocus = document.activeElement;
  backdrop.hidden = false;
  document.body.classList.add('modal-open');
  const f = _focusableIn(backdrop);
  (f[0] || backdrop.querySelector('.modal')).focus();
}

export function closeDetailModal() {
  if (!_detailModal || _detailModal.hidden) return;
  _detailModal.hidden = true;
  document.body.classList.remove('modal-open');
  if (_detailModalLastFocus && typeof _detailModalLastFocus.focus === 'function') {
    _detailModalLastFocus.focus();
  }
  _detailModalLastFocus = null;
}

/**
 * masterDetail 렌더러 안에서 호출한다. 인라인 패널(hostEl) 안에 확대 버튼을 하나 붙이고,
 * 클릭 시 같은 renderContent 를 새 대상(모달 본문)에 다시 그리게 한다.
 * @param {HTMLElement} hostEl masterDetail 렌더러가 받는 그 hostEl (내용은 이미 채워져 있어야 함)
 * @param {string} title 모달 제목
 * @param {(target: HTMLElement) => void} renderContent hostEl 을 채울 때 쓴 것과 동일한 렌더 로직
 */
export function wireDetailExpand(hostEl, title, renderContent) {
  const panel = hostEl.querySelector(':scope > .detail-panel') || hostEl;
  if (panel.querySelector(':scope > .detail-expand-btn')) return; // 재호출 시 중복 삽입 방지
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-icon btn-ghost detail-expand-btn';
  btn.title = '크게 보기';
  btn.setAttribute('aria-label', '크게 보기');
  let svg = icon('arrows-fullscreen', 14);
  // renderIcon() 은 미등록 role 이어도 빈 <svg></svg> 셸을 돌려줄 수 있어(빈 문자열이 아님) 단순
  // truthy 체크로는 못 거른다 — 실제로 그릴 요소(path/use 등)가 있는지까지 확인해야 폴백이 동작한다.
  if (!svg || !/<(path|use|circle|rect|polygon|polyline|line|ellipse)\b/i.test(svg)) svg = icon('search', 14); // 폴백 — 구현 후 실제 렌더 여부 확인 필수
  btn.innerHTML = `<span class="ic">${svg}</span>`;
  btn.addEventListener('click', () => openDetailModal(title, renderContent));
  panel.prepend(btn);
}
