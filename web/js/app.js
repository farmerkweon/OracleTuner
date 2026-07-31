/**
 * 애플리케이션 부트스트랩.
 *
 * 화면 조립과 전역 배선만 담당한다. 각 화면의 동작은 views/* 에 있다.
 */

import { $, $$, toast, logMsg, errText } from './util.js';
import { api, session } from './api.js';
import { setTheme, resizeAll } from './gridkit.js';
import { initLang, setLang, applyDom, onLangChange, LANGS, t } from './i18n.js';
import { applyIcons } from './icons.js';
import { applyProjectLinks } from './project.js';
import { initConnect, renderStatus, open as openConnect } from './views/connect.js';
import { initWorkbench, getEditors, getState, showTab, setDoc as wbSetDoc, getDoc as wbGetDoc, relayout as wbRelayout, resetWorkbench as wbReset } from './views/workbench.js';
import { initSchema, onConnected as schemaOnConnected } from './views/schema.js';
import { initHistory, refresh as refreshHistory, openSaveModal, initSaveModal } from './views/history.js';
import { initSettings, refresh as refreshSettings } from './views/settings.js';
import { initCandidates } from './views/candidates.js';
import { initHelp, openCapabilities, open as openHelp } from './views/help.js';
import { initLibrary, refreshPage as refreshSqls } from './views/library.js';
import { initHintWizard } from './views/hint-wizard.js';

// 토크나이저는 서버/브라우저가 같은 파일을 쓴다(UMD → globalThis.SqlTokenizer)
await import('/shared/sql-tokenizer.js');

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((e) => logMsg(t('boot.swFail', { msg: e.message })));
}

function switchView(name) {
  for (const t of $$('.rail-tab')) t.classList.toggle('is-active', t.dataset.view === name);
  for (const v of $$('.view')) v.classList.toggle('is-active', v.dataset.view === name);
  if (name === 'sqls') refreshSqls();
  if (name === 'workbench') wbRelayout(); // display:none 에서 보이게 됐으니 편집기 크기 재계산
  if (name === 'history') refreshHistory();
  if (name === 'settings') refreshSettings();
  setTimeout(resizeAll, 0);
}

