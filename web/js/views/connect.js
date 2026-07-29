/**
 * 접속 모달 — 프로필 목록/편집/시험/접속.
 *
 * 비밀번호는 서버에만 저장되고(로컬 암호화) 목록 응답에는 포함되지 않는다.
 * 화면은 "저장되어 있음" 여부만 알 수 있다.
 */

import { $, $$, el, esc, toast, errText, withBusy, logMsg } from '../util.js';
import { api, session } from '../api.js';

let connections = [];
let selectedId = null;
let onConnected = null;

export function initConnect(opts = {}) {
  onConnected = opts.onConnected || (() => {});

  $('#btn-connect').addEventListener('click', () => {
    if (session.connected) doDisconnect();
    else open();
  });

  $('#modal-connect').addEventListener('click', (e) => {
    if (e.target.id === 'modal-connect' || e.target.hasAttribute('data-close')) close();
  });

  $('#btn-new-conn').addEventListener('click', () => {
    selectedId = null;
    fillForm({});
    renderList();
    $('#cf-name').focus();
  });

  $('#btn-save-conn').addEventListener('click', saveProfile);
  $('#btn-del-conn').addEventListener('click', removeProfile);
  $('#btn-test-conn').addEventListener('click', testProfile);
  $('#btn-do-connect').addEventListener('click', doConnect);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      open();
    }
    if (e.key === 'Escape' && !$('#modal-connect').hidden) close();
  });
}

export async function open() {
  $('#modal-connect').hidden = false;
  await refreshList();
}

export function close() {
  $('#modal-connect').hidden = true;
}

async function refreshList() {
  try {
    const r = await api.listConnections();
    connections = r.connections || [];
  } catch (e) {
    connections = [];
    msg(errText(e), 'err');
  }
  if (!selectedId && connections.length) selectedId = connections[0].id;
  renderList();
  const sel = connections.find((c) => c.id === selectedId);
  fillForm(sel || {});
}

function renderList() {
  const ul = $('#conn-list');
  ul.innerHTML = '';
  if (!connections.length) {
    ul.appendChild(el('li', { class: 'muted', text: '저장된 접속이 없습니다. [+ 새로] 로 만드세요.' }));
    return;
  }
  for (const c of connections) {
    const li = el('li', { class: c.id === selectedId ? 'is-sel' : '' }, [
      el('div', { class: 'conn-name' }, [
        document.createTextNode(c.name),
        c.production ? el('span', { class: 'prod-mark', text: '운영' }) : null,
        c.hasSavedPassword ? el('span', { class: 'tag-pill', text: 'PW' }) : null
      ]),
      el('div', { class: 'conn-desc', text: `${c.user || '-'} @ ${c.url}` })
    ]);
    li.addEventListener('click', () => {
      selectedId = c.id;
      renderList();
      fillForm(c);
    });
    li.addEventListener('dblclick', doConnect);
    ul.appendChild(li);
  }
}

function fillForm(c) {
  $('#cf-name').value = c.name || '';
  $('#cf-user').value = c.user || '';
  $('#cf-host').value = c.host || 'localhost';
  $('#cf-port').value = c.port || 1521;
  $('#cf-service').value = c.serviceName || '';
  $('#cf-sid').value = c.sid || '';
  $('#cf-url').value = c.url || '';
  $('#cf-note').value = c.note || '';
  $('#cf-role').value = c.role || '';
  $('#cf-password').value = '';
  $('#cf-password').placeholder = c.hasSavedPassword ? '저장된 비밀번호 사용 (바꾸려면 입력)' : '';
  $('#cf-save-pw').checked = c.savePassword !== false;
  $('#cf-production').checked = !!c.production;
  msg('');
}

function formData() {
  return {
    id: selectedId || undefined,
    name: $('#cf-name').value.trim(),
    user: $('#cf-user').value.trim(),
    host: $('#cf-host').value.trim(),
    port: Number($('#cf-port').value) || 1521,
    serviceName: $('#cf-service').value.trim(),
    sid: $('#cf-sid').value.trim(),
    url: $('#cf-url').value.trim(),
    note: $('#cf-note').value.trim(),
    role: $('#cf-role').value,
    password: $('#cf-password').value,
    savePassword: $('#cf-save-pw').checked,
    production: $('#cf-production').checked
  };
}

function msg(text, kind = '') {
  const n = $('#conn-msg');
  n.className = `conn-msg ${kind}`;
  n.textContent = text;
}

/** 서비스명·SID·직접URL 중 하나는 반드시 있어야 한다(없으면 ORA-12261). */
function missingTarget(d) {
  return !d.serviceName && !d.sid && !d.url;
}

async function saveProfile() {
  const d = formData();
  if (!d.name) return msg('접속 이름을 입력하세요.', 'err');
  if (missingTarget(d)) {
    $('#cf-service').focus();
    return msg('서비스명을 입력하세요. (Oracle Free 는 보통 FREEPDB1, XE 는 XEPDB1)', 'err');
  }
  try {
    const r = await api.saveConnection(d);
    selectedId = r.connection.id;
    await refreshList();
    msg('프로필을 저장했습니다.', 'ok');
  } catch (e) {
    msg(errText(e), 'err');
  }
}

async function removeProfile() {
  if (!selectedId) return msg('삭제할 프로필을 선택하세요.', 'err');
  const c = connections.find((x) => x.id === selectedId);
  if (!confirm(`접속 프로필 "${c ? c.name : selectedId}" 을(를) 삭제할까요?`)) return;
  try {
    await api.removeConnection(selectedId);
    selectedId = null;
    await refreshList();
    msg('삭제했습니다.', 'ok');
  } catch (e) {
    msg(errText(e), 'err');
  }
}

