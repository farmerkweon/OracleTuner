# FIX SPEC · Slice B (그리드) — 항목 #9(서브그리드 확대 팝업), #8(휠 스크롤)

작성: P-UI(designer 레인) · 2026-07-30. 실행 에이전트(executor)는 이 문서대로 구현한다.
추측 필요한 지점은 남기지 않으려 했으나, 실제 브라우저 확인은 이 환경에 GUI 도구가 없어
못 했다 — 구현 후 반드시 실제로 열어서 확인할 것 (검증 절 참조).

파일 소유권(이 슬라이스 전용): `web/js/gridkit.js`, `web/css/app.css`(추가 전용 — Slice A 가
이미 다녀간 라인은 건드리지 않는다), `web/js/views/candidates.js`.

---

## 사실관계 재확인 (구현 전 반드시 알아야 할 것 — 정찰 R2 의 일부 가설을 갱신한다)

### 서브그리드(masterDetail)는 앱에 총 5곳 있고, 높이가 제각각이다

R2 정찰은 "gridkit.js:242-254, 높이 200px 고정" 하나만 짚었지만, 실제로는:

| 위치 | 함수 | `height` | 용도 |
|---|---|---|---|
| `gridkit.js:171-184` | `renderPlan` | 170 | 실행계획 트리 상세 |
| `gridkit.js:240-255` | `renderFindings` | 200 | 진단(지적사항) 상세 |
| `candidates.js:119-133` | 후보 1단계 그리드 | 280 | 후보 상세 |
| `candidates.js:256-280` | 순위표 그리드 | 340 | 순위 상세 |
| `candidates.js:304-320` | 제외 후보 그리드 | 300 | 제외 사유 상세 |

다섯 곳 모두 `heightMode: 'auto'` 를 옵션에 주고 있지만 **이건 실제로 동작하지 않는다** —
아래 근거를 보라. 그래서 다섯 곳 모두 사실상 "고정 높이 + 내부 스크롤"이다. 이 문서의 처방은
5곳 **전부**에 동일하게 적용한다 (200px 짜리 하나만이 아니다).

### `heightMode: 'auto'` 는 라이브러리가 무시하고 강제로 'fixed' 로 동작시킨다 — 확정 증거

`node_modules/open-grid/dist/OpenGrid-sI_vdHQw.js` 를 역참조한 결과, 라이브러리 자신이 콘솔에
남기는 경고문을 찾았다:

```
"[OpenGrid] masterDetail.heightMode:'auto' 는 Spike-B(가변높이 VirtualScroll) 통과 전까지
 미공개 기능입니다. 'fixed' 로 동작합니다(11_design_F2_v2.md §2.2/C12.2)."
```

즉 우리 쪽 코드가 `heightMode:'auto'` 를 주더라도 라이브러리는 그걸 무시하고 `height` 숫자값
그대로 고정 높이로 그린다. **"내용에 맞춰 늘어나게 한다"는 근본 해결은 이 앱 코드로는 불가능
하다** (라이브러리 자체 기능이 아직 없다고 라이브러리가 스스로 밝히고 있다). 그래서 이번
슬라이스는 "라이브러리를 못 늘리니, 대신 확대해서 볼 수 있는 통로를 만든다"는 방향으로 간다.

### 서브그리드 패널은 이미 `overscroll-behavior: contain` 이 걸려 있다 — #8 원인의 실마리

같은 파일에서 `_appendDetailPanel` 이 만드는 `.og-detail-panel` 의 인라인 스타일:

```
position:absolute;left:0; top:${s}px;width:${o}px;height:${i}px;
box-sizing:border-box; overflow-y:auto;overflow-x:auto;
overscroll-behavior:contain;
background:var(--og-detail-bg,#fff); ...
```

`overscroll-behavior: contain` 이 **이미 라이브러리 기본값으로 걸려 있다.** 이건 R2 정찰의
회피안 후보 중 하나("overscroll-behavior: contain 적용")가 **이미 구현돼 있어서 우리가 추가로
할 게 없다**는 뜻이다. 동시에 이게 바로 #8 증상의 유력한 원인이기도 하다 — 아래 판단 절에서
설명한다.

