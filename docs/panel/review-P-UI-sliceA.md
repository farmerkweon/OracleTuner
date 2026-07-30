# UI/UX 감수 · Slice A (항목 #3, #7, #11) — P-UI (한명수)

감수 대상 커밋: `3cc6dcb`(에디터 색상), `50ce604`(기본테마 forest), `b237c04`(레이아웃/푸터)
감수자: P-UI (designer 레인, 저작자와 별개 컨텍스트)
감수 시각: 2026-07-30 (`Get-Date` 실측)

---

## 판정

**조건부 승인** — 3커밋 모두 머지 유지 가능. 단 아래 **조건 1개(og-row-selected 대비 수정)** 을
다음 슬라이스(또는 별도 1줄 패치)에서 반드시 반영할 것. 나머지는 관찰 사항으로 기록만 한다.

- 조건: `web/css/app.css` 에 `[data-og-theme="forest"] { --og-row-selected-bg: #2e7d32; }` 1줄 추가.
  이유는 아래 A-2 절 참조. **이 조건이 반영되기 전까지는 "완전 승인"으로 올리지 말 것.**
  (블로킹 결함은 아니다 — 신규 유저가 매일 보는 화면은 아니고 행 선택 시에만 노출되며,
  기존에도 있던 라이브러리 결함이라 이번 커밋이 만든 회귀는 아니다. 그래서 반려가 아니라 조건부 승인.)

---

## A-1 · 에디터 색상 (`3cc6dcb`) — 승인

### 핵심 발견: forest 테마는 에디터 색상에 **전혀 영향을 주지 않는다**

이번 커밋이 "테마 전환 대비"라며 `.sqled`/`.sqled-gutter`/`.sqled-input` 의 하드코딩 색을
`var(--panel)`/`var(--panel-2)`/`var(--text)` 로 바꿨다. 코드 자체는 정확하다. 하지만 검증 중
더 근본적인 사실을 확인했다:

- `web/css/app.css` 는 `:root` 블록이 **단 하나**뿐이다 (라인 7-38). 테마별 `:root` 오버라이드가
  **아예 존재하지 않는다** (`grep forest app.css` → 0건).
- "테마"(`#sel-theme`)가 실제로 바꾸는 것은 Open Grid 라이브러리 자체의 CSS 변수뿐이다:
  `node_modules/open-grid/dist/open-grid-themes.css:147` `[data-og-theme="forest"] { --og-primary: ...; --og-row-bg: ...; ... }`
  이 변수들(`--og-*`)은 그리드 위젯 내부에서만 쓰이고, `app.css` 의 `--panel`/`--text`/`--bg` 와는
  **이름도 다르고 연결도 안 되어 있다.**
- 즉 `.sqled` 의 배경은 사용자가 어떤 테마를 고르든 **항상** `var(--panel)` = `#ffffff` 이고,
  `.sqlt-*` 텍스트 색도 항상 같은 `#ffffff` 배경 위에서만 렌더된다.

### 결론 — 이번 커밋으로 인한 대비 회귀는 없다

`.sqlt-*` 12종 대비를 고정 배경 `#ffffff` 기준으로 실측했다 (WCAG AA 기준 4.5:1, sRGB 상대휘도 계산):

| 클래스 | 색 | 배경 | 대비 | AA(4.5:1) |
|---|---|---|---|---|
| `.sqlt-keyword` | `#0b5cad` | `#fff` | 6.67 | 통과 |
| `.sqlt-func` | `#7b4bc4` | `#fff` | 5.76 | 통과 |
| `.sqlt-string` | `#b3261e` | `#fff` | 6.54 | 통과 |
| `.sqlt-number` | `#0a7d55` | `#fff` | 5.15 | 통과 |
| `.sqlt-comment` | `#8a94a6` | `#fff` | **3.06** | **미달** |
| `.sqlt-hint` | `#0d8a5f` | `#eafaf3`(자체 배경) | 4.36 | 근소 미달 |
| `.sqlt-bind`/`.sqlt-subst` | `#c2185b` | `#fff` | 5.87 | 통과 |
| `.sqlt-qident`/`.sqlt-ident` | `#1f2430` | `#fff` | 15.52 | 통과 |
| `.sqlt-op` | `#52607a` | `#fff` | 6.34 | 통과 |
| `.sqlt-punct` | `#7a869a` | `#fff` | **3.68** | **미달** |
| `.sqlt-unknown` | `#b3261e` | `#fff` | 6.54 | 통과 |

