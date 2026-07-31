/**
 * SQL 목록 (라이브러리) — 랜딩 화면 + 저장 모달.
 *
 * <p>사용자가 며칠에 걸쳐 여러 SQL 을 다루므로, 앱을 열면(그리고 접속하면) <b>목록이 먼저</b> 보이고,
 * 거기서 골라 워크벤치로 열거나 [신규]로 새로 시작하는 흐름이다.
 *
 * <p>목록은 오브젝트 브라우저처럼 <b>좌측 트리(태그=폴더) + 우측 미리보기</b> 2-pane 이다.
 * SQL 은 접속(스키마)에 종속되므로 <b>접속별로 분리</b>되어 보관된다.
 *
 * <p>두 가지 진입:
 * <ul>
 *   <li>SQL 목록 <b>페이지</b>(rail 탭) — 트리에서 찾아 열기/삭제/신규</li>
 *   <li>저장 <b>모달</b> — 편집기 [SQL함] 버튼으로 현재 SQL 을 이름 붙여 저장</li>
 * </ul>
 */

import { $, el, esc, toast, errText, fmtDate, debounce, copyToClipboard, withBusy } from '../util.js';
import { t, getLang } from '../i18n.js';
import { icon } from '../icons.js';
import { api, session } from '../api.js';

let ctx = { getSql: null, setSql: null, setDoc: null, gotoWorkbench: null };

/**
 * 데모 예제에 붙는 폴더(첫 태그) 이름 — <b>로케일별 표기 전부</b>.
 *
 * <p>태그는 표시 문자열이 아니라 저장된 데이터라서 화면에서 번역할 수 없다.
 * 대신 설치할 때 그 시점 언어의 이름으로 심는다(server/demo-install.js 의 DEMO_FOLDER).
 * 여기서는 "어느 언어로 깔렸든 데모 폴더로 알아본다"만 하면 되므로 집합으로 둔다.
 * 예전에 한국어로 깔아 둔 사용자의 '데모' 폴더도 그대로 맨 아래로 간다.
 */
const DEMO_FOLDERS = new Set(['데모', 'Demo', 'デモ', '演示']);

/**
 * 폴더(트리 그룹) 정렬 규칙 — <b>단일 진실의 출처</b>.
 *
 * <p>순서: 이름순 → (태그 없음) → <b>데모</b>(항상 맨 아래).
 * 데모는 학습용 샘플이라 사용자가 만든 폴더보다 항상 뒤에 있어야 눈에 걸리지 않는다.
 * (태그 없음)보다도 더 아래다 — 발주자 요청: "데모 폴더는 항상 제일 아래에 위치".
 *
 * <p>이 규칙은 원래 목록 페이지와 워크벤치 도크 두 곳에 같은 코드로 중복돼 있었다.
 * 한쪽만 고치면 두 화면의 순서가 어긋나므로 함수로 뽑아 양쪽이 함께 쓴다.
 */
