/**
 * 접속 모달 — 프로필 목록/편집/시험/접속.
 *
 * 비밀번호는 서버에만 저장되고(로컬 암호화) 목록 응답에는 포함되지 않는다.
 * 화면은 "저장되어 있음" 여부만 알 수 있다.
 */

import { $, $$, el, esc, toast, errText, withBusy, logMsg } from '../util.js';
import { t } from '../i18n.js';
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
    ul.appendChild(el('li', { class: 'muted', text: t('cn.noSaved') }));
    return;
  }
  for (const c of connections) {
    const li = el('li', { class: c.id === selectedId ? 'is-sel' : '' }, [
      el('div', { class: 'conn-name' }, [
        document.createTextNode(c.name),
        c.production ? el('span', { class: 'prod-mark', text: t('cn.prodBadge') }) : null,
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
  $('#cf-password').placeholder = c.hasSavedPassword ? t('cn.savedPwPlaceholder') : '';
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
  if (!d.name) return msg(t('cn.needName'), 'err');
  if (missingTarget(d)) {
    $('#cf-service').focus();
    return msg(t('cn.needService'), 'err');
  }
  try {
    const r = await api.saveConnection(d);
    selectedId = r.connection.id;
    await refreshList();
    msg(t('cn.profileSaved'), 'ok');
  } catch (e) {
    msg(errText(e), 'err');
  }
}

async function removeProfile() {
  if (!selectedId) return msg(t('cn.selectToDelete'), 'err');
  const c = connections.find((x) => x.id === selectedId);
  if (!confirm(t('cn.deleteConfirm', { name: c ? c.name : selectedId }))) return;
  try {
    await api.removeConnection(selectedId);
    selectedId = null;
    await refreshList();
    msg(t('cn.deleted'), 'ok');
  } catch (e) {
    msg(errText(e), 'err');
  }
}

async function testProfile() {
  const btn = $('#btn-test-conn');
  const d = formData();
  msg(t('cn.testing'));
  await withBusy(btn, async () => {
    try {
      // 저장된 프로필이면 저장된 비밀번호를 쓸 수 있게 id 로 보낸다
      const body = (selectedId && !d.password) ? { connectionId: selectedId } : { ...d, connectionId: selectedId || undefined, password: d.password };
      const r = await api.testConnection(body);
      if (r.ok) {
        const s = r.server || {};
        msg(t('cn.testOk', { banner: s.banner || s.databaseProduct || '', schema: s.currentSchema || s.schema || '-', time: s.serverTime || '-' }), 'ok');
      } else {
        msg(t('cn.testFail', { err: r.error }), 'err');
      }
    } catch (e) {
      msg(errText(e), 'err');
    }
  }, t('cn.testingBtn'));
}

async function doConnect() {
  const btn = $('#btn-do-connect');
  const d = formData();
  if (!selectedId && !d.name) return msg(t('cn.needProfile'), 'err');
  if (missingTarget(d)) {
    $('#cf-service').focus();
    return msg(t('cn.needServiceConnect'), 'err');
  }

  await withBusy(btn, async () => {
    msg(t('cn.connecting'));
    try {
      const body = selectedId
        ? { connectionId: selectedId, password: d.password || undefined }
        : { ...d };
      const r = await api.connect(body);
      const s = r.server || {};
      logMsg(t('cn.logConnected', { banner: s.banner || s.databaseProduct || '', schema: s.currentSchema || '' }), 'ok');
      toast(t('cn.connectedToast', { name: d.name || s.currentSchema || '' }), 'ok');
      close();
      onConnected(r);
    } catch (e) {
      msg(errText(e), 'err');
      logMsg(t('cn.logConnectFailed', { err: errText(e) }), 'err');
    }
  }, t('cn.connecting'));
}

async function doDisconnect() {
  try {
    await api.disconnect();
    toast(t('cn.disconnectedToast'));
    logMsg(t('top.disconnect'));
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
    badge.textContent = t('top.notConnected');
    btn.textContent = t('top.connect');
    btn.className = 'btn btn-primary';
    caps.innerHTML = '';
    return;
  }

  const meta = session.meta || {};
  const server = meta.server || {};
  badge.className = `conn-status ${meta.production ? 'conn-prod' : 'conn-on'}`;
  badge.textContent = `${meta.production ? t('cn.prodPrefix') : ''}${meta.connectionName || ''} (${server.currentSchema || server.schema || ''})`;
  badge.title = t('cn.statusTitle', { banner: server.banner || '', url: server.url || '', sid: server.sid || '-', instance: server.instance || '-' });
  btn.textContent = t('top.disconnect');
  btn.className = 'btn';

  renderCapBadges(session.capabilities);
}

/** 권한 티어 배지 — 이 접속에서 무엇까지 되는지 한눈에. */
function renderCapBadges(capabilities) {
  const host = $('#cap-badges');
  host.innerHTML = '';
  if (!capabilities || !capabilities.tiers) return;
  const tiers = capabilities.tiers;

  const level = (v, best, mid) => (v === best ? 'lv-best' : (mid.includes(v) ? 'lv-mid' : 'lv-low'));
  const items = [
    { text: t('cn.capPlan', { v: shortPlan(tiers.plan) }), cls: level(tiers.plan, 'DBMS_XPLAN', ['PLAN_TABLE']), tip: tiers.planLabel },
    { text: t('cn.capRuntime', { v: shortRt(tiers.runtime) }), cls: level(tiers.runtime, 'ROWSOURCE_STATS', ['SESSION_STATS']), tip: tiers.runtimeLabel },
    { text: t('cn.capDict', { v: shortDict(tiers.dictionary) }), cls: level(tiers.dictionary, 'DBA', ['ALL', 'USER']), tip: tiers.dictionaryLabel }
  ];
  const degraded = (capabilities.degraded || []).length;
  if (degraded) {
    items.push({
      text: t('cn.capDegraded', { n: degraded }),
      cls: 'lv-mid',
      tip: (capabilities.degraded || []).map((d) => `· ${d.label}: ${d.impact}`).join('\n')
    });
  }
  for (const i of items) {
    host.appendChild(el('span', { class: `cap-badge ${i.cls}`, title: i.tip || '', text: i.text }));
  }
}

function shortPlan(v) {
  return { DBMS_XPLAN: t('cn.planStd'), PLAN_TABLE: t('cn.planBasic'), NONE: t('cn.planNone') }[v] || v;
}
function shortRt(v) {
  return { ROWSOURCE_STATS: t('cn.rtFull'), SESSION_STATS: t('cn.rtSession'), TIMING_ONLY: t('cn.rtTimeOnly') }[v] || v;
}
function shortDict(v) {
  return { DBA: 'DBA', ALL: 'ALL', USER: 'USER', JDBC_ONLY: t('cn.dictJdbcOnly') }[v] || v;
}
