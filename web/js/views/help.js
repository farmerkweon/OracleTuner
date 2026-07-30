/**
 * 도움말 모달.
 *
 * <p>탭 구성
 * <ol>
 *   <li>시작하기 — 이 도구로 무엇을 어떻게 하는지(튜닝을 몰라도 되게)</li>
 *   <li>단축키</li>
 *   <li><b>권한 이해</b> — "딕셔너리 ALL", "제한 N건", "V$SQL 못 씀"이 무슨 뜻인지.
 *       접속돼 있으면 <b>지금 이 접속</b>의 실제 권한 상태를 그대로 보여준다.</li>
 *   <li>정보 — Open Grid 크레딧, 저작권, 링크, 문의</li>
 * </ol>
 *
 * 4개 언어를 지원한다. 설명 본문이 길어 카탈로그(i18n.js)와 별도로 이 파일 안에 언어별 HTML 을 둔다.
 */

import { $, el, esc, safeHtml } from '../util.js';
import { t, getLang, onLangChange } from '../i18n.js';
import { PROJECT } from '../project.js';
import { session } from '../api.js';

const TABS = [
  { key: 'start', label: { ko: '시작하기', en: 'Getting started', ja: 'はじめに', zh: '开始使用' } },
  { key: 'keys', label: { ko: '단축키', en: 'Shortcuts', ja: 'ショートカット', zh: '快捷键' } },
  { key: 'caps', label: { ko: '권한 이해', en: 'Permissions', ja: '権限の理解', zh: '权限说明' } },
  { key: 'about', label: { ko: '정보', en: 'About', ja: '情報', zh: '关于' } }
];

let activeTab = 'about'; // 정보 탭을 먼저 펼친다

