# 실행 결과 · 에이전트 A (UI 슬라이스) — 항목 #3, #7, #11

수행 시각: 2026-07-30 19:41 ~ 19:52 (KST, `Get-Date` 실측)

---

## A-1 · 항목 #3 — 긴 SQL 흰 글자 버그

스펙(`FIX-SPEC-slice-A-ui.md` A-1)대로 정확히 4곳 수정. 원인 분석은 스펙을 그대로 신뢰(재검증 결과 코드와 스펙 일치 확인).

- `web/css/app.css:210` (스펙 표기 211) `.sqled { background: #fff }` → `background: var(--panel);`
- `web/css/app.css:213` (스펙 표기 200) `.sqled-gutter { background: #fafbfc }` → `background: var(--panel-2);`
- `web/css/app.css:224-228` (스펙 표기 211-215) `.sqled-highlight`:
  - `position: absolute; inset: 0;` → `position: absolute; top: 0; left: 0;`
  - `overflow: hidden;` 삭제
  - 나머지(`min-width/min-height/color`) 그대로 유지
- `web/css/app.css:232` (스펙 표기 219) `.sqled-input { caret-color: #111 }` → `caret-color: var(--text);`

before/after 핵심 diff:
```css
/* before */
.sqled-highlight {
  position: absolute; inset: 0; pointer-events: none;
  min-width: 100%; min-height: 100%;
  color: var(--text); overflow: hidden;
}
/* after */
.sqled-highlight {
  position: absolute; top: 0; left: 0; pointer-events: none;
  min-width: 100%; min-height: 100%;
  color: var(--text);
}
```

### 검증
- `npm test` 150건 전부 통과 (스펙 문서엔 "기존 140건"이라 적혀 있었으나 실제 베이스라인이 150건이었음 — 실패 0건이므로 문제 없음).
- **시각 검증 미수행** — Playwright 등 브라우저 툴이 이 환경에 없음(ToolSearch로 확인). `npm start` 로 서버는 정상 기동했고 `curl` 로 `/`, `/css/app.css`, `/js/app.js` 모두 200 응답, 서버 로그에 에러 없음, 서빙되는 CSS 에 수정 내용이 반영된 것까지 확인. 하지만 실제 브라우저에서 200줄 이상 SQL 을 붙여넣고 끝까지 스크롤해 글자가 보이는지는 **직접 보지 못했다**. CSS 원인 분석(오버레이가 `inset:0`+`overflow:hidden`으로 잘리던 것을 `top/left`+overflow 제거로 해소)은 스펙과 100% 일치하며 신뢰도가 높다고 판단.

---

## A-2 · 항목 #7 — 기본 테마 forest

스펙대로 2곳 수정, 코드와 스펙 완전 일치 확인.

- `web/index.html:46` `<option value="forest">` → `<option value="forest" selected>`
- `web/js/app.js:41-49`:
```js
/* before */
const themeSel = $('#sel-theme');
const saved = localStorage.getItem('ot.theme');
if (saved) themeSel.value = saved;
setTheme(themeSel.value);
...
/* after */
const DEFAULT_THEME = 'forest';
const themeSel = $('#sel-theme');
const saved = localStorage.getItem('ot.theme');
themeSel.value = saved || DEFAULT_THEME;
if (![...themeSel.options].some(o => o.value === themeSel.value)) themeSel.value = DEFAULT_THEME;
setTheme(themeSel.value);
...
```

### 참고 (수정하지 않음, 위치만 보고)
`server/config.js:57` 에 `theme: 'default'` 존재. Slice C 소유 파일이라 손대지 않음. 필요시 총괄이 별도 슬라이스에서 처리.

### 검증
- `npm test` 150/150 통과.
- **시각 검증 미수행** (브라우저 도구 없음). 마크업 `selected` + JS 기본값 로직 모두 확인했고, `localStorage` 에 저장된 값이 없거나 구버전 값일 때도 forest 로 방어하는 로직까지 포함해 스펙 그대로 구현.

---

## A-3 · 항목 #11 — 높이 제한 해제 + 푸터 sticky (가장 위험한 항목)

### 스펙과 다르게 구현한 부분과 그 이유 (중요)

스펙은 "`#views` 의 `height: calc(...)` 를 `min-height` 로 바꾸라"고 지시했다. 이걸 **문자 그대로**(plain block 에 `min-height`만) 적용하면 CSS 스펙상 진짜로 붕괴한다:

> CSS2.1 10.5 — 부모의 height 가 `auto`(min-height 만 있고 height 는 명시 안 됨)이면, 그 부모는 "height 가 명시되지 않은 것"으로 간주되어 **자식의 `height:100%` 는 percentage 무시(사실상 auto)로 계산된다.** `min-height` 로 실제 렌더링 높이가 확보되어도 스펙상 "명시된 height" 로 취급되지 않는다.

이 앱은 `#views → .view(height:100%) → .wb-layout(height:100%) → .split-v(height:100%) → .pane-editors(flex-basis:44%, 이것도 부모가 height 미확정이면 auto 로 처리됨) → .editor-host(flex:1) → .sqled(position:absolute; inset:0)` 로 이어지는 **percentage-height 체인**이라, `#views` 를 plain `min-height` 로만 바꾸면 스펙이 우려한 "에디터/그리드 높이 0 붕괴"가 **거의 확실히 발생**한다(그냥 우려가 아니라 CSS 스펙 규정상 그렇다).