function compareFolders(a, b) {
  const rank = (name) => {
    if (DEMO_FOLDERS.has(name)) return 2;           // 항상 맨 아래
    if (name === t('sqls.uncategorized')) return 1; // 그 위
    return 0;                                       // 사용자 폴더
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

/**
 * 폴더 안 항목 정렬.
 *
 * D10(QA-SWEEP): 최종수정일 역순이라 번호를 매긴 예제가 ⑧ → 9) → ② → ③ … 순으로 나와
 * "정렬이 뒤죽박죽" 이라는 보고가 나왔다. 폴더는 이미 이름순인데 항목만 날짜순이어서
 * 목록 전체에 규칙이 없어 보인 것이다. 제목순으로 맞추고, numeric 을 켜서
 * "예제 2" 가 "예제 10" 보다 앞에 오게 한다.
 */
function compareLeaves(a, b) {
  return String(a.title || a.name || '').localeCompare(
    String(b.title || b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
}
let lastSide = 'before';
let selected = null;          // 현재 미리보기 중인 스니펫 이름
let cache = [];               // 마지막으로 불러온 목록

export function initLibrary(opts = {}) {
  ctx.getSql = opts.getSql || (() => '');
  ctx.setSql = opts.setSql || (() => {});
  ctx.setDoc = opts.setDoc || (() => {});
  ctx.resetWorkbench = opts.resetWorkbench || (() => {});
  ctx.gotoWorkbench = opts.gotoWorkbench || (() => {});

  // ── 저장 모달 ──
  $('#modal-library').addEventListener('click', (e) => {
    if (e.target.id === 'modal-library' || e.target.hasAttribute('data-close')) closeModal();
  });
  $('#btn-lib-save').addEventListener('click', saveCurrent);

  // ── 페이지 ──
  $('#btn-sql-new').addEventListener('click', newSql);
  $('#btn-sql-save').addEventListener('click', () => openModal('before'));
  $('#btn-sql-demo').addEventListener('click', () => installDemo($('#btn-sql-demo')));
  $('#btn-demo-setup').addEventListener('click', () => demoSetup($('#btn-demo-setup')));
  $('#sqls-search').addEventListener('input', debounce(() => refreshPage(), 200));
  $('#btn-sql-open').addEventListener('click', () => openSelected('before'));
  $('#btn-sql-open-after').addEventListener('click', () => openSelected('after'));
  $('#btn-sql-del').addEventListener('click', deleteSelected);
  $('#btn-sql-copy').addEventListener('click', copySelected);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      openModal('before');
    }
    if (e.key === 'Escape' && !$('#modal-library').hidden) closeModal();
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  페이지 (랜딩)
// ══════════════════════════════════════════════════════════════════════════

/** 페이지를 새로고침한다. 접속/뷰 전환 시 호출된다. */
export async function refreshPage() {
  updateScopeLabel($('#sqls-scope'));
  const tree = $('#sqls-tree');
  try {
    const r = await api.listSnippets($('#sqls-search').value.trim());
    cache = r.snippets || [];
    $('#sqls-count').textContent = `${cache.length}`;
    renderTree(cache);
    // 선택 유지
    if (selected && !cache.some((s) => s.name === selected)) clearPreview();
  } catch (e) {
    tree.innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
  }
}

function renderTree(items) {
  const host = $('#sqls-tree');
  host.innerHTML = '';
  if (!items.length) {
    host.innerHTML = `<div class="empty-guide sqls-empty">
      <div class="empty-icon">🗂️</div>
      <div class="empty-title">${esc(t('sqls.emptyTitle'))}</div>
      <div class="empty-desc">${esc(t('sqls.emptyDesc'))}</div>
      <div class="empty-actions"><button class="btn btn-primary btn-sm" id="sqls-empty-new">${esc(t('sqls.new'))}</button></div>
    </div>`;
    const b = $('#sqls-empty-new');
    if (b) b.addEventListener('click', newSql);
    clearPreview();
    return;
  }

  // 태그(첫 태그)를 폴더로 묶는다. 태그 없으면 (태그 없음).
  const groups = new Map();
  for (const it of items) {
    const key = (it.tags && it.tags.length) ? it.tags[0] : t('sqls.uncategorized');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  // 폴더 정렬 — compareFolders 참조 (이름순 → (태그 없음) → 데모)
  const folders = [...groups.keys()].sort(compareFolders);

  for (const folder of folders) {
    const rows = groups.get(folder).sort(compareLeaves);
    const collapsed = false;
    const node = el('div', { class: 'tree-folder' });
    const head = el('div', { class: 'tree-folder-head' }, [
      el('span', { class: 'tree-caret', text: '▾' }),
      el('span', { class: 'tree-folder-icon', html: icon('table', 14) }),
      el('span', { class: 'tree-folder-name', text: folder }),
      el('span', { class: 'tree-folder-count', text: String(rows.length) })
    ]);
    const kids = el('div', { class: 'tree-children' });
    head.addEventListener('click', () => {
      const on = node.classList.toggle('is-collapsed');
      head.querySelector('.tree-caret').textContent = on ? '▸' : '▾';
    });
    for (const it of rows) {
      const leaf = el('div', {
        class: `tree-leaf ${it.name === selected ? 'is-sel' : ''}`,
        title: it.preview
      }, [
        el('span', { class: 'tree-leaf-icon', html: icon('formula', 13) }),
        el('span', { class: 'tree-leaf-name', text: it.title }),
        it.shared ? el('span', { class: 'tree-leaf-shared', text: t('sqls.shared'), title: t('sqls.sharedTip') }) : null,
        it.tuningCount ? el('span', { class: 'tree-leaf-badge', text: `↻${it.tuningCount}`, title: `${t('sqls.tuningHistory')} ${it.tuningCount}` }) : null,
        el('span', { class: 'tree-leaf-date', text: fmtDate(it.updatedAt).slice(5) })
      ]);
      leaf.addEventListener('click', () => selectItem(it.name));
      leaf.addEventListener('dblclick', () => { selected = it.name; openSelected('before'); });
      kids.appendChild(leaf);
    }
    node.appendChild(head);
    node.appendChild(kids);
    host.appendChild(node);
  }
}

async function selectItem(name) {
  selected = name;
  for (const l of document.querySelectorAll('#sqls-tree .tree-leaf')) l.classList.remove('is-sel');
  // 다시 그리지 않고 선택 표시만 갱신하기 위해 트리에서 해당 leaf 를 찾는다
  renderTree(cache);
  const tk = globalThis.SqlTokenizer;
  const host = $('#sqls-preview');
  host.innerHTML = '<div class="pad muted">…</div>';
  setActions(true);
  try {
    const s = await api.getSnippet(name);
    const hl = tk ? tk.highlight(s.sql || '') : esc(s.sql || '');
    const tags = (s.tags || []).map((tg) => `<span class="tag-pill">${esc(tg)}</span>`).join('');
    $('#sqls-detail-title').innerHTML = `<b>${esc(s.title)}</b> ${tags}`;
    host.innerHTML = `
      ${s.desc ? `<div class="sqls-preview-desc">${esc(s.desc)}</div>` : ''}
      <div class="sqls-preview-meta">${esc(t('lib.updated'))}: ${esc(fmtDate(s.updatedAt))} · ${String(s.sql || '').split('\n').length}</div>
      <pre class="sqls-preview-code">${hl}</pre>
      <div class="sqls-history" id="sqls-history"><div class="muted" style="font-size:11.5px">…</div></div>`;
    selected = name;
    renderTuningHistory(name);
  } catch (e) {
    host.innerHTML = `<div class="pad" style="color:var(--danger)">${esc(errText(e))}</div>`;
    setActions(false);
  }
}

/** 선택한 SQL 의 튜닝 이력을 미리보기 아래에 표시한다(그 SQL 의 이력이므로). */
async function renderTuningHistory(name) {
  const host = $('#sqls-history');
  if (!host) return;
  try {
    const r = await api.listTunings({ sqlName: name });
    const items = r.items || [];
    let rows = '';
    for (const it of items) {
      const imp = (it.improvementPct === null || it.improvementPct === undefined) ? '' :
        `<span class="${it.improvementPct > 0 ? 'delta-good' : 'delta-bad'}">${it.improvementPct > 0 ? '▼' : '▲'}${Math.abs(it.improvementPct).toFixed(1)}%</span>`;
      rows += `<div class="hist-row" data-tid="${esc(it.id)}">
        <span class="hist-row-title">${esc(it.title)}</span>
        <span class="tag-pill">${esc(statusLabel(it.status))}</span>
        <span class="hist-row-imp">${imp}</span>
        <span class="hist-row-date">${esc(fmtDate(it.updatedAt).slice(5))}</span>
        <button class="btn btn-sm btn-ghost hist-open" data-tid="${esc(it.id)}">${esc(t('sqls.openTuning'))}</button>
      </div>`;
    }
    host.innerHTML = `
      <div class="sqls-history-head">${esc(t('sqls.tuningHistory'))} <span class="tree-folder-count">${items.length}</span></div>
      ${items.length ? rows : `<div class="muted" style="font-size:11.5px;padding:6px 2px">${esc(t('sqls.noTuning'))}</div>`}`;
    for (const b of host.querySelectorAll('.hist-open')) {
      b.addEventListener('click', () => loadTuning(b.getAttribute('data-tid')));
    }
  } catch (e) {
    host.innerHTML = `<div class="muted" style="font-size:11.5px">${esc(errText(e))}</div>`;
  }
}

async function loadTuning(id) {
  try {
    const rec = await api.getTuning(id);
    ctx.setSql('before', (rec.before && rec.before.sql) || '');
    ctx.setSql('after', (rec.after && rec.after.sql) || '');
    ctx.setDoc('before', rec.sqlRef ? { name: rec.sqlRef.name, title: rec.sqlRef.title } : null);
    ctx.gotoWorkbench();
    toast(`${t('lib.loaded')}: ${rec.title || id}`, 'ok');
  } catch (e) {
    toast(errText(e), 'err');
  }
}

function statusLabel(s) {
  return { draft: t('st.draft'), verified: t('st.verified'), applied: t('st.applied'), rejected: t('st.rejected') }[s] || s;
}

function clearPreview() {
  selected = null;
  setActions(false);
  $('#sqls-detail-title').textContent = t('sqls.selectHint');
  $('#sqls-preview').innerHTML = `<div class="pad muted">${esc(t('sqls.selectHint'))}</div>`;
}

function setActions(on) {
  for (const id of ['btn-sql-open', 'btn-sql-open-after', 'btn-sql-del', 'btn-sql-copy']) $('#' + id).disabled = !on;
}

async function openSelected(side) {
  if (!selected) return;
  try {
    const s = await api.getSnippet(selected);
    ctx.setSql(side, s.sql || '');
    // 워크벤치에 "지금 이 SQL 을 열었다"를 표시하고, 이후 튜닝 저장이 이 SQL 에 연결되게 한다
    ctx.setDoc(side, { name: s.name, title: s.title });
    ctx.gotoWorkbench();
    toast(`${t('lib.loaded')} (${side === 'before' ? t('wb.beforeTitle') : t('wb.afterTitle')})`, 'ok');
  } catch (e) {
    toast(errText(e), 'err');
  }
}

async function copySelected() {
  if (!selected) return;
  try {
    const s = await api.getSnippet(selected);
    const ok = await copyToClipboard(s.sql || '');
    toast(ok ? t('common.copied') : t('common.copyFail'), ok ? 'ok' : 'err');
  } catch (e) {
    toast(errText(e), 'err');
  }
}

async function deleteSelected() {
  if (!selected) return;
  const it = cache.find((x) => x.name === selected);
  if (!confirm(t('lib.deleteConfirm', { name: (it && it.title) || selected }))) return;
  try {
    await api.removeSnippet(selected);
    toast(t('lib.delete'), 'ok');
    clearPreview();
    refreshPage();
    document.dispatchEvent(new CustomEvent('ot:snippets-changed'));
  } catch (e) {
    toast(errText(e), 'err');
  }
}

/** [샘플 예제] — 튜닝 효과를 확인할 수 있는 예제 SQL 세트를 현재 접속 목록에 넣는다. */
async function installDemo(btn) {
  if (!confirm(t('sqls.demoConfirm'))) return;
  await withBusy(btn, async () => {
    try {
      // 화면 언어로 설치한다 — 이름·설명이 그 언어로 저장된다(server/demo-install.js localize).
      const r = await api.installDemo(getLang());
      toast(t('sqls.demoInstalled', { n: r.installed, folder: t('sqls.demoFolder') }), 'ok', 6000);
      refreshPage();
      document.dispatchEvent(new CustomEvent('ot:snippets-changed'));
    } catch (e) {
      toast(errText(e), 'err');
    }
  }, '…');
}

/**
 * [데모 데이터 생성] — 표·30만 건·인덱스·통계를 서버가 한 번에 만든다.
 * 사용자가 SQL 을 한 문장씩 실행할 필요도, 안전모드를 끌 필요도 없다.
 */
async function demoSetup(btn) {
  if (!session.connected) { toast(t('common.needConnect'), 'warn'); return; }
  if (!confirm(t('sqls.demoSetupConfirm'))) return;
  toast(t('sqls.demoSetupRunning'), '', 8000);
  await withBusy(btn, async () => {
    try {
      const r = await api.demoSetup();
      if (!r.ok) {
        toast(`${r.message || 'failed'}`, 'err', 10000);
        return;
      }
      toast(t('sqls.demoSetupDone', { n: Number(r.rowCount || 0).toLocaleString() }), 'ok', 9000);
    } catch (e) {
      toast(errText(e), 'err', 10000);
    }
  }, '…');
}

let pendingClearAfterSave = false;

/**
 * [신규 SQL] — 작성 중인 SQL 이 있으면 저장할지 물어보고, 저장 후(또는 버린 뒤) 워크벤치를 초기화한다.
 * 신규이므로 연결된 튜닝 이력도 없다(문서 배지 = 신규).
 */
function newSql() {
  const cur = ctx.getSql('before');
  if (cur && cur.trim()) {
    // 확인: [확인]=저장하고 새로, [취소]=저장 없이 새로
    if (confirm(t('wb.confirmSaveNew'))) {
      pendingClearAfterSave = true;
      openModal('before'); // 저장 후 saveCurrent 가 초기화까지 이어서 처리
      return;
    }
  }
  ctx.resetWorkbench();
  ctx.gotoWorkbench();
}

// ══════════════════════════════════════════════════════════════════════════
//  워크벤치 도크 (좌측 접이식 SQL 목록)
// ══════════════════════════════════════════════════════════════════════════

/** 워크벤치 좌측 도크에 SQL 트리를 렌더한다. leaf 클릭 → 워크벤치를 벗어나지 않고 튜닝 전에 로드. */
export async function renderDock(hostEl) {
  if (!hostEl) return;
  try {
    const r = await api.listSnippets('');
    const items = r.snippets || [];
    hostEl.innerHTML = '';
    if (!items.length) {
      hostEl.innerHTML = `<div class="wb-dock-empty muted">${esc(t('sqls.emptyTitle'))}</div>`;
      return;
    }
    const groups = new Map();
    for (const it of items) {
      const key = (it.tags && it.tags.length) ? it.tags[0] : t('sqls.uncategorized');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const folders = [...groups.keys()].sort(compareFolders);
    for (const folder of folders) {
      const rows = groups.get(folder).sort(compareLeaves);
      const node = el('div', { class: 'tree-folder' });
      const head = el('div', { class: 'tree-folder-head' }, [
        el('span', { class: 'tree-caret', text: '▾' }),
        el('span', { class: 'tree-folder-icon', html: icon('table', 13) }),
        el('span', { class: 'tree-folder-name', text: folder }),
        el('span', { class: 'tree-folder-count', text: String(rows.length) })
      ]);
      head.addEventListener('click', () => {
        const on = node.classList.toggle('is-collapsed');
        head.querySelector('.tree-caret').textContent = on ? '▸' : '▾';
      });
      const kids = el('div', { class: 'tree-children' });
      for (const it of rows) {
        const leaf = el('div', { class: 'tree-leaf', title: `${it.preview}\n${t('lib.leafTip')}` }, [
          el('span', { class: 'tree-leaf-icon', html: icon('formula', 12) }),
          el('span', { class: 'tree-leaf-name', text: it.title }),
          it.tuningCount ? el('span', { class: 'tree-leaf-badge', text: `↻${it.tuningCount}` }) : null
        ]);
        leaf.addEventListener('dblclick', () => dockOpen(it.name));
        leaf.addEventListener('click', () => { /* 단일클릭은 강조만 */
          for (const l of hostEl.querySelectorAll('.tree-leaf')) l.classList.remove('is-sel');
          leaf.classList.add('is-sel');
        });
        kids.appendChild(leaf);
      }
      node.appendChild(head);
      node.appendChild(kids);
      hostEl.appendChild(node);
    }
  } catch (e) {
    hostEl.innerHTML = `<div class="wb-dock-empty" style="color:var(--danger)">${esc(errText(e))}</div>`;
  }
}

async function dockOpen(name) {
  try {
    const s = await api.getSnippet(name);
    ctx.setSql('before', s.sql || '');
    ctx.setDoc('before', { name: s.name, title: s.title });
    toast(`${t('lib.loaded')}: ${s.title}`, 'ok');
  } catch (e) {
    toast(errText(e), 'err');
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  저장 모달 (편집기 [SQL함] 버튼)
// ══════════════════════════════════════════════════════════════════════════

/** @param {'before'|'after'} side 어느 편집기의 SQL 을 저장할지 */
export function openModal(side) {
  lastSide = side || 'before';
  const sql = ctx.getSql(lastSide);
  if (!sql.trim()) { toast(t('lib.needSql'), 'warn'); return; }
  $('#modal-library').hidden = false;
  $('#lib-name').value = '';
  $('#lib-tags').value = '';
  $('#lib-desc').value = '';
  // 폴더 = 첫 번째 태그. 기존 폴더 목록을 제시하고 새 이름도 입력할 수 있게 한다.
  // 저장 모달의 폴더 자동완성도 트리와 같은 순서로 보여준다(데모는 맨 아래).
  const folders = [...new Set(cache.map((s) => (s.tags && s.tags[0]) || '').filter(Boolean))].sort(compareFolders);
  const dl = $('#lib-folder-list');
  dl.innerHTML = folders.map((f) => `<option value="${esc(f)}"></option>`).join('');
  $('#lib-folder').value = '';
  updateScopeLabel($('#lib-scope'));
  const tk = globalThis.SqlTokenizer;
  $('#lib-sql-preview').innerHTML = tk ? tk.highlight(sql) : esc(sql);
  const n = sql.split('\n').length;
  $('#lib-save-preview').textContent =
    `${lastSide === 'before' ? t('wb.beforeTitle') : t('wb.afterTitle')} · ${n}`;
  $('#lib-name').focus();
}

// 편집기 툴바가 부르는 이름(open) 유지
export const open = openModal;

function closeModal() {
  $('#modal-library').hidden = true;
}

async function saveCurrent() {
  const name = $('#lib-name').value.trim();
  const sql = ctx.getSql(lastSide);
  if (!name) { toast(t('lib.needName'), 'warn'); $('#lib-name').focus(); return; }
  if (!sql.trim()) { toast(t('lib.needSql'), 'warn'); return; }
  try {
    // 폴더를 첫 번째 태그로 넣는다(트리는 첫 태그로 폴더를 만든다)
    const folder = $('#lib-folder').value.trim();
    const extra = $('#lib-tags').value.split(',').map((s) => s.trim()).filter(Boolean);
    const tags = folder ? [folder].concat(extra.filter((x) => x !== folder)) : extra;
    await api.saveSnippet({ name, tags, desc: $('#lib-desc').value.trim(), sql });
    toast(t('lib.saved'), 'ok');
    closeModal();
    refreshPage(); // 목록에 즉시 반영
    document.dispatchEvent(new CustomEvent('ot:snippets-changed'));
    // 신규 SQL 흐름에서 "저장하고 새로" 를 택한 경우: 저장 뒤 워크벤치 초기화
    if (pendingClearAfterSave) {
      pendingClearAfterSave = false;
      ctx.resetWorkbench();
      ctx.gotoWorkbench();
    }
  } catch (e) {
    toast(errText(e), 'err');
  }
}

// ── 공통 ───────────────────────────────────────────────────────────────────

function updateScopeLabel(node) {
  if (!node) return;
  const m = session.meta;
  if (session.connected && m) {
    const server = m.server || {};
    const name = m.connectionName || `${server.currentSchema || server.user || ''}`;
    node.innerHTML = `<span class="lib-scope-conn">${esc(name)}</span> <span class="muted">· ${esc(t('lib.scopeNote'))}</span>`;
  } else {
    node.innerHTML = `<span class="lib-scope-shared">${esc(t('lib.scopeShared'))}</span> <span class="muted">· ${esc(t('lib.scopeNote'))}</span>`;
  }
}
