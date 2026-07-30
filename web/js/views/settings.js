/**
 * 설정 화면 — Java 경로, JDBC 드라이버 경로, 실행 기본값.
 *
 * 진단 결과를 맨 위에 두고 "무엇이 준비됐고 무엇이 빠졌는지"를 먼저 보여준다.
 * 사용자가 설정 화면에 오는 이유는 대개 "안 되기 때문"이므로, 원인부터 보이게 한다.
 */

import { $, $$, el, esc, toast, errText, withBusy } from '../util.js';
import { t } from '../i18n.js';
import { api } from '../api.js';

let current = null;

export function initSettings() {
  $('#btn-save-settings').addEventListener('click', saveSettings);
  $('#btn-restart-bridge').addEventListener('click', restartBridge);
  $('#btn-rebuild-bridge').addEventListener('click', rebuildBridge);
  $('#btn-rescan-drivers').addEventListener('click', rescanDrivers);
}

export async function refresh() {
  try {
    const r = await api.getConfig();
    current = r.settings;
    window.__otConfig = r.settings;
    fillForm(r.settings);
    renderDiagnostics(r.diagnostics);
    renderDrivers(r.diagnostics.jars || []);
    loadJavaCandidates();
  } catch (e) {
    toast(t('se.loadFailed', { err: errText(e) }), 'err');
  }
}

function fillForm(s) {
  $('#cfg-java-home').value = s.java.home || '';
  $('#cfg-java-options').value = (s.java.options || []).join('\n');
  $('#cfg-driver-paths').value = (s.jdbc.driverPaths || []).join('\n');
  $('#cfg-auto-discover').checked = s.jdbc.autoDiscover !== false;
  $('#cfg-max-rows').value = s.execution.maxRows;
  $('#cfg-fetch-size').value = s.execution.fetchSize;
  $('#cfg-timeout').value = s.execution.timeoutSec;
  $('#cfg-bench-runs').value = s.execution.benchRuns;
  $('#cfg-bench-warmup').value = s.execution.benchWarmup;
  $('#cfg-port').value = s.server.port;
  $('#cfg-safe-mode').checked = s.execution.safeMode !== false;
  $('#cfg-auto-explain').checked = !!s.execution.autoExplain;
}

function collectForm() {
  return {
    java: {
      home: $('#cfg-java-home').value.trim(),
      options: $('#cfg-java-options').value.split('\n').map((s) => s.trim()).filter(Boolean)
    },
    jdbc: {
      driverPaths: $('#cfg-driver-paths').value.split('\n').map((s) => s.trim()).filter(Boolean),
      autoDiscover: $('#cfg-auto-discover').checked
    },
    server: { port: Number($('#cfg-port').value) || 7070 },
    execution: {
      maxRows: Number($('#cfg-max-rows').value) || 5000,
      fetchSize: Number($('#cfg-fetch-size').value) || 1000,
      timeoutSec: Number($('#cfg-timeout').value) || 60,
      benchRuns: Number($('#cfg-bench-runs').value) || 3,
      benchWarmup: Number($('#cfg-bench-warmup').value),
      safeMode: $('#cfg-safe-mode').checked,
      autoExplain: $('#cfg-auto-explain').checked
    }
  };
}

async function saveSettings() {
  const btn = $('#btn-save-settings');
  const msg = $('#settings-msg');
  await withBusy(btn, async () => {
    try {
      const r = await api.saveConfig(collectForm());
      current = r.settings;
      window.__otConfig = r.settings;
      renderDiagnostics(r.diagnostics);
      renderDrivers(r.diagnostics.jars || []);
      let text = t('se.saved');
      if (r.restarted) text += ' ' + t('se.restartedNote');
      if (r.restartError) text += ' ' + t('se.restartFailed', { err: r.restartError });
      msg.textContent = text;
      toast(text, r.restartError ? 'err' : 'ok', 6000);
    } catch (e) {
      msg.textContent = errText(e);
      toast(errText(e), 'err');
    }
  }, t('se.saving'));
}