---

## 과제 2 — 서브그리드 확대 팝업

### 설계 개요

각 masterDetail 상세 패널(위 5곳)의 콘텐츠 우측 상단에 **확대(↗) 아이콘 버튼**을 하나 붙인다.
누르면 **같은 내용을 훨씬 큰 모달**에 다시 그린다. 내용을 새로 만드는 함수는 재사용하고
(문자열을 복제하지 않는다), 모달 자체는 기존 `.modal-backdrop`/`.modal` 을 확장한 새 크기
변형(`.modal-xl`) 하나만 추가한다.

### 2-1. 아이콘 (`web/js/icons.js` 확인 결과)

`icons.js` 는 `data-icon="role"` 정적 방식과 `icon(role, size)` 동적(문자열 반환) 방식 둘 다
지원한다. 이 앱은 이미 `data-icon="expand"` 를 워크벤치 툴바 "*펼치기" 버튼에 쓰고 있다
(`index.html:126`) — 그러니 **`expand` 는 다른 의미로 이미 쓰이는 아이콘**이라 확대 버튼에
재사용하면 사용자가 헷갈린다. 새 역할로 `arrows-fullscreen` (Bootstrap Icons 실제 아이콘명 —
`icons.js` 주석상 "그 밖의 Bootstrap 아이콘 이름도 대체로 렌더된다"에 해당하는 케이스)을 쓴다.

**중요 — `applyIcons()` 재실행 문제**: `applyIcons()` 는 `app.js:56` 에서 앱 시작 시 1회,
언어 변경 시 1회만 호출된다. masterDetail 렌더러가 만드는 동적 HTML 안의 `data-icon` 은
그 이후로 다시 스캔되지 않으므로 **채워지지 않는다.** 그러니 이 버튼은 `data-icon` 정적
속성이 아니라 **`icon()` 함수를 직접 호출**해 SVG 문자열을 즉시 삽입하는 방식으로 만든다
(아래 코드 참조). `icon()`/`iconLabel()` 은 이미 실패 시 빈 문자열을 반환하도록 방어돼 있다
(`icons.js:24-30`) — 만약 `arrows-fullscreen` 이 렌더되지 않으면(런타임에 빈 문자열이면)
버튼에 아이콘 없이 텍스트만 남는데, 이 경우 `icon('search', 14)` 로 대체하고 로그에
`WARN B-2 arrows-fullscreen 아이콘 렌더 실패 — search 로 대체` 를 남길 것. **구현 후 반드시
브라우저에서 버튼에 아이콘이 실제로 보이는지 확인.**

### 2-2. 버튼 위치·크기·호버

기존 `.detail-panel` 클래스(모든 상세 패널 콘텐츠의 공통 최상위 wrapper — `candDetailHtml`,
`planDetailHtml`, `findingDetailHtml` 세 함수가 전부 `<div class="detail-panel">...</div>`
를 반환)를 그대로 앵커로 쓴다. 새 클래스는 버튼 하나(`.detail-expand-btn`)만 추가한다.

`web/css/app.css` — `.detail-panel` 블록 근처(현재 라인 760-767, Slice A 가 건드리지 않은
구간)에 추가:

```css
.detail-panel { position: relative; padding: 12px 16px; font-size: 12.5px; line-height: 1.75; }
.detail-panel h4 { margin: 0 0 6px; padding-right: 30px; font-size: 12.5px; color: var(--primary); }
.detail-expand-btn { position: absolute; top: 8px; right: 10px; z-index: 3; }
```
(`.detail-panel`/`.detail-panel h4` 는 기존 규칙에 `position:relative`/`padding-right:30px`
만 추가하는 것 — 기존 다른 속성은 그대로 둔다. `h4` 에 오른쪽 여백을 미리 확보해 두면 제목이
길어져도 버튼과 안 겹친다.)