function initShell() {
  for (const tab of $$('.rail-tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }

  const DEFAULT_THEME = 'forest';
  const themeSel = $('#sel-theme');
  const saved = localStorage.getItem('ot.theme');
  themeSel.value = saved || DEFAULT_THEME;
  if (![...themeSel.options].some(o => o.value === themeSel.value)) themeSel.value = DEFAULT_THEME;
  setTheme(themeSel.value);
  themeSel.addEventListener('change', () => {
    setTheme(themeSel.value);
    localStorage.setItem('ot.theme', themeSel.value);
  });

  // 언어 — 초기값 반영 후 셀렉트 배선
  const langSel = $('#sel-lang');
  langSel.value = initLang();
  applyDom();
  applyIcons(); // Open Grid 아이콘을 data-icon 요소에 채운다
  applyProjectLinks(); // 푸터 등의 저장소/라이선스 링크를 실제 주소로
  setLang(langSel.value); // 그리드 로케일까지 맞춘다
  langSel.addEventListener('change', () => { setLang(langSel.value); applyIcons(); });

  // manifest 는 한 파일에 다국어를 담을 수 없어 언어별로 4벌을 두고, 언어가 바뀔 때마다 링크를 바꿔 끼운다
  const linkManifest = $('#link-manifest');
  if (linkManifest) linkManifest.href = `/manifest.${langSel.value}.webmanifest`;
  onLangChange((code) => { if (linkManifest) linkManifest.href = `/manifest.${code}.webmanifest`; });

  $('#btn-save-tuning').addEventListener('click', saveCurrentTuning);
  const footHelp = $('#footer-help');
  if (footHelp) footHelp.addEventListener('click', (e) => { e.preventDefault(); openHelp(); });

  // 권한 배지를 누르면 도움말의 권한 탭이 열린다(딕셔너리 ALL 등이 뭔지 설명)
  $('#cap-badges').addEventListener('click', () => {
    if (session.connected) openCapabilities();
  });

  window.addEventListener('resize', () => resizeAll());
}

/** 워크벤치의 현재 상태를 모아 저장 모달을 연다. */
function saveCurrentTuning() {
  const eds = getEditors();
  const st = getState();
  const cmp = st.lastCompare;
  const server = (session.meta && session.meta.server) || {};

  const doc = wbGetDoc('before');
  openSaveModal({
    before: eds.before.value,
    after: eds.after.value,
    // 이 튜닝이 어느 저장 SQL 의 이력인지 연결(라이브러리에서 열어 온 경우)
    sqlRef: (doc && !doc.isNew && doc.name) ? { name: doc.name, title: doc.title } : null,
    findings: (st.lastAnalysis.before && st.lastAnalysis.before.findings) || [],
    plans: {
      before: st.lastPlan.before || (cmp && cmp.plans && cmp.plans.before) || null,
      after: st.lastPlan.after || (cmp && cmp.plans && cmp.plans.after) || null
    },
    verification: cmp ? cmp.verification : null,
    metrics: cmp ? cmp.performance : null,
    connectionId: (session.meta && session.meta.connectionId) || '',
    connectionName: (session.meta && session.meta.connectionName) || '',
    schema: server.currentSchema || server.schema || ''
  });
}

async function onConnectionChanged(result) {
  renderStatus();
  if (result) {
    // 접속하면 그 접속의 SQL 목록을 먼저 보여준다(사용자 요청: "접속 후 목록이 먼저").
    switchView('sqls');
    await schemaOnConnected();
    const degraded = (session.capabilities && session.capabilities.degraded) || [];
    if (degraded.length) {
      logMsg(t('boot.degraded', { n: degraded.length }));
      for (const d of degraded.slice(0, 6)) logMsg(`  · ${d.label}: ${d.impact}`);
    }
    const tiers = (session.capabilities && session.capabilities.tiers) || {};
    logMsg(t('boot.tiers', { plan: tiers.planLabel || '-', runtime: tiers.runtimeLabel || '-', dict: tiers.dictionaryLabel || '-' }));
  }
}

async function boot() {
  registerServiceWorker();
  initShell();
  initWorkbench();
  initConnect({ onConnected: onConnectionChanged });
  initCandidates({
    // 후보 생성·측정의 기준은 항상 [튜닝 전] 편집기의 <b>현재 문장</b>이다
    getSql: () => getEditors().before.currentStatement().sql,
    onAdopt: (sql) => {
      getEditors().after.setValue(sql);
      getEditors().after.focus();
    }
  });
  initSchema({ editors: getEditors() });
  initHistory({ editors: getEditors(), onLoad: () => {} });
  initSaveModal();
  initSettings();
  initHelp();
  initHintWizard({
    getSql: (s) => getEditors()[s].currentStatement().sql,
    replace: (s, sql) => getEditors()[s].replaceCurrentStatement(sql)
  });
  initLibrary({
    getSql: (side) => {
      const ed = getEditors()[side] || getEditors().before;
      const st = ed.currentStatement();
      return st.sql.trim() || ed.value;
    },
    setSql: (side, sql) => {
      const ed = getEditors()[side] || getEditors().before;
      ed.setValue(sql);
      ed.focus();
    },
    setDoc: (side, doc) => wbSetDoc(side, doc),
    resetWorkbench: () => wbReset(),
    gotoWorkbench: () => switchView('workbench')
  });

  // 언어가 바뀌면 상단 접속 배지와, SQL 목록이 열려 있으면 그 목록도 다시 그린다
  onLangChange(() => {
    renderStatus();
    if (document.querySelector('.view.is-active[data-view="sqls"]')) refreshSqls();
  });

  renderStatus();
  refreshSqls(); // 랜딩이 SQL 목록이므로 첫 화면부터 목록을 채운다
  logMsg(t('boot.started'));

  // 서버·브리지 상태 확인 → 문제가 있으면 설정 화면으로 안내
  try {
    const h = await api.health();
    if (!h.bridge.running) {
      logMsg(t('boot.bridgeNotReady', { msg: h.bridge.lastError || t('boot.bridgeStarting') }), 'err');
    } else {
      logMsg(t('boot.bridgeReady', { pid: h.bridge.pid }), 'ok');
    }
  } catch (e) {
    logMsg(t('boot.healthFail', { msg: errText(e) }), 'err');
  }

  try {
    const cfg = await api.getConfig();
    window.__otConfig = cfg.settings;
    const bad = (cfg.diagnostics.items || []).filter((i) => !i.ok && i.severity !== 'warn');
    if (bad.length) {
      toast(t('boot.configCheck', { items: bad.map((b) => b.label).join(', ') }), 'warn', 8000);
      switchView('settings');
      return;
    }
  } catch (e) {
    logMsg(t('boot.configFail', { msg: errText(e) }), 'err');
  }

  // 새로고침(F5) 전에 접속돼 있었다면 복원한다 — 접속은 서버(브리지)에 살아 있으므로
  // id 만 있으면 되살릴 수 있다. 복원되면 접속 창을 다시 띄우지 않는다.
  try {
    if (await api.restoreSession()) {
      renderStatus();
      logMsg(t('boot.sessionRestored', { name: (session.meta && session.meta.connectionName) || '' }), 'ok');
      await schemaOnConnected();
      switchView('sqls');   // 접속 후에는 그 접속의 SQL 목록을 먼저
      refreshSqls();
      return;
    }
  } catch (e) { logMsg(t('boot.sessionRestoreFail', { msg: errText(e) }), 'err'); }

  // 접속 프로필이 하나도 없으면 접속 창을 열어 첫 사용을 안내한다
  try {
    const r = await api.listConnections();
    if (!r.connections.length) {
      toast(t('boot.needConnection'), '', 5000);
      openConnect();
    }
  } catch (e) { /* 무시 */ }
}

boot().catch((e) => {
  console.error(e);
  toast(t('boot.initFail', { msg: e.message }), 'err', 10000);
});