async function testProfile() {
  const btn = $('#btn-test-conn');
  const d = formData();
  msg('접속 시험 중…');
  await withBusy(btn, async () => {
    try {
      // 저장된 프로필이면 저장된 비밀번호를 쓸 수 있게 id 로 보낸다
      const body = (selectedId && !d.password) ? { connectionId: selectedId } : { ...d, connectionId: selectedId || undefined, password: d.password };
      const r = await api.testConnection(body);
      if (r.ok) {
        const s = r.server || {};
        msg(`접속 성공\n${s.banner || s.databaseProduct || ''}\n스키마: ${s.currentSchema || s.schema || '-'} · 서버시각: ${s.serverTime || '-'}`, 'ok');
      } else {
        msg(`접속 실패\n${r.error}`, 'err');
      }
    } catch (e) {
      msg(errText(e), 'err');
    }
  }, '시험 중…');
}

async function doConnect() {
  const btn = $('#btn-do-connect');
  const d = formData();
  if (!selectedId && !d.name) return msg('프로필을 먼저 저장하거나 접속 정보를 입력하세요.', 'err');
  if (missingTarget(d)) {
    $('#cf-service').focus();
    return msg('서비스명을 입력하세요. (Oracle Free 는 보통 FREEPDB1, XE 는 XEPDB1)\n비워 두면 ORA-12261 이 납니다.', 'err');
  }

  await withBusy(btn, async () => {
    msg('접속 중…');
    try {
      const body = selectedId
        ? { connectionId: selectedId, password: d.password || undefined }
        : { ...d };
      const r = await api.connect(body);
      const s = r.server || {};
      logMsg(`접속: ${s.banner || s.databaseProduct || ''} (${s.currentSchema || ''})`, 'ok');
      toast(`접속되었습니다 — ${d.name || s.currentSchema || ''}`, 'ok');
      close();
      onConnected(r);
    } catch (e) {
      msg(errText(e), 'err');
      logMsg(`접속 실패: ${errText(e)}`, 'err');
    }
  }, '접속 중…');
}

async function doDisconnect() {
  try {
    await api.disconnect();
    toast('접속을 끊었습니다.');
    logMsg('접속 해제');
    onConnected(null);
  } catch (e) {
    toast(errText(e), 'err');
  }
}

/** 상단바 접속 상태 표시 갱신. */
export function renderStatus() {
  const badge = $('#conn-status');
  const btn = $('#btn-connect');
  const caps = $('#cap-badges');

  if (!session.connected) {
    badge.className = 'conn-status conn-off';
    badge.textContent = '미접속';
    btn.textContent = '접속';
    btn.className = 'btn btn-primary';
    caps.innerHTML = '';
    return;
  }

  const meta = session.meta || {};
  const server = meta.server || {};
  badge.className = `conn-status ${meta.production ? 'conn-prod' : 'conn-on'}`;
  badge.textContent = `${meta.production ? '운영 · ' : ''}${meta.connectionName || ''} (${server.currentSchema || server.schema || ''})`;
  badge.title = `${server.banner || ''}\n${server.url || ''}\nSID ${server.sid || '-'} · 인스턴스 ${server.instance || '-'}`;
  btn.textContent = '접속 해제';
  btn.className = 'btn';

  renderCapBadges(session.capabilities);
}

/** 권한 티어 배지 — 이 접속에서 무엇까지 되는지 한눈에. */
function renderCapBadges(capabilities) {
  const host = $('#cap-badges');
  host.innerHTML = '';
  if (!capabilities || !capabilities.tiers) return;
  const t = capabilities.tiers;

  const level = (v, best, mid) => (v === best ? 'lv-best' : (mid.includes(v) ? 'lv-mid' : 'lv-low'));
  const items = [
    { text: `계획: ${shortPlan(t.plan)}`, cls: level(t.plan, 'DBMS_XPLAN', ['PLAN_TABLE']), tip: t.planLabel },
    { text: `계측: ${shortRt(t.runtime)}`, cls: level(t.runtime, 'ROWSOURCE_STATS', ['SESSION_STATS']), tip: t.runtimeLabel },
    { text: `딕셔너리: ${shortDict(t.dictionary)}`, cls: level(t.dictionary, 'DBA', ['ALL', 'USER']), tip: t.dictionaryLabel }
  ];
  const degraded = (capabilities.degraded || []).length;
  if (degraded) {
    items.push({
      text: `제한 ${degraded}건`,
      cls: 'lv-mid',
      tip: (capabilities.degraded || []).map((d) => `· ${d.label}: ${d.impact}`).join('\n')
    });
  }
  for (const i of items) {
    host.appendChild(el('span', { class: `cap-badge ${i.cls}`, title: i.tip || '', text: i.text }));
  }
}

function shortPlan(v) {
  return { DBMS_XPLAN: '표준', PLAN_TABLE: '기본', NONE: '없음' }[v] || v;
}
function shortRt(v) {
  return { ROWSOURCE_STATS: '실적포함', SESSION_STATS: '세션통계', TIMING_ONLY: '시간만' }[v] || v;
}
function shortDict(v) {
  return { DBA: 'DBA', ALL: 'ALL', USER: 'USER', JDBC_ONLY: 'JDBC만' }[v] || v;
}