버튼 자체는 새 시각 스타일을 만들지 말고 **기존 `.btn.btn-icon.btn-ghost` 조합을 재사용**한다
(이미 `index.html` 전역에서 아이콘 전용 고스트 버튼에 쓰는 조합 — `btn-icon` 은 패딩만
줄이고(`app.css:466-468`), `btn-ghost` 는 배경을 투명하게 하고 호버 시 `#eef1f4` 배경을
준다(`app.css:460-461`)). `.detail-expand-btn` 클래스는 **위치 지정 전용**이고 색/크기는
기존 클래스에서 그대로 상속한다 — 이래서 새 클래스를 최소화한다.

크기: `.btn-icon .ic svg { width:16px;height:16px }` 규칙을 그대로 타므로 16px 아이콘,
버튼 전체는 패딩 포함 약 28×28px — 다른 아이콘 버튼(`#btn-sql-del` 등)과 동일한 터치 타깃.

호버: 기존 `.btn-ghost:hover:not(:disabled)` 규칙이 자동 적용된다(배경 `#eef1f4`,
`border-color: var(--border)`). 추가 규칙 불필요.

### 2-3. 팝업 크기 정책

```css
.modal-xl { width: min(1200px, 96vw); height: min(860px, 92vh); }
.modal-xl .modal-body { flex: 1; min-height: 0; }
```
기존 `.modal { width:min(940px,94vw); max-height:90vh; display:flex; flex-direction:column }`
바로 아래(`app.css:494` `.modal-narrow` 규칙 옆)에 추가한다 — `.modal-narrow` 가 작은 쪽
변형이니 `.modal-xl` 은 큰 쪽 변형으로 나란히 둔다.

- **왜 `height`(고정)이지 `max-height` 가 아닌가**: 서브그리드 상세는 내용 길이가 들쭉날쭉하다
  (실행계획 상세는 짧고, 후보 diff+회차표는 길다). `max-height` 만 쓰면 짧은 내용일 때 모달이
  작게 오그라들어 "확대"라는 행위의 심리적 효과가 떨어진다. `height: min(860px, 92vh)` 로
  고정해 항상 큼직하게 열리고, 내용은 `.modal-body{overflow:auto}` 로 그 안에서만 스크롤되게
  한다 — 스크롤 컨테이너가 **하나뿐**이라 #8 에서 겪는 중첩 스크롤 문제가 애초에 생기지 않는다.
- 최대: 96vw / 92vh (작은 화면에서도 여백 남김). 최소는 별도로 안 둔다 — `min()` 특성상
  뷰포트가 1200px/860px 보다 작아지면 자동으로 뷰포트 비율로 줄어든다.
- 제목줄(`.modal-head h2`)에는 **그 상세가 무엇인지 식별 가능한 텍스트**를 넣는다. 다섯
  호출부마다 다음을 쓴다: 실행계획→`${r.opFull} — 실행계획 상세`, 진단→`${f.title}`,
  후보 3곳→`${row.title}`. (이미 각 `*DetailHtml` 함수의 `<h4>` 에 쓰던 문자열을 재사용하면
  된다 — 새로 지을 필요 없음.)

### 2-4. DOM 구조 · 닫기 수단 · 접근성 (신규 — 기존 5개 모달은 이 기준을 만족 못 함, 아래 참고)

**참고**: `web/js/views/library.js:56,410,425,432` 등 기존 모달들은 `hidden` 토글 +
`Escape` 키 개별 리스너 정도만 있고, `role="dialog"`/`aria-modal`/포커스 트랩/포커스 복원이
**전혀 없다.** 이번에 새로 만드는 서브그리드 확대 모달은 과제 요건상 이걸 다 갖춰야 하므로,
기존 패턴을 그대로 베끼지 말고 아래 스펙대로 만든다. (기존 5개 모달을 같은 수준으로
끌어올리는 건 이 슬라이스 범위 밖 — 손대지 않는다.)

`web/js/gridkit.js` 끝부분에 새 섹션으로 추가 (다른 export 함수들과 나란히):

```js
import { icon } from './icons.js';

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
  if (!svg) svg = icon('search', 14); // 폴백 — 구현 후 실제 렌더 여부 확인 필수
  btn.innerHTML = `<span class="ic">${svg}</span>`;
  btn.addEventListener('click', () => openDetailModal(title, renderContent));
  panel.prepend(btn);
}
```

