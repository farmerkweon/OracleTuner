/**
 * 설정 화면 — Java 경로, JDBC 드라이버 경로, 실행 기본값.
 *
 * 진단 결과를 맨 위에 두고 "무엇이 준비됐고 무엇이 빠졌는지"를 먼저 보여준다.
 * 사용자가 설정 화면에 오는 이유는 대개 "안 되기 때문"이므로, 원인부터 보이게 한다.
 */

import { $, $$, el, esc, toast, errText, withBusy } from '../util.js';
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
    toast(`설정을 불러오지 못했습니다: ${errText(e)}`, 'err');
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
      let text = '저장했습니다.';
      if (r.restarted) text += ' Java/JDBC 설정이 바뀌어 브리지를 다시 띄웠습니다 (DB 접속은 끊깁니다).';
      if (r.restartError) text += ` 브리지 재기동 실패: ${r.restartError}`;
      msg.textContent = text;
      toast(text, r.restartError ? 'err' : 'ok', 6000);
    } catch (e) {
      msg.textContent = errText(e);
      toast(errText(e), 'err');
    }
  }, '저장 중…');
}

async function restartBridge() {
  const btn = $('#btn-restart-bridge');
  await withBusy(btn, async () => {
    try {
      await api.restartBridge();
      toast('브리지를 다시 띄웠습니다. DB 접속은 끊겼습니다.', 'ok');
      refresh();
    } catch (e) {
      toast(errText(e), 'err', 8000);
    }
  }, '재기동 중…');
}

async function rebuildBridge() {
  const btn = $('#btn-rebuild-bridge');
  await withBusy(btn, async () => {
    try {
      const r = await api.buildBridge(true);
      toast(`${r.ok ? '빌드 성공' : '빌드 실패'}: ${r.message}`, r.ok ? 'ok' : 'err', 8000);
      if (r.output) console.log(r.output);
      refresh();
    } catch (e) {
      toast(errText(e), 'err', 8000);
    }
  }, '빌드 중…');
}

async function rescanDrivers() {
  try {
    const r = await api.rescanDrivers();
    renderDrivers(r.jars || []);
    toast(`드라이버 ${r.jars.filter((j) => j.exists).length}개를 인식했습니다.`, 'ok');
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
      el('div', { class: 'diag-label', text: '실행 환경' }),
      el('div', { class: 'diag-detail', text: `Node ${diag.node} · ${diag.platform}\n설정 파일: ${diag.settingsFile}` })
    ])
  ]));
}

function renderDrivers(jars) {
  const host = $('#driver-list');
  host.innerHTML = '';
  if (!jars.length) {
    host.appendChild(el('div', { class: 'cand is-missing', text: '인식된 드라이버가 없습니다. java/lib 에 ojdbc11.jar 를 넣으세요.' }));
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
  host.innerHTML = '<div class="muted" style="font-size:11.5px">설치된 Java 를 찾는 중…</div>';
  try {
    const r = await api.javaHomes();
    host.innerHTML = '';
    if (!r.homes.length) {
      host.appendChild(el('div', { class: 'cand is-missing', text: '설치된 Java 를 찾지 못했습니다. 경로를 직접 입력하세요.' }));
      return;
    }
    for (const h of r.homes) {
      const row = el('div', { class: 'cand' }, [
        el('span', { text: `${h.hasJavac ? 'JDK' : 'JRE'} · ${h.version || ''} · ${h.home}` }),
        el('button', {
          class: 'btn btn-sm',
          text: '사용',
          onclick: () => {
            $('#cfg-java-home').value = h.home;
            toast('경로를 입력란에 넣었습니다. [설정 저장] 을 누르세요.');
          }
        })
      ]);
      host.appendChild(row);
    }
  } catch (e) {
    host.innerHTML = `<div class="cand is-missing">${esc(errText(e))}</div>`;
  }
}