export function initHelp() {
  $('#btn-help').addEventListener('click', open);
  $('#modal-help').addEventListener('click', (e) => {
    if (e.target.id === 'modal-help' || e.target.hasAttribute('data-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') { e.preventDefault(); open(); }
    if (e.key === 'Escape' && !$('#modal-help').hidden) close();
  });
  onLangChange(() => { if (!$('#modal-help').hidden) render(); });
}

/** 권한 탭을 바로 열도록 하는 진입점(권한 배지 클릭 시). */
export function openCapabilities() {
  activeTab = 'caps';
  open();
}

export function open() {
  $('#modal-help').hidden = false;
  render();
}

export function close() {
  $('#modal-help').hidden = true;
}

function render() {
  const lang = getLang();
  const tabsHost = $('#help-tabs');
  tabsHost.innerHTML = '';
  for (const tab of TABS) {
    const btn = el('button', {
      class: `help-tab ${tab.key === activeTab ? 'is-active' : ''}`,
      text: tab.label[lang] || tab.label.ko,
      onclick: () => { activeTab = tab.key; render(); }
    });
    tabsHost.appendChild(btn);
  }
  const content = $('#help-content');
  content.innerHTML =
    activeTab === 'start' ? START[lang] || START.ko
    : activeTab === 'keys' ? KEYS[lang] || KEYS.ko
    : activeTab === 'caps' ? capsHtml(lang)
    : ABOUT[lang] || ABOUT.ko;
}

// ══════════════════════════════════════════════════════════════════════════
//  시작하기
// ══════════════════════════════════════════════════════════════════════════

const START = {
  ko: `
    <h3>이 도구가 하는 일</h3>
    <p>Oracle SQL 을 <b>실제로 실행해서</b> 튜닝합니다. 추측이 아니라 측정으로 판단합니다.</p>
    <ol class="help-steps">
      <li><b>접속</b> — 오른쪽 위 [접속]. 접속정보는 파일로 저장되고 비밀번호는 로컬 암호화됩니다.</li>
      <li><b>튜닝 전 SQL 작성</b> — 왼쪽 편집기에. 커서가 놓인 문장만 실행됩니다.</li>
      <li><b>진단</b> (Ctrl+D) — 인덱스를 못 타는 조건, 위험한 패턴 등을 짚어 줍니다.</li>
      <li><b>튜닝 후보</b> 탭 — <b>튜닝을 몰라도 됩니다.</b> [후보 생성]으로 시도해 볼 안을 자동으로 만들고,
        [토너먼트 실행]으로 원본과 후보들을 <b>번갈아 여러 번 실행</b>해 속도·부하를 재고
        <b>결과가 같은지</b>까지 확인한 뒤 순위를 매깁니다. 1순위를 채택하면 [튜닝 후]에 들어갑니다.</li>
      <li><b>비교 검증</b> (Ctrl+Shift+K) — 전/후를 번갈아 실행해 성능 차이와 결과 동일성을 함께 판정하고,
        막대 차트로 보여 줍니다.</li>
      <li><b>튜닝 저장</b> — 전/후 SQL·계획·검증 결과를 파일로 남깁니다. Markdown/SQL 로 내보낼 수 있습니다.</li>
    </ol>
    <p class="help-note">권한이 제한된 계정에서도 <b>가능한 만큼</b> 동작합니다. 무엇이 되고 안 되는지는
      [권한 이해] 탭에서 확인하세요.</p>

    <h4>🧪 튜닝 효과를 직접 확인해 보기 (샘플 예제)</h4>
    <p>"정말 빨라지나?" 를 눈으로 보려면 시험용 데이터가 필요합니다. 아래 순서로 5분이면 됩니다.</p>
    <ol class="help-steps">
      <li>[SQL 목록] 탭 → 툴바의 <b>[샘플 예제]</b> 버튼 → 예제 10건이 "데모" 폴더에 들어옵니다.</li>
      <li><b>[설정] → 안전모드 끄기</b> — 안전모드는 DML 을 자동 롤백하므로 켜 두면 데이터가 안 남습니다.</li>
      <li>"① 데모 데이터 만들기" 를 워크벤치로 열어 문장을 <b>하나씩</b> 실행(Ctrl+Enter).
        30만 건이라 1~2분 걸립니다. (표 2개 + 인덱스 4개 + 통계까지 만듭니다)</li>
      <li><b>[설정] → 안전모드 다시 켜기</b> (권장)</li>
      <li>예제(①~⑧) 중 하나를 열고 → <b>[튜닝 후보]</b> 탭 → [후보 생성] → [토너먼트 실행].
        순위·개선율·결과 동일성이 숫자로 나옵니다.</li>
    </ol>
    <p class="help-note">예제는 <b>일부러 느리게</b> 짜여 있습니다.
      ② 암시적 형변환과 ① 날짜 함수 조건이 차이가 가장 크고,
      ⑦ 은 성능이 아니라 <b>결과가 틀린</b> 경우라 검증이 "결과 다름"으로 잡아냅니다.
      다 쓰고 나면 "⑨ 데모 데이터 정리" 로 지우면 됩니다.</p>`,
  en: `
    <h3>What this tool does</h3>
    <p>It tunes Oracle SQL by <b>actually running it</b> — decisions come from measurement, not guesswork.</p>
    <ol class="help-steps">
      <li><b>Connect</b> — top right. Connections are saved to a file; passwords are encrypted locally.</li>
      <li><b>Write the original SQL</b> on the left. Only the statement under the cursor runs.</li>
      <li><b>Diagnose</b> (Ctrl+D) — points out non-indexable predicates and risky patterns.</li>
      <li><b>Candidates</b> tab — <b>no tuning expertise needed.</b> [Generate] builds candidate rewrites,
        [Run tournament] executes the original and candidates <b>alternately, multiple times</b>,
        measures speed/load, verifies the <b>results match</b>, and ranks them. Adopt the winner into [Tuned].</li>
      <li><b>Compare</b> (Ctrl+Shift+K) — runs before/after alternately, judges performance and result equivalence,
        and shows a bar chart.</li>
      <li><b>Save tuning</b> — stores before/after SQL, plans and verdict to a file. Export as Markdown/SQL.</li>
    </ol>
    <p class="help-note">It works <b>as far as your privileges allow</b>. See the [Permissions] tab for what is and isn't available.</p>

    <h4>🧪 See real tuning gains (sample set)</h4>
    <p>To see "is it actually faster?", you need test data. About 5 minutes:</p>
    <ol class="help-steps">
      <li>[SQL List] tab → <b>[Samples]</b> button → 10 examples land in the "데모" folder.</li>
      <li><b>[Settings] → turn Safe mode off</b> — it auto-rolls back DML, so data wouldn't persist.</li>
      <li>Open "① 데모 데이터 만들기" in the workbench and run statements <b>one by one</b> (Ctrl+Enter).
        300,000 rows takes 1–2 minutes (2 tables + 4 indexes + statistics).</li>
      <li><b>[Settings] → turn Safe mode back on</b> (recommended)</li>
      <li>Open any example (①–⑧) → <b>[Candidates]</b> tab → [Generate] → [Run tournament].
        You get ranking, improvement %, and result-equivalence as numbers.</li>
    </ol>
    <p class="help-note">The examples are <b>deliberately slow</b>. ② implicit conversion and ① date-function
      predicates show the largest gains; ⑦ is not about speed but a <b>wrong result</b>, which verification flags
      as "Differs". Clean up afterwards with "⑨ 데모 데이터 정리".</p>`,
  ja: `
    <h3>このツールの役割</h3>
    <p>Oracle SQL を <b>実際に実行して</b> チューニングします。推測ではなく計測で判断します。</p>
    <ol class="help-steps">
      <li><b>接続</b> — 右上。接続情報はファイルに保存され、パスワードはローカルで暗号化されます。</li>
      <li><b>チューニング前 SQL</b> を左に。カーソル位置の文だけ実行されます。</li>
      <li><b>診断</b> (Ctrl+D) — インデックスが効かない条件や危険なパターンを指摘します。</li>
      <li><b>チューニング候補</b> タブ — <b>知識は不要です。</b> [候補生成] で案を自動作成し、
        [トーナメント実行] で原本と候補を <b>交互に複数回実行</b> して速度・負荷を測り、
        <b>結果が同じか</b> 確認して順位付けします。1位を採用すると [チューニング後] に入ります。</li>
      <li><b>比較検証</b> (Ctrl+Shift+K) — 前後を交互に実行し、性能差と結果同一性を判定して棒グラフで表示します。</li>
      <li><b>保存</b> — 前後 SQL・計画・判定をファイルに残します。Markdown/SQL で出力可能。</li>
    </ol>
    <p class="help-note">権限が限られていても <b>可能な範囲で</b> 動作します。詳細は [権限の理解] タブへ。</p>

    <h4>🧪 チューニング効果を実際に確認する(サンプル)</h4>
    <p>「本当に速くなるのか」を見るには試験データが必要です。約 5 分:</p>
    <ol class="help-steps">
      <li>[SQL 一覧] タブ → ツールバーの <b>[サンプル]</b> ボタン → 例題 10 件が「데모」フォルダに入ります。</li>
      <li><b>[設定] → セーフモードをオフ</b> — DML を自動ロールバックするため、オンだとデータが残りません。</li>
      <li>「① 데모 데이터 만들기」をワークベンチで開き、文を <b>1 つずつ</b> 実行(Ctrl+Enter)。
        30 万件で 1〜2 分かかります(表 2 + インデックス 4 + 統計)。</li>
      <li><b>[設定] → セーフモードを再度オン</b>(推奨)</li>
      <li>例題(①〜⑧)を開き → <b>[チューニング候補]</b> タブ → [候補生成] → [トーナメント実行]。
        順位・改善率・結果同一性が数値で出ます。</li>
    </ol>
    <p class="help-note">例題は <b>わざと遅く</b> 作ってあります。② 暗黙の型変換と ① 日付関数条件が最も差が出ます。
      ⑦ は性能ではなく <b>結果が誤っている</b> ケースで、検証が「結果違い」として検出します。
      終わったら「⑨ 데모 데이터 정리」で削除できます。</p>`,
  zh: `
    <h3>本工具的作用</h3>
    <p>通过 <b>实际执行</b> 来调优 Oracle SQL —— 用测量而非猜测来判断。</p>
    <ol class="help-steps">
      <li><b>连接</b> — 右上角。连接信息保存为文件，密码本地加密。</li>
      <li>在左侧 <b>编写原始 SQL</b>。仅执行光标所在的语句。</li>
      <li><b>诊断</b> (Ctrl+D) — 指出无法走索引的条件与风险模式。</li>
      <li><b>调优候选</b> 标签 — <b>无需懂调优。</b> [生成候选] 自动构建改写方案，
        [运行竞赛] 将原语句与候选 <b>交替多次执行</b>，测量速度/负载，验证 <b>结果是否一致</b> 并排名。
        采用第一名将写入 [调优后]。</li>
      <li><b>对比验证</b> (Ctrl+Shift+K) — 交替执行前后语句，判定性能差异与结果一致性，并以柱状图展示。</li>
      <li><b>保存调优</b> — 将前后 SQL、计划与结论存为文件，可导出为 Markdown/SQL。</li>
    </ol>
    <p class="help-note">即使权限受限也会 <b>尽可能</b> 工作。详见 [权限说明] 标签。</p>

    <h4>🧪 亲眼验证调优效果（示例集）</h4>
    <p>要看到"真的更快了吗"，需要测试数据。约 5 分钟：</p>
    <ol class="help-steps">
      <li>[SQL 列表] 标签 → 工具栏 <b>[示例]</b> 按钮 → 10 个示例进入"데모"文件夹。</li>
      <li><b>[设置] → 关闭安全模式</b> —— 它会自动回滚 DML，开启时数据不会保留。</li>
      <li>在工作台打开"① 데모 데이터 만들기"，<b>逐条</b>执行语句（Ctrl+Enter）。
        30 万行需 1–2 分钟（2 张表 + 4 个索引 + 统计信息）。</li>
      <li><b>[设置] → 重新开启安全模式</b>（建议）</li>
      <li>打开任一示例（①–⑧）→ <b>[调优候选]</b> 标签 → [生成候选] → [运行竞赛]。
        排名、改善率与结果一致性都以数字呈现。</li>
    </ol>
    <p class="help-note">示例是 <b>故意写慢</b> 的。② 隐式类型转换与 ① 日期函数条件差异最大；
      ⑦ 不是性能问题而是 <b>结果错误</b>，验证会将其标为"结果不同"。
      用完后可用"⑨ 데모 데이터 정리"清理。</p>`
};

// ══════════════════════════════════════════════════════════════════════════
//  단축키
// ══════════════════════════════════════════════════════════════════════════

const SHORTCUTS = [
  { k: 'Ctrl+Enter', d: { ko: '커서 위치의 문장 실행', en: 'Run statement at cursor', ja: 'カーソル位置の文を実行', zh: '执行光标处语句' } },
  { k: 'Ctrl+E', d: { ko: '실행계획 조회', en: 'Explain plan', ja: '実行計画', zh: '执行计划' } },
  { k: 'Ctrl+D', d: { ko: 'SQL 진단', en: 'Diagnose SQL', ja: 'SQL 診断', zh: '诊断 SQL' } },
  { k: 'Ctrl+Shift+F', d: { ko: 'SQL 정렬(포맷)', en: 'Format SQL', ja: 'SQL 整形', zh: '格式化 SQL' } },
  { k: 'Ctrl+Shift+K', d: { ko: '튜닝 전/후 비교 검증', en: 'Compare before/after', ja: '前後比較検証', zh: '前后对比验证' } },
  { k: 'Ctrl+Shift+C', d: { ko: '접속 창 열기', en: 'Open connection dialog', ja: '接続ウィンドウ', zh: '打开连接窗口' } },
  { k: 'Ctrl+/', d: { ko: '선택 줄 주석 토글', en: 'Toggle line comment', ja: '行コメント切替', zh: '切换行注释' } },
  { k: 'Tab / Shift+Tab', d: { ko: '들여쓰기 / 내어쓰기', en: 'Indent / outdent', ja: 'インデント / 解除', zh: '缩进 / 反缩进' } },
  { k: 'F1', d: { ko: '이 도움말', en: 'This help', ja: 'このヘルプ', zh: '本帮助' } }
];

const KEYS = buildKeys();
function buildKeys() {
  const out = {};
  for (const lang of ['ko', 'en', 'ja', 'zh']) {
    const rows = SHORTCUTS.map((s) => `<tr><td class="kbd">${esc(s.k)}</td><td>${esc(s.d[lang])}</td></tr>`).join('');
    const note = {
      ko: '· 선택 영역이 있으면 그 부분만, 없으면 커서가 놓인 한 문장만 실행합니다.<br>· DML/DDL 은 안전모드에서 실행 후 자동 롤백됩니다(설정에서 변경).',
      en: '· If text is selected, only that runs; otherwise only the statement at the cursor.<br>· DML/DDL auto-rolls back in safe mode (changeable in Settings).',
      ja: '· 選択範囲があればその部分のみ、なければカーソル位置の1文のみ実行します。<br>· DML/DDL はセーフモードで実行後に自動ロールバックします(設定で変更可)。',
      zh: '· 若有选中文本则仅执行选中部分，否则仅执行光标处语句。<br>· DML/DDL 在安全模式下执行后自动回滚(可在设置更改)。'
    };
    out[lang] = `<h3>${TABS[1].label[lang]}</h3><table class="help-table"><tbody>${rows}</tbody></table>
      <p class="help-note">${note[lang]}</p>`;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
//  권한 이해 — 사용자가 가장 궁금해한 부분
// ══════════════════════════════════════════════════════════════════════════

const CAPS_INTRO = {
  ko: `
    <h3>왜 "권한"이 중요한가</h3>
    <p>운영 DB 계정은 보안 때문에 내부 정보를 못 보는 경우가 많습니다. 이 도구는 접속하자마자
      <b>무엇을 볼 수 있는지 실제로 하나씩 찔러보고</b>, 안 되는 기능은 <b>가능한 것 중 최선</b>으로
      자동으로 낮춰서 동작합니다. 그래서 권한이 적은 계정에서도 "가능한 만큼" 튜닝할 수 있습니다.</p>

    <h4>딕셔너리 등급 — 테이블 정보를 어디까지 보는가</h4>
    <table class="help-table"><tbody>
      <tr><td class="kbd">DBA</td><td>DB 안의 <b>모든</b> 객체를 봅니다. 관리자급 계정.</td></tr>
      <tr><td class="kbd">ALL</td><td>내가 <b>접근 권한을 가진</b> 객체를 봅니다. 남의 스키마라도 권한이 있으면 보입니다. (가장 흔함)</td></tr>
      <tr><td class="kbd">USER</td><td><b>내가 소유한</b> 객체만 봅니다. 남의 테이블 정의는 안 보입니다.</td></tr>
      <tr><td class="kbd">JDBC만</td><td>딕셔너리를 아예 못 봐서, JDBC 드라이버가 대신 알려주는 최소 정보만 씁니다.</td></tr>
    </tbody></table>
    <p class="help-note">이 등급이 낮아도 튜닝은 됩니다. 다만 컬럼 타입·통계 같은 정보가 줄어
      진단의 정밀도가 조금 떨어질 뿐입니다. 딕셔너리를 전혀 못 봐도, 이 도구는 SQL 을 <b>실행하지 않고</b>
      결과 구조만 물어보는 방법(쿼리 서술)으로 컬럼 타입을 알아냅니다.</p>

    <h4>V$SQL / V$MYSTAT 를 못 쓰면? — 네, 대비돼 있습니다</h4>
    <p>V$ 뷰(실시간 성능 뷰)는 권한이 없는 경우가 특히 많습니다. 이 경우:</p>
    <ul>
      <li><b>실행계획</b>: V$SQL_PLAN(실제 계획)을 못 보면 → EXPLAIN PLAN(예상 계획)으로 대체.
        그마저 막히면 개인용 계획 테이블을 만들어 씁니다.</li>
      <li><b>부하 측정</b>: V$MYSTAT(세션 통계)를 못 보면 → 논리적 읽기 대신 <b>실행 시간</b>만으로 측정합니다.
        시간은 장비 상태에 흔들리므로, 이때는 반복 횟수를 늘려 판단합니다.</li>
      <li><b>결과 검증</b>: V$ 와 무관하게 <b>항상</b> 됩니다. 결과 행을 지문(해시)으로 비교하므로
        DB 내부 권한이 하나도 없어도 튜닝 전후가 같은 결과인지 확인할 수 있습니다.</li>
    </ul>
    <p class="help-note">즉 "V$SQL 못 쓰는 경우"는 처음부터 설계에 반영돼 있습니다. 상단의 권한 배지가
      지금 어느 경로로 동작 중인지 보여 줍니다.</p>

    <h4>"제한 N건"이란</h4>
    <p>접속한 계정이 <b>쓸 수 없는 기능의 개수</b>입니다. 예를 들어 V$SQL_MONITOR, DBA_TABLES 처럼
      권한이 없어 막힌 항목들입니다. 각 항목마다 "이게 없으면 무엇이 제한되는지"를 아래 표에 적어 두었습니다.
      대부분은 없어도 튜닝에 큰 지장이 없습니다(특히 DBA_* 는 일반 계정에 없는 게 정상입니다).</p>`,
  en: `
    <h3>Why "permissions" matter</h3>
    <p>Production accounts often can't read internal metadata for security reasons. On connect, this tool
      <b>probes what it can actually see</b>, one capability at a time, and automatically <b>degrades to the best
      available path</b> for anything blocked. So even a low-privilege account can tune "as far as possible".</p>

    <h4>Dictionary tier — how much table metadata you can see</h4>
    <table class="help-table"><tbody>
      <tr><td class="kbd">DBA</td><td>Sees <b>every</b> object in the database. Administrator-level.</td></tr>
      <tr><td class="kbd">ALL</td><td>Sees objects you <b>have access to</b>, even in other schemas. (most common)</td></tr>
      <tr><td class="kbd">USER</td><td>Sees only objects you <b>own</b>.</td></tr>
      <tr><td class="kbd">JDBC only</td><td>No dictionary access — uses minimal info from the JDBC driver.</td></tr>
    </tbody></table>
    <p class="help-note">Tuning still works at a lower tier — only diagnostic precision drops a little.
      Even with no dictionary access, the tool learns column types by <b>describing</b> the query (without running it).</p>

    <h4>What if V$SQL / V$MYSTAT are unavailable? — Yes, it's handled</h4>
    <ul>
      <li><b>Plan</b>: no V$SQL_PLAN (actual plan) → fall back to EXPLAIN PLAN (estimated). If even that is blocked,
        a private plan table is created.</li>
      <li><b>Load</b>: no V$MYSTAT (session stats) → measure by <b>elapsed time</b> only, so more repetitions are used.</li>
      <li><b>Result verification</b>: <b>always</b> works, independent of V$. Result rows are compared by hash,
        so equivalence can be checked with zero internal privileges.</li>
    </ul>
    <p class="help-note">The "V$SQL unavailable" case is designed in from the start. The badges up top show which path is active.</p>

    <h4>What "N restricted" means</h4>
    <p>The number of features your account <b>cannot use</b> (e.g. V$SQL_MONITOR, DBA_TABLES). Each is listed below
      with what it limits. Most are fine to lack — DBA_* being absent on a normal account is expected.</p>`,
  ja: `
    <h3>なぜ「権限」が重要か</h3>
    <p>本番アカウントはセキュリティ上、内部情報を見られないことが多いです。本ツールは接続直後に
      <b>何が見えるかを一つずつ実際に試し</b>、使えない機能は <b>可能な範囲で最善</b> の方法へ自動的に下げて動作します。</p>

    <h4>ディクショナリ等級 — テーブル情報をどこまで見るか</h4>
    <table class="help-table"><tbody>
      <tr><td class="kbd">DBA</td><td>DB 内の <b>すべて</b> のオブジェクト。管理者級。</td></tr>
      <tr><td class="kbd">ALL</td><td><b>アクセス権のある</b> オブジェクト。他スキーマでも権限があれば見えます。(最も一般的)</td></tr>
      <tr><td class="kbd">USER</td><td><b>自分が所有する</b> オブジェクトのみ。</td></tr>
      <tr><td class="kbd">JDBC のみ</td><td>ディクショナリ不可。JDBC ドライバの最小情報のみ使用。</td></tr>
    </tbody></table>
    <p class="help-note">等級が低くてもチューニングは可能で、診断の精度が少し下がるだけです。
      ディクショナリが全く見えなくても、SQL を <b>実行せず</b> 結果構造だけ問い合わせて列型を把握します。</p>

    <h4>V$SQL / V$MYSTAT が使えない場合は? — はい、対応済みです</h4>
    <ul>
      <li><b>実行計画</b>: V$SQL_PLAN(実際) 不可 → EXPLAIN PLAN(予想) へ。それも不可なら個人用計画表を作成。</li>
      <li><b>負荷計測</b>: V$MYSTAT 不可 → <b>実行時間</b> のみで計測(反復回数を増やして判断)。</li>
      <li><b>結果検証</b>: V$ と無関係に <b>常に</b> 可能。結果行をハッシュで比較します。</li>
    </ul>
    <p class="help-note">「V$SQL が使えない場合」は最初から設計に含まれています。上部のバッジで現在の経路が分かります。</p>

    <h4>「制限 N件」とは</h4>
    <p>接続アカウントが <b>使えない機能の数</b> です(例: V$SQL_MONITOR, DBA_TABLES)。多くは無くても支障ありません。</p>`,
  zh: `
    <h3>为何"权限"很重要</h3>
    <p>生产账号出于安全常无法读取内部信息。本工具在连接后 <b>逐项实际探测能看到什么</b>，
      对受阻的功能自动 <b>降级到可用的最佳路径</b>。因此低权限账号也能"尽力"调优。</p>

    <h4>数据字典等级 — 能看到多少表信息</h4>
    <table class="help-table"><tbody>
      <tr><td class="kbd">DBA</td><td>可见库中 <b>所有</b> 对象。管理员级。</td></tr>
      <tr><td class="kbd">ALL</td><td>可见 <b>你有权限访问</b> 的对象，即使在他人模式下。(最常见)</td></tr>
      <tr><td class="kbd">USER</td><td>仅可见 <b>你拥有</b> 的对象。</td></tr>
      <tr><td class="kbd">仅 JDBC</td><td>无字典访问，仅用 JDBC 驱动提供的最小信息。</td></tr>
    </tbody></table>
    <p class="help-note">等级低仍可调优，只是诊断精度略降。即使完全无字典访问，
      工具也会 <b>不执行</b> SQL、仅描述查询来获取列类型。</p>

    <h4>若 V$SQL / V$MYSTAT 不可用？—— 是的，已应对</h4>
    <ul>
      <li><b>执行计划</b>：无 V$SQL_PLAN(实际) → 退回 EXPLAIN PLAN(预估)。若仍受阻，则创建私有计划表。</li>
      <li><b>负载测量</b>：无 V$MYSTAT → 仅用 <b>执行时间</b> 测量(增加重复次数判断)。</li>
      <li><b>结果验证</b>：与 V$ 无关，<b>始终</b> 可用。以哈希比较结果行。</li>
    </ul>
    <p class="help-note">"V$SQL 不可用"从设计之初即已考虑。顶部徽章显示当前所走路径。</p>

    <h4>"受限 N 项"是什么</h4>
    <p>你的账号 <b>无法使用的功能数</b>(如 V$SQL_MONITOR、DBA_TABLES)。多数缺失并无大碍。</p>`
};

const CAPS_SECTION_TITLE = {
  ko: '지금 이 접속의 실제 권한', en: 'This connection\'s actual permissions',
  ja: 'この接続の実際の権限', zh: '当前连接的实际权限'
};
const CAPS_NOT_CONNECTED = {
  ko: '접속하면 지금 이 계정에서 무엇이 되고 안 되는지 여기에 실제 상태로 표시됩니다.',
  en: 'Connect to see the real, per-capability status for this account here.',
  ja: '接続すると、このアカウントで何ができるかの実状態がここに表示されます。',
  zh: '连接后此处将显示该账号的真实逐项状态。'
};
const TIER_LABELS = {
  ko: { plan: '실행계획', runtime: '부하 계측', dictionary: '딕셔너리' },
  en: { plan: 'Plan', runtime: 'Load metering', dictionary: 'Dictionary' },
  ja: { plan: '実行計画', runtime: '負荷計測', dictionary: 'ディクショナリ' },
  zh: { plan: '执行计划', runtime: '负载计量', dictionary: '数据字典' }
};
const RESTRICTED_LABEL = {
  ko: '제한된 기능', en: 'Restricted features', ja: '制限された機能', zh: '受限功能'
};
const AVAILABLE_LABEL = { ko: '사용 가능', en: 'Available', ja: '利用可', zh: '可用' };

function capsHtml(lang) {
  let live = '';
  const caps = session.capabilities;
  if (session.connected && caps) {
    const tiers = caps.tiers || {};
    const tl = TIER_LABELS[lang];
    const badges = `
      <div class="cap-live-tiers">
        <span class="cap-badge lv-best">${esc(tl.plan)}: ${esc(tiers.planLabel || '-')}</span>
        <span class="cap-badge lv-best">${esc(tl.runtime)}: ${esc(tiers.runtimeLabel || '-')}</span>
        <span class="cap-badge lv-best">${esc(tl.dictionary)}: ${esc(tiers.dictionaryLabel || '-')}</span>
      </div>`;

    const degraded = caps.degraded || [];
    let restricted = '';
    if (degraded.length) {
      const rows = degraded.map((d) => `<tr>
        <td class="kbd">${esc(d.label)}</td>
        <td>${esc(d.impact)}${d.reason ? `<br><span class="help-reason">${esc(d.reason)}</span>` : ''}</td>
      </tr>`).join('');
      restricted = `<h4>${esc(RESTRICTED_LABEL[lang])} (${degraded.length})</h4>
        <table class="help-table cap-restricted"><tbody>${rows}</tbody></table>`;
    }

    const items = (caps.items || []);
    const okItems = items.filter((i) => i.available);
    const avail = okItems.length
      ? `<details class="help-details"><summary>${esc(AVAILABLE_LABEL[lang])} (${okItems.length})</summary>
          <div class="cap-ok-list">${okItems.map((i) => `<span class="cap-badge lv-best">${esc(i.label)}</span>`).join('')}</div></details>`
      : '';

    live = `<div class="cap-live">
      <h3>${esc(CAPS_SECTION_TITLE[lang])}</h3>
      ${badges}
      ${restricted}
      ${avail}
    </div><hr class="help-hr">`;
  } else {
    live = `<div class="cap-live"><h3>${esc(CAPS_SECTION_TITLE[lang])}</h3>
      <p class="help-note">${esc(CAPS_NOT_CONNECTED[lang])}</p></div><hr class="help-hr">`;
  }
  return live + (CAPS_INTRO[lang] || CAPS_INTRO.ko);
}

// ══════════════════════════════════════════════════════════════════════════
//  정보 / 크레딧
// ══════════════════════════════════════════════════════════════════════════

const YEAR = '2026';

const ABOUT = {
  ko: aboutHtml('ko'),
  en: aboutHtml('en'),
  ja: aboutHtml('ja'),
  zh: aboutHtml('zh')
};

function aboutHtml(lang) {
  const L = {
    ko: {
      about: '정보', desc: 'Oracle SQL 을 JDBC 로 실제 실행해 튜닝하는 도구입니다.',
      built: '사용 기술',
      grid: '데이터 그리드 · 차트: <b>Open Grid</b> (MIT 라이선스)',
      jdbc: 'DB 접근: Oracle JDBC (ojdbc) · Java 브리지',
      links: '링크', home: '홈페이지', contact: '문의',
      license: '라이선스: MIT License',
      copyright: `© ${YEAR} foxnail. All rights reserved.`,
      note: '이 프로그램은 Open Grid 를 데이터 그리드와 차트 렌더링에 사용합니다.',
      ogTitle: 'Open Grid 정보',
      ogOpen: '<b>Open Grid</b> 는 오픈소스 데이터 그리드입니다. <b>MIT 라이선스</b>라 누구나 자유롭게 수정·사용할 수 있습니다.',
      ogGuide: '가이드',
      supportTitle: '개발자를 응원해 주세요 🙏',
      supportText: '이 도구가 도움이 되셨다면, 개발자를 위해 아래 두 앱을 휴대폰에 설치하고 즐겨 주세요. 큰 힘이 됩니다.',
      appLotto: '로또 스도쿠 (Google Play)',
      appLottoDesc: '한국 로또는 물론 미국 파워볼과 각국 로또의 번호 생성을 지원합니다.',
      appArt: '아트 그리드 (Google Play)',
      iosNote: '여력이 되면 아이폰 사용자를 위해서도 만들어 보겠습니다.',
      shareNote: '앱이 만족스러우면 앱의 공유 기능으로 주위 분들께 전해 주시면 참으로 감사하겠습니다.',
      disclaimerTitle: 'SQL 최종 검증은 사용자 책임입니다',
      disclaimer: '이 도구는 튜닝 후보를 만들고 성능·결과를 <b>측정하여 근거를 제시</b>할 뿐입니다. ' +
        '측정은 표본이고 실제 운영 환경(데이터량·통계·부하·바인드 값)과 다를 수 있습니다. ' +
        '<b>운영에 반영하기 전 반드시 사용자가 결과를 최종 검증</b>하고, 그 적용 책임은 사용자에게 있습니다. ' +
        '제작자는 이 도구 사용으로 발생한 결과에 대해 책임지지 않습니다.'
    },
    en: {
      about: 'About', desc: 'A tool that tunes Oracle SQL by running it for real over JDBC.',
      built: 'Built with',
      grid: 'Data grid & charts: <b>Open Grid</b> (MIT license)',
      jdbc: 'DB access: Oracle JDBC (ojdbc) · Java bridge',
      links: 'Links', home: 'Homepage', contact: 'Contact',
      license: 'License: MIT License',
      copyright: `© ${YEAR} foxnail. All rights reserved.`,
      note: 'This program uses Open Grid for its data grid and chart rendering.',
      ogTitle: 'About Open Grid',
      ogOpen: '<b>Open Grid</b> is an open-source data grid. Under the <b>MIT license</b>, anyone may freely modify and use it.',
      ogGuide: 'Guide',
      supportTitle: 'Support the developer 🙏',
      supportText: 'If this tool helped you, please install and enjoy the two apps below on your phone — it means a lot to the developer.',
      appLotto: 'Lotto Sudoku (Google Play)',
      appLottoDesc: 'Generates numbers not only for the Korean Lotto but also for the US Powerball and lotteries in many other countries.',
      appArt: 'Art Grid (Google Play)',
      iosNote: 'If time allows, I will try to make iPhone versions too.',
      shareNote: 'If you enjoy an app, sharing it with people around you via its share feature would be deeply appreciated.',
      disclaimerTitle: 'Final SQL validation is the user\'s responsibility',
      disclaimer: 'This tool only generates candidates and <b>presents evidence by measuring</b> performance and results. ' +
        'Measurements are samples and may differ from real production (data volume, statistics, load, bind values). ' +
        '<b>Always validate results yourself before applying to production</b>; the responsibility for applying them rests with the user. ' +
        'The author is not liable for any outcome of using this tool.'
    },
    ja: {
      about: '情報', desc: 'Oracle SQL を JDBC で実際に実行してチューニングするツールです。',
      built: '使用技術',
      grid: 'データグリッド・チャート: <b>Open Grid</b> (MIT ライセンス)',
      jdbc: 'DB アクセス: Oracle JDBC (ojdbc) · Java ブリッジ',
      links: 'リンク', home: 'ホームページ', contact: 'お問い合わせ',
      license: 'ライセンス: MIT License',
      copyright: `© ${YEAR} foxnail. All rights reserved.`,
      note: '本プログラムはデータグリッドとチャート描画に Open Grid を使用しています。',
      ogTitle: 'Open Grid について',
      ogOpen: '<b>Open Grid</b> はオープンソースのデータグリッドです。<b>MIT ライセンス</b>なので、誰でも自由に改変・利用できます。',
      ogGuide: 'ガイド',
      supportTitle: '開発者を応援してください 🙏',
      supportText: 'このツールが役立ったら、開発者のために下記の 2 つのアプリをスマホに入れて楽しんでください。とても励みになります。',
      appLotto: 'ロト数独 (Google Play)',
      appLottoDesc: '韓国ロトはもちろん、米国パワーボールや各国の宝くじの番号生成に対応しています。',
      appArt: 'アートグリッド (Google Play)',
      iosNote: '余裕ができれば iPhone 版も作ってみます。',
      shareNote: 'アプリが気に入ったら、共有機能で周りの方に伝えていただけると大変ありがたいです。',
      disclaimerTitle: 'SQL の最終検証は利用者の責任です',
      disclaimer: 'このツールは候補を生成し、性能・結果を <b>計測して根拠を提示</b> するだけです。 ' +
        '計測は標本であり、実運用(データ量・統計・負荷・バインド値)と異なる場合があります。 ' +
        '<b>本番反映の前に必ず利用者が結果を検証</b> し、その適用責任は利用者にあります。 ' +
        '作者は本ツールの使用による結果について責任を負いません。'
    },
    zh: {
      about: '关于', desc: '通过 JDBC 实际执行来调优 Oracle SQL 的工具。',
      built: '使用技术',
      grid: '数据网格与图表：<b>Open Grid</b>(MIT 许可)',
      jdbc: '数据库访问：Oracle JDBC (ojdbc) · Java 桥接',
      links: '链接', home: '主页', contact: '联系',
      license: '许可证：MIT License',
      copyright: `© ${YEAR} foxnail. 保留所有权利。`,
      note: '本程序使用 Open Grid 进行数据网格与图表渲染。',
      ogTitle: '关于 Open Grid',
      ogOpen: '<b>Open Grid</b> 是开源数据网格。采用 <b>MIT 许可</b>，任何人都可自由修改和使用。',
      ogGuide: '指南',
      supportTitle: '支持开发者 🙏',
      supportText: '如果本工具对你有帮助，请在手机上安装并体验下面两款应用 —— 对开发者是很大的鼓励。',
      appLotto: '乐透数独 (Google Play)',
      appLottoDesc: '不仅支持韩国乐透，还支持美国强力球以及各国彩票的号码生成。',
      appArt: 'Art Grid (Google Play)',
      iosNote: '有余力的话，也会尝试为 iPhone 用户制作。',
      shareNote: '如果你喜欢这款应用，通过应用的分享功能推荐给身边的人将不胜感激。',
      disclaimerTitle: 'SQL 的最终验证由用户负责',
      disclaimer: '本工具仅生成候选并 <b>通过测量提供依据</b>。 ' +
        '测量为抽样，可能与真实生产环境(数据量、统计、负载、绑定值)不同。 ' +
        '<b>应用到生产前请务必自行验证结果</b>，应用责任由用户承担。 ' +
        '作者不对使用本工具产生的任何后果负责。'
    }
  }[lang];

  return `
    <h3>Oracle Tuner</h3>
    <p>${esc(L.desc)}</p>

    <h4>${esc(L.built)}</h4>
    <ul class="help-list">
      <li>${L.grid}</li>
      <li>${esc(L.jdbc)}</li>
    </ul>

    <h4>${esc(L.ogTitle)}</h4>
    <p>${L.ogOpen}</p>
    <ul class="help-list">
      <li>${esc(L.ogGuide)}: <a href="${PROJECT.openGrid.guide}" target="_blank" rel="noopener">${esc(PROJECT.openGrid.guide)}</a></li>
      <li>GitHub: <a href="${PROJECT.openGrid.repo}" target="_blank" rel="noopener">${esc(PROJECT.openGrid.repo)}</a></li>
    </ul>

    <h4>${esc(L.links)}</h4>
    <ul class="help-list">
      <li>Oracle Tuner (${esc(PROJECT.license)}): <a href="${PROJECT.repo}" target="_blank" rel="noopener">${esc(PROJECT.repo)}</a></li>
      <li>${esc(L.home)}: <a href="${PROJECT.home}" target="_blank" rel="noopener">${esc(PROJECT.home)}</a></li>
      <li>${esc(L.contact)}: <a href="mailto:${PROJECT.contact}">${esc(PROJECT.contact)}</a></li>
    </ul>

    <div class="help-support">
      <div class="help-support-title">${esc(L.supportTitle)}</div>
      <div>${esc(L.supportText)}</div>
      <div class="help-apps">
        <a class="help-app" href="https://play.google.com/store/apps/details?id=com.foxnail.lotto_sudoku" target="_blank" rel="noopener">
          <span class="help-app-name">🎱 ${esc(L.appLotto)}</span>
          <span class="help-app-desc">${esc(L.appLottoDesc)}</span>
          <span class="help-app-url">https://play.google.com/store/apps/details?id=com.foxnail.lotto_sudoku</span>
        </a>
        <a class="help-app" href="https://play.google.com/store/apps/details?id=com.artgrid.app.free" target="_blank" rel="noopener">
          <span class="help-app-name">🎨 ${esc(L.appArt)}</span>
          <span class="help-app-url">https://play.google.com/store/apps/details?id=com.artgrid.app.free</span>
        </a>
      </div>
      <div class="help-support-sub">${esc(L.shareNote)}</div>
      <div class="help-support-sub">${esc(L.iosNote)}</div>
    </div>

    <div class="help-disclaimer">
      <div class="help-disclaimer-title">⚠ ${esc(L.disclaimerTitle)}</div>
      <div>${L.disclaimer}</div>
    </div>

    <hr class="help-hr">
    <p class="help-note">${esc(L.note)}</p>
    <p class="help-copyright">${esc(L.license)} · ${esc(L.copyright)}</p>`;
}