CSS 1줄 추가 (body 스크롤 잠금 — 배경이 모달 뒤에서 따로 스크롤되는 걸 막는다. Slice A 가
`body` 의 `overflow:hidden` 을 없앴으므로 이 클래스가 없으면 모달 열려 있어도 배경 페이지가
스크롤된다):
```css
body.modal-open { overflow: hidden; }
```
`app.css` 의 `body { ... }` 규칙(Slice A 가 수정한 라인, 대략 43-50) **바로 다음 줄**에 추가.
Slice A 가 쓴 기존 선언은 건드리지 않는다.

**닫기 수단 3가지** — 위 코드에 이미 구현됨: ESC 키(`_onDetailModalKeydown`), 배드롭 클릭
(`backdrop === e.target` 검사 — `.modal` 내부 클릭은 버블링돼도 target 이 backdrop 이 아니므로
안 닫힘), X 버튼(`[data-close]`). **포커스 트랩**은 Tab/Shift+Tab 순환(`_focusableIn` +
첫/마지막 요소 판정), **포커스 복원**은 열기 직전 `document.activeElement` 를 저장했다가
닫을 때 되돌림. `role="dialog"` + `aria-modal="true"` + `aria-labelledby` 는 마크업에 이미
포함.

### 2-5. 다섯 호출부 수정 — 각각 "인라인 렌더 로직을 이름 있는 함수로 분리 + wireDetailExpand 호출" 패턴

지금은 각 masterDetail 의 `renderer` 가 익명 화살표 함수라 인라인 패널과 모달에서 **같은
렌더링을 두 번 재사용**하려면 이름 붙은 함수로 뽑아야 한다. 다섯 곳 전부 같은 패턴:

**`gridkit.js` renderPlan (171-184번째 줄 근처)** — 기존:
```js
masterDetail: {
  enabled: true, height: 170, heightMode: 'auto', expandMultiple: true,
  renderer: (row, hostEl) => { hostEl.innerHTML = planDetailHtml(row); }
}
```
변경 후:
```js
masterDetail: {
  enabled: true, height: 170, heightMode: 'auto', expandMultiple: true,
  renderer: (row, hostEl) => {
    const draw = (target) => { target.innerHTML = planDetailHtml(row); };
    draw(hostEl);
    wireDetailExpand(hostEl, `${row.opFull || ''}${row.objFull ? ' — ' + row.objFull : ''}`, draw);
  }
}
```

**`gridkit.js` renderFindings (240-255번째 줄 근처)** — 기존 `renderer` 안에 `onFix` 버튼
와이어링도 있으므로 `draw` 에 그것까지 포함시킨다:
```js
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
```
(모달 안에서 `[data-fix]` 를 눌러 고치는 것도 자연스럽게 동작한다 — `onFix(row)` 는 그리드
바깥의 상태를 갱신하는 콜백이라 어느 쪽에서 눌러도 같다. 다만 고친 직후 모달을 자동으로 닫을
필요는 없다 — 사용자가 결과를 계속 볼 수도 있으니 자동 닫기는 넣지 않는다.)

**`candidates.js` 세 곳(119-133, 256-280, 304-320번째 줄 근처)** — 패턴 동일, `baseline`
유무만 다르다:
```js
masterDetail: {
  enabled: true, height: 280, heightMode: 'auto', expandMultiple: true,
  renderer: (row, hostEl) => {
    const draw = (target) => { target.innerHTML = candDetailHtml(row, null); wireDetailButtons(target, row); };
    draw(hostEl);
    wireDetailExpand(hostEl, row.title, draw);
  }
}
```
(순위표 그리드는 `candDetailHtml(row, ranking.baseline)`, 제외 후보 그리드도 동일하게
`ranking.baseline` 을 넘긴다 — 기존 인자를 그대로 `draw` 클로저 안으로 옮기면 된다.)

`candidates.js` 상단 import 에 `wireDetailExpand` 추가:
```js
import { makeGrid, renderTable, renderCompareChart, wireDetailExpand } from '../gridkit.js';
```