`.sqlt-comment`(3.06)와 `.sqlt-punct`(3.68)는 AA 를 못 넘긴다. **다만 이건 forest 기본화나
이번 3커밋과 무관한 기존 결함이다** — 배경이 항상 `#ffffff` 였으므로 이 수치는 커밋 전에도
동일했다. 이번 슬라이스의 판정 범위 밖이므로 반려 사유로 삼지 않는다. 별도 티켓으로
`.sqlt-comment`(주석, 회색조를 조금 더 진하게: `#8a94a6`→`#748094` 권장, 대비 4.51 예상)와
`.sqlt-punct`(`#7a869a`→`#6c7992` 권장)를 손보길 제안한다. (에디터는 `web/js/editor.js` 소유라
이번 슬라이스 파일 소유권 밖 — Slice A 실행 에이전트도 건드리지 않았다.)

### 부가 관찰 — "테마"라는 이름과 실제 효과의 불일치

`forest`/`ocean`/`indigo`/`dark` 등 8개 테마 옵션이 있지만, 실제로 바뀌는 건 그리드 헤더/행/선택
색뿐이다. 상단바·에디터·버튼·푸터·모달은 어떤 테마를 골라도 시각적으로 동일하다. 발주자가
"기본 테마를 forest 로" 라고 요청했을 때 기대한 그림(도구 전체가 초록빛 톤)과 실제 결과(그리드
칸만 옅은 초록) 사이에 괴리가 있을 수 있다. 이건 이번 커밋의 결함이 아니라 애초 설계(`--og-*`
와 `--panel/--text/--bg` 가 분리된 2계층 테마 구조)의 한계다. 발주자에게 "그리드만 초록으로
바뀝니다"라고 기대치를 맞춰주거나, 원한다면 향후 슬라이스에서 `[data-og-theme="forest"]` 선택자에
`--bg`/`--panel` 오버라이드를 추가해 앱 전체 톤을 맞추는 별도 작업을 제안한다 (지금 범위 아님).

---

## A-2 · 기본 테마 forest (`50ce604`) — 조건부 승인 (구체적 결함 1건)

### 실측 결함 — 선택된 행의 흰 글자가 AA 미달

forest 테마가 기본이 되면서 모든 신규 사용자가 매일 보는 화면이 됐다. 그리드에서 행을
선택하면 `--og-row-selected-bg`(`#388e3c`) 위에 `--og-row-selected-color`(`#ffffff`)로 글자를
그린다 (`node_modules/open-grid/dist/open-grid-themes.css:159-160`).

**대비 실측: 4.12:1 — WCAG AA 본문 텍스트 기준(4.5:1) 미달.** (AA Large-text 3:1은 통과하지만
그리드 셀 텍스트는 13px 내외라 Large-text 예외에 해당하지 않는다.)

다른 테마와 비교하면 왜 forest 만 문제인지 드러난다: `default`/`dark` 등 대부분 테마는
selected-bg 를 더 어둡게 잡아(예: dark 테마의 primary `#42a5f5` 류) 흰 글자 대비를 확보하는데,
forest 는 `og-primary`(`#388e3c`, 원색에 가까운 중간 채도 녹색)를 그대로 selected-bg 로 써서
어두운 톤이 부족하다.

### 처방

```css
/* app.css 끝부분(og-* 오버라이드가 아직 없으므로 새 섹션으로 추가) */
[data-og-theme="forest"] {
  --og-row-selected-bg: #2e7d32; /* 같은 테마의 --og-primary-dark 재사용 — 새 색 도입 안 함 */
}
```
근거: `#2e7d32` 는 forest 테마가 이미 `--og-primary-dark` 로 정의해 둔 값이라 팔레트에서
벗어나지 않는다. 흰 글자 대비를 재계산하면 **5.13:1 — AA 통과**(그리고 AAA 7:1에도 근접).
이 규칙은 이번 3커밋이 건드리지 않은 `app.css` 맨 뒤에 새 블록으로 추가하면 되므로 다른
슬라이스와 파일 충돌이 없다.

이 조건이 반영되기 전까지 **완전 승인으로 격상하지 말 것.** 다만 이미 머지된 3커밋 자체를
되돌릴 필요는 없다 — 신규 1줄 CSS 로 국소 수정 가능한 결함이라 반려보다 조건부 승인이 맞다.