async function restartBridge() {
  const btn = $('#btn-restart-bridge');
  await withBusy(btn, async () => {
    try {
      await api.restartBridge();
      toast(t('se.restartedOk'), 'ok');
      refresh();
    } catch (e) {
      toast(errText(e), 'err', 8000);
    }
  }, t('se.restarting'));
}

async function rebuildBridge() {
  const btn = $('#btn-rebuild-bridge');
  await withBusy(btn, async () => {
    try {
      const r = await api.buildBridge(true);
      toast(`${r.ok ? t('se.buildOk') : t('se.buildFail')}: ${r.message}`, r.ok ? 'ok' : 'err', 8000);
      if (r.output) console.log(r.output);
      refresh();
    } catch (e) {
      toast(errText(e), 'err', 8000);
    }
  }, t('se.building'));
}

async function rescanDrivers() {
  try {
    const r = await api.rescanDrivers();
    renderDrivers(r.jars || []);
    toast(t('se.driversFound', { n: r.jars.filter((j) => j.exists).length }), 'ok');
  } catch (e) {
    toast(errText(e), 'err');
  }
}

function renderDiagnostics(diag) {
  const host = $('#diag-list');
  host.innerHTML = '';
  for (const item of (diag.items || [])) {
    const cls = item.ok ? 'is-ok' : (item.severity === 'warn' ? 'is-warn' : 'is-bad');
    host.appendChild(el('div', { class: `diag-item ${cls}` }, [
      el('div', { class: 'diag-icon', text: item.ok ? '✔' : (item.severity === 'warn' ? '!' : '✕') }),
      el('div', { class: 'diag-body' }, [
        el('div', { class: 'diag-label', text: item.label }),
        el('div', { class: 'diag-detail', text: item.detail || '' }),
        item.hint ? el('div', { class: 'diag-hint', text: item.hint }) : null
      ])
    ]));
  }
  host.appendChild(el('div', { class: 'diag-item' }, [
    el('div', { class: 'diag-icon', text: 'i' }),
    el('div', { class: 'diag-body' }, [
      el('div', { class: 'diag-label', text: t('se.runtimeLabel') }),
      el('div', { class: 'diag-detail', text: t('se.runtimeDetail', { node: diag.node, platform: diag.platform, file: diag.settingsFile }) })
    ])
  ]));
}

function renderDrivers(jars) {
  const host = $('#driver-list');
  host.innerHTML = '';
  if (!jars.length) {
    host.appendChild(el('div', { class: 'cand is-missing', text: t('se.noDrivers') }));
    return;
  }
  for (const j of jars) {
    host.appendChild(el('div', { class: `cand ${j.exists ? '' : 'is-missing'}` }, [
      el('span', { text: (j.exists ? '✔ ' : '✕ ') + j.path })
    ]));
  }
}

async function loadJavaCandidates() {
  const host = $('#java-candidates');
  host.innerHTML = `<div class="muted" style="font-size:11.5px">${esc(t('se.searchingJava'))}</div>`;
  try {
    const r = await api.javaHomes();
    host.innerHTML = '';
    if (!r.homes.length) {
      host.appendChild(el('div', { class: 'cand is-missing', text: t('se.noJavaFound') }));
      return;
    }
    for (const h of r.homes) {
      const row = el('div', { class: 'cand' }, [
        el('span', { text: `${h.hasJavac ? 'JDK' : 'JRE'} · ${h.version || ''} · ${h.home}` }),
        el('button', {
          class: 'btn btn-sm',
          text: t('se.use'),
          onclick: () => {
            $('#cfg-java-home').value = h.home;
            toast(t('se.pathFilled'));
          }
        })
      ]);
      host.appendChild(row);
    }
  } catch (e) {
    host.innerHTML = `<div class="cand is-missing">${esc(errText(e))}</div>`;
  }
}