---

## 과제 3 — 서브그리드 마우스휠이 끝까지 안 되는 문제 (#8)

### 왜 일어나는가 — 근거 기반 설명

`.og-detail-panel`(서브그리드 상세)에는 이미 `overscroll-behavior: contain` 이 걸려 있다
(위 "사실관계" 절 근거). 이 속성의 정의상 동작은: **상세 패널이 자신의 스크롤 한계(맨 위/맨
아래)에 도달하면, 남은 휠 입력을 부모 스크롤 컨테이너(바깥 행 목록, `.og-body-wrapper`)로
전달(체이닝)하지 않고 그 자리에서 흡수한다.**

이건 원래 "의도치 않게 부모가 같이 스크롤되는 것"을 막으려는 좋은 방어인데, 부작용이 있다:
사용자 입장에서는 **마우스 커서가 (작고 고정 높이인) 상세 패널 위에 있는 동안은 휠을 아무리
굴려도 그 패널 안에서만 스크롤되다가, 패널 끝에 닿는 순간 휠 입력이 조용히 사라진다.**
바깥 행 목록을 마저 스크롤하려면 사용자가 마우스를 상세 패널 바깥으로 옮겨야 하는데, 이걸
모르는 사용자에게는 "휠이 끝까지 안 먹힌다"로 느껴진다. 게다가 상세 패널은 170~340px 로
작고 콘텐츠(실행계획 술어, 후보 diff, 회차표)는 종종 그보다 길다 — 즉 이 증상이 실제로
자주 발생할 조건(작은 스크롤 영역 + 그 안의 긴 콘텐츠)을 이 앱이 이미 갖추고 있다.

이건 흔히 "중첩 스크롤 컨테이너(nested scrollable regions)" 안티패턴으로 알려진 UX 문제다 —
페이지 안에 독립적으로 스크롤되는 작은 영역이 있으면, 사용자는 그 경계를 눈으로 구분하기
어렵고 휠이 "먹혔다 안 먹혔다"하는 것처럼 느낀다. `overscroll-behavior:contain` 자체는 이미
표준 권장 완화책이라 라이브러리가 잘 넣어뒀다 — 그런데 그게 정확히는 "부모로 새는 것"만
막지, "패널이 작아서 스크롤할 게 금방 끝난다"는 근본 문제는 안 건드린다.

### R2 정찰 가설 정정
- 가설 1("가상스크롤 maxScroll 계산 오류")은 근거를 찾지 못했다 — `overscroll-behavior:contain`
  으로 완전히 설명되는 증상이라 별도 버그를 가정할 필요가 없다.
- 가설 2("중첩 시 scroll 컨테이너 중첩으로 외부 스크롤 블로킹")가 맞다. 다만 "블로킹"의
  구체적 메커니즘은 `overscroll-behavior:contain` 이 **의도한 대로** 동작한 결과다 — 버그가
  아니라 설계의 트레이드오프다. 그래서 "라이브러리를 고친다"가 아니라 "사용자가 이 경계를
  덜 마주치게 UI 를 다시 짠다"가 맞는 방향이다.

### 검토한 회피안과 기각/채택 근거

| 안 | 채택 여부 | 이유 |
|---|---|---|
| 상세 높이를 내용에 맞춰 늘리기(`heightMode:'auto'`) | 기각 | 라이브러리가 이 기능 자체를 비활성화해 뒀다(콘솔 경고로 자체 확인). 앱 코드로 우회 불가 |
| `overscroll-behavior: contain` 적용 | 해당 없음 | 이미 라이브러리가 적용 중 — 추가 작업 없음. 오히려 이게 증상의 원인 중 하나 |
| 행 수가 많으면 확대 팝업(과제2)으로 유도 | **채택(1순위)** | 아래 설명 |
| 스크롤 가능함을 알리는 시각 힌트 | 보류(2순위, 선택적) | 아래 설명 |

### 1순위 권고: 과제 2의 확대 팝업을 "회피 수단"으로 명시적으로 채택한다