### 나머지 항목 검증
- 마크업(`selected` 속성) + JS 기본값 로직(`DEFAULT_THEME`, 구버전 값 방어)은 정확하다. 코드
  리뷰 관점에서 흠 없음.
- `localStorage` 에 이미 다른 테마를 저장해 둔 기존 사용자는 이번 변경의 영향을 받지 않는다
  (의도된 동작 — 사용자 선택 우선).

---

## A-3 · 레이아웃/푸터 (`b237c04`) — 승인

### 기술 판단: flexbox sticky-footer 패턴은 정확하고, 스펙 문자 그대로보다 안전하다

실행 에이전트가 스펙 원문(`#views` 를 `min-height` 로 단순 치환)을 문자 그대로 따르지 않고
`body { display:flex; flex-direction:column } + #views { flex:1 0 auto }` 로 대체한 판단에 동의한다.
CSS Flexbox 명세상 flex-basis:auto + flex-grow>0 인 flex item 은 레이아웃 후 **definite size** 로
취급된다(퍼센티지 자손 해석 목적) — `#views` 의 자손들(`.view{height:100%}` 체인, 결국
`.sqled{position:absolute;inset:0}`)이 붕괴하지 않는 이유가 여기 있다. 이건 CSS-Tricks 등에서
"sticky footer" 표준 패턴으로 통용되는 기법과 동일한 구조라 신뢰도가 높다.

### 시각적 위계 점검
- `.view[data-view="workbench"] { min-height: 520px }` 안전장치는 워크벤치(에디터가 유일하게
  `position:absolute;inset:0` 인 뷰)에만 필요하고 정확히 거기에만 붙었다. `app.css` 전체에서
  `position:absolute` + `inset:0`(혹은 등가 `top/left/right/bottom:0` 4개 동시 지정) 조합을
  검색한 결과 `.sqled` 가 유일했다 — 스키마(`.schema-layout{height:100%}`)·설정
  (`.settings-wrap{height:100%;overflow:auto}`) 등 나머지 뷰는 이미 `flex:1;min-height:0;overflow:auto`
  로 내부 스크롤이 격리돼 있어 추가 `min-height` 없이도 안전하다. 실행 에이전트의 결론과 일치.
- 푸터(`position:sticky;bottom:0;z-index:40`)가 겹칠 수 있는 대상(모달 `z-index:100`, 토스트
  `z-index:200`)은 모두 푸터보다 우선순위가 높아 시각적으로 가려지지 않는다.
- 푸터 배경(`linear-gradient(180deg,#fbfcfe,#eef2f7)`)과 `.af-copy` 텍스트(`var(--text-faint)`
  = `#93a0b0`) 조합의 실측 대비는 **2.37:1로 AA 상당히 미달**이다. 다만 이건 `position` 값만
  바뀐 이번 커밋이 만든 회귀가 아니라 배경·글자색 자체는 그대로이므로 기존 결함이다. 이번
  판정 범위 밖으로 별도 기록만 남긴다 — 다음 슬라이스에서 `--text-faint` 대신 진한 톤을 쓰길
  권한다.
- 짧은 페이지에서는 flex 계산상 기존과 동일한 높이가 나오고, 긴 페이지에서는 `body` 가
  늘어나며 푸터가 문서 흐름을 따라간다 — 발주자 요구("길면 펼쳐지고 푸터는 스크롤 따라다님")를
  구조적으로 만족한다.

### 남은 리스크 (구현 에이전트도 이미 명시함)
실제 브라우저 렌더 확인은 이 환경에 GUI/Playwright 가 없어 나도 하지 못했다. 코드 레벨
정적 분석과 CSS 명세 근거로는 문제가 없다고 판단하지만, **사람이 실제로 워크벤치/스키마/이력
화면을 열어 에디터와 그리드가 찌그러지지 않는지 1회 육안 확인**하는 걸 권장한다(차단 사유는
아님 — 코드 근거가 충분히 탄탄하다).

---

## 요약

| 커밋 | 판정 | 조치 필요 |
|---|---|---|
| `3cc6dcb` 에디터 색상 | 승인 | 없음 (comment/punct AA 미달은 기존 결함, 별도 티켓) |
| `50ce604` 기본테마 forest | **조건부 승인** | `[data-og-theme="forest"] { --og-row-selected-bg: #2e7d32; }` 1줄 추가 필요 |
| `b237c04` 레이아웃/푸터 | 승인 | 없음 (푸터 텍스트 대비는 기존 결함, 별도 티켓) |