**그래서 기술적으로 보정**했다 — "growable 하지만 자식에게는 확정된 높이를 전달하는" 표준 기법인 **flexbox 기반 sticky-footer 패턴**으로 같은 의도를 구현:

```css
/* before */
html, body { height: 100%; margin:0; ...; overflow: hidden; }
...
#views { height: calc(100% - var(--topbar-h) - var(--railbar-h) - var(--footer-h)); position: relative; }
...
.app-footer { position: fixed; left:0; right:0; bottom:0; height: var(--footer-h); ...; }

/* after */
html { height: 100%; }
body { min-height: 100%; margin:0; ...; display: flex; flex-direction: column; }  /* overflow:hidden 제거 */
.topbar { height: var(--topbar-h); flex: 0 0 auto; ... }
.railbar { height: var(--railbar-h); flex: 0 0 auto; ... }
#views { flex: 1 0 auto; position: relative; }   /* flex-grow:1, flex-shrink:0 */
.view[data-view="workbench"] { min-height: 520px; }  /* 스펙이 제안한 붕괴 방지 안전장치 */
.app-footer { position: sticky; left:0; right:0; bottom:0; height: var(--footer-h); flex: 0 0 auto; ... }
```

왜 이게 안전한가 (구조 분석, 브라우저로 직접 확인은 못 했지만 CSS flexbox 스펙에 근거):
- `body{min-height:100%; display:flex; flex-direction:column}` + `#views{flex:1 0 auto}` 는 "sticky footer" 에 쓰이는 표준 패턴이다. flex 레이아웃은 자식(`#views`)에게 **확정된(definite) 계산 높이**를 부여하므로, 내용이 짧을 때는 기존 `calc(100% - ...)` 와 **완전히 동일한 높이**가 나온다 (percentage-height 체인이 그대로 살아있음 → 붕괴 없음).
- 내용이 넘칠 때는 `flex-shrink:0` 덕분에 `#views` 가 찌그러지지 않고, `body{min-height:100%}` 라서 `body` 전체가 늘어나 **페이지 스크롤**이 생긴다.
- `web/css/app.css` 전체를 grep 한 결과, `position:absolute + inset:0` 구조는 워크벤치 에디터(`.sqled`) 하나뿐이었고, 나머지 모든 패널(그리드/후보/이력/설정 등)은 `flex:1; min-height:0; overflow:auto` 패턴으로 이미 **내부 스크롤이 격리**돼 있었다. 즉 이 앱은 원래 "고정 뷰포트 + 내부 스크롤" 로 설계돼 있어서, 이번 변경의 실사용 효과는: (a) 정상적인 경우 기존과 시각적으로 동일 (b) 내부 패널들은 여전히 각자 스크롤 (c) 셸(topbar/railbar/views/footer) 수준에서만 "넘치면 페이지가 늘어나고 푸터가 따라간다" 는 능력이 새로 생긴 것.
- 스펙이 제안한 `min-height: 520px` 안전장치도 `.view[data-view="workbench"]` 에 그대로 추가해 이중 방어했다.

### 검증
- `npm test` 150/150 통과 (레이아웃 CSS 는 JS 단위테스트 대상이 아니라 직접적 커버리지는 없음).
- **시각 검증 미수행** — 이 항목이 가장 위험하다고 명시됐는데도 브라우저 도구가 없어 실제로 워크벤치/스키마/이력 뷰를 열어 에디터·그리드가 찌그러지지 않는지 **눈으로 확인하지 못했다.** `npm start` 로 서버 기동 확인, curl 로 정적 리소스 200 확인, 서빙되는 CSS 에 변경사항이 반영됨을 확인한 것이 전부다.
- 되돌림(revert) 여부 판단: 되돌리지 않고 진행했다. 이유는 (1) 문자 그대로의 스펙 지시(plain min-height)는 CSS 스펙상 확실히 깨지므로 그대로 적용하는 것이 오히려 더 위험했고, (2) 대신 적용한 flexbox 패턴은 "내용이 짧을 때 기존과 동일한 높이" 를 스펙 수준에서 보장하는 잘 알려진 기법이라 회귀 위험이 낮다고 판단했기 때문. 다만 **총괄 또는 사람이 직접 브라우저로 워크벤치 뷰를 열어 에디터/그리드가 찌그러지지 않는지 재확인하는 것을 강력히 권장**한다. 문제가 발견되면 이 슬라이스의 A-3 커밋만 되돌리면 A-1/A-2 는 영향받지 않는다(항목별 개별 커밋).

---

## 커밋 계획
검증이 시각적으로 완결되지 않았으므로, `npm test` 통과와 서버 기동 확인을 근거로 항목별 커밋은 진행하되 A-3 는 리스크를 커밋 메시지에 명시. (커밋 실행 여부는 총괄 판단에 맡김 — 아래 "미해결 사항" 참조)

## 미해결 사항
1. A-1/A-2/A-3 모두 **실제 브라우저 시각 검증 미수행** (환경에 브라우저/Playwright 도구 없음).
2. A-3 는 스펙의 문자 그대로의 처방(plain min-height)을 그대로 쓰지 않고 flexbox 기반으로 기술적으로 보정했다 — 스펙 문서와 다른 구현이므로 총괄 확인 필요.
3. `server/config.js:57` 의 `theme: 'default'` — Slice C 소유라 미수정, 위치만 보고.