**결론: #8 을 상세 패널 자체의 스크롤 동작을 고쳐서 풀지 않는다. 대신 상세 패널을 "미리보기"로
재정의하고, 제대로 읽으려면 확대 팝업(과제2)을 쓰게 유도하는 쪽을 1순위로 택한다.**

이유:
1. 근본 원인(고정 높이 + `overscroll-behavior:contain`)은 이 앱 코드 범위에서 고칠 수 없다
   (라이브러리 내부 동작이고, `contain` 을 빼면 이번엔 반대로 원치 않는 부모 스크롤 체이닝이
   생겨 더 혼란스러워진다 — 둘 다 문제인 게 아니라 "작은 패널 안에 독립 스크롤이 있다"는
   구조 자체가 문제다).
2. 확대 팝업은 스크롤 컨테이너가 `.modal-body` **하나뿐**이다. 중첩이 없으니 휠이 "끝까지 안
   된다"는 증상 자체가 애초에 발생할 수 없는 구조다 — 증상을 완화하는 게 아니라 **그 증상이
   나올 수 있는 조건 자체를 없앤다.**
3. 과제 2 를 어차피 이번 슬라이스에서 만들기 때문에 추가 구현 비용이 거의 없다 — 이미
   `wireDetailExpand` 가 다섯 곳 모두에 확대 버튼을 붙인다.
4. 시각 힌트(2순위 안)만으로는 "스크롤할 수 있다는 걸 안다"까지만 해결하고, "패널이 작아서
   자꾸 경계에 부딪힌다"는 불편함 자체는 안 없어진다. 근본적으로 더 나은 자리(팝업)로
   보내는 게 사용자 경험상 우위다.

**결정적으로 양다리 걸치지 않는다는 지시에 따라, 상세 패널 자체의 스크롤 로직에는 어떤
추가 CSS/JS 도 넣지 않는다.** (예: 높이를 임의로 좀 더 키운다든지, 별도 스크롤 이벤트
핸들러를 붙인다든지 하는 시도는 이번 슬라이스에서 하지 않는다 — 근본 해결이 안 되는 곳에
땜질을 겹겹이 쌓지 않는다는 원칙.)

### 2순위(선택적, 이번 슬라이스 필수 아님): 시각 힌트

실행에 여력이 있다면 다음 1줄을 덤으로 추가해도 좋다 — **필수는 아니다:**
```css
.detail-panel { /* 기존 규칙에 추가 */ }
.og-detail-panel::after {
  content: ''; position: sticky; bottom: 0; display: block; height: 14px; margin-top: -14px;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,.06)); pointer-events: none;
}
```
(이건 `.og-detail-panel` 이 라이브러리가 만드는 요소라 클래스 자체는 건드릴 수 있지만, 매
렌더마다 살아남는지 확인 필요 — 확실치 않으면 이번 슬라이스에서는 생략하고 팝업 유도만
한다. 위 1순위로 충분하다고 판단했으므로 시간이 부족하면 이 절은 건너뛰어도 됨.)

---

## 검증 (실행 후 반드시 수행)

1. `npm test` 통과 확인(150건 기준선 유지).
2. 브라우저 도구가 있으면: 후보 화면에서 아무 행이나 펼치고 우측 상단 확대 버튼 클릭 →
   (a) 아이콘이 보이는지, (b) 모달이 화면의 대부분을 채우는지, (c) ESC/배드롭 클릭/X 버튼
   셋 다 닫히는지, (d) 닫은 뒤 포커스가 원래 눌렀던 버튼으로 돌아오는지, (e) Tab 을 계속
   눌러도 포커스가 모달 밖으로 안 나가는지 확인.
3. 브라우저 도구가 없으면: Slice A 사례처럼 서버 기동 + curl 200 확인 + 정직하게
   `WARN B 시각검증 불가 — 코드 수정만 완료` 로 로그에 남긴다. 지어내지 않는다.
4. 실행계획/진단/후보/순위/제외 다섯 곳 **전부** 확대 버튼이 나오는지 확인 — 하나라도
   빠지면 이 스펙의 "다섯 호출부 수정" 절을 놓친 것이다.
