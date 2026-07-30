# FIX SPEC · Slice A (UI) — 항목 #3, #7, #11

총괄 직접 진단 · 2026-07-30. 실행 에이전트는 이 문서대로만 고친다. 추측 금지.

---

## A-1 · 항목 #3 — 긴 SQL 이 흰 글자로 보이는 버그  【원인 확정】

### 증상
워크벤치에서 SQL 이 길어지면(에디터 보이는 높이를 넘어가면) 그 아래쪽 글자가 흰색/안 보임.

### 진짜 원인 — 하이라이트 오버레이가 첫 화면 높이에서 잘린다

에디터는 **투명 textarea + 색칠된 `<pre>` 오버레이** 구조다 (`web/js/editor.js:4-8, 39-47`).
보이는 글자는 전부 오버레이가 그린다. textarea 본문은 투명하다:

- `web/css/app.css:219` → `.sqled-input { background: transparent; color: transparent; caret-color: #111; }`

그런데 오버레이가 **스크롤 컨테이너의 보이는 높이로 고정**되고, 넘치는 부분을 **잘라버린다**:

- `web/css/app.css:204` → `.sqled-scroll { position: relative; flex: 1; overflow: auto; }`  ← 컨테이닝 블록
- `web/css/app.css:211-215` → `.sqled-highlight { position: absolute; inset: 0; min-width:100%; min-height:100%; color: var(--text); overflow: hidden; }`

`inset: 0` 은 `top:0` **과 `bottom:0`** 을 동시에 건다 → `height:auto` 가
컨테이너의 **보이는 높이**로 계산된다(스크롤 전체 높이가 아니다).
거기에 `overflow: hidden` 이 붙어 있으니 **첫 화면을 넘는 글자는 아예 그려지지 않는다.**

한편 textarea 는 내용 전체 높이로 늘어난다 (`editor.js:155-158`).

⇒ **첫 화면: 색칠된 글자 보임 / 그 아래: 오버레이는 잘렸고 textarea 는 투명 → 아무 글자도 안 그려짐.**
   배경이 `.sqled { background:#fff }`(app.css:197) 이라 사용자에게는 "흰 글자"로 보인다.

### ❗ R2 정찰의 가설 A 는 오답이다 (반박 근거를 남긴다)
`editor.js:25` 의 `LARGE_DOC_CHARS = 120000` 대용량 모드는 원인이 **아니다**.
그 경로는 `escapeHtml(v)` 를 오버레이에 넣는데(editor.js:144), 오버레이의 색은
`app.css:214` 의 `color: var(--text)` → 기본 테마에서 `#1f2430`(진한 색)이라 **보인다**.
또 `is-large` 클래스는 토글만 하고(editor.js:141) **CSS 규칙이 존재하지 않는다**(전체 grep 확인).
즉 120K 자를 넘지 않아도 증상이 나오며, 실제 사용자 증상("길면")과 임계값이 맞지 않는다.

### 수정 (app.css:211-215 만 고친다)
```css
.sqled-highlight {
  position: absolute; top: 0; left: 0; pointer-events: none;
  min-width: 100%; min-height: 100%;
  color: var(--text);
}
```
- `inset: 0` → `top: 0; left: 0;` (bottom/right 제약 제거 → 내용 높이만큼 늘어남)
- `overflow: hidden` **삭제** (잘림 제거)
- 나머지 속성은 건드리지 말 것.

### 같은 슬라이스에서 함께 고칠 하드코딩 색 (테마 깨짐 예방)
- `app.css:197` `.sqled { background: #fff; }` → `background: var(--panel);`
- `app.css:219` `caret-color: #111;` → `caret-color: var(--text);`
- `app.css:200` `.sqled-gutter { background: #fafbfc; }` → `background: var(--panel-2);`
이유: #7 에서 기본 테마를 forest 로 바꾸는데, 하드코딩 흰 배경이 남아 있으면
테마에 따라 대비가 깨져 **같은 증상이 다른 경로로 재발**한다.

### 검증 방법 (필수, 에이전트가 직접 수행)
1. `npm start` 후 워크벤치에 **200줄 이상** SQL 붙여넣기(예: `demo/01-setup.sql` 반복 붙이기).
2. 끝까지 스크롤해서 **마지막 줄까지 글자가 보이고 색칠되는지** 확인.
3. 확인 결과를 로그에 `INFO A-1 verify: <관찰 내용>` 으로 남긴다. 브라우저를 못 띄우면
   `DONE` 대신 `WARN A-1 시각검증 불가 — 코드 수정만 완료` 라고 정직하게 남긴다.

---

## A-2 · 항목 #7 — 기본 테마 forest

현황 (정찰 R2):
- 테마 목록: `web/index.html:41-50` `<select id="sel-theme">`, forest 옵션 **이미 존재**
- 기본값 결정: `web/js/app.js:42-47` — `localStorage.getItem('ot.theme')` 있으면 그 값,
  **없으면 select 의 첫 옵션(=default)** 이 그대로 쓰인다.

수정 지침:
1. `web/index.html` 의 select 에서 `forest` 옵션에 `selected` 를 붙인다 (마크업 기본값).
2. `web/js/app.js:42-47` 을 다음 의미로 고친다 — 상수를 도입해 매직 문자열을 없앨 것:
   ```javascript
   const DEFAULT_THEME = 'forest';
   const saved = localStorage.getItem('ot.theme');
   themeSel.value = saved || DEFAULT_THEME;
   setTheme(themeSel.value);
   ```
   ※ `saved` 가 select 에 없는 값(구버전 테마명)일 때도 forest 로 떨어지게 방어할 것:
   `if (![...themeSel.options].some(o => o.value === themeSel.value)) themeSel.value = DEFAULT_THEME;`
3. 서버 설정에도 테마 기본값이 있으면(`server/config.js`) **건드리지 말고** 위치만 보고할 것.
   ← config.js 는 Slice C 소유. 파일 충돌 금지.

---

## A-3 · 항목 #11 — 높이 제한 해제 + 푸터는 스크롤 따라가기

발주자 요구 원문: "푸터가 스크롤 따라 다니는건 좋은데 툴 크기가 화면에 제한적임.
길면 긴대로 펼처지고 푸터는 그냥 스크롤따라다니면 됨."

해석: 지금은 앱이 `100%` 높이에 갇혀 내부에서만 스크롤된다. 컨텐츠가 길면
**문서 자체가 길어지고**, 푸터는 화면에 붙어 떠 있지 말고 **문서 흐름 끝**에 놓여
페이지 스크롤을 따라가면 된다.

현황 (정찰 R2 · 총괄 재확인 필요):
- `#views` 가 `height: calc(100% - topbar - railbar - footer)` 로 고정
- `footer` 가 `position: fixed`

수정 지침:
1. `#views` 의 `height: calc(...)` 를 제거하고 `min-height` 로 바꾼다 (내용이 길면 늘어남).
2. 푸터를 `position: fixed` → **`position: sticky; bottom: 0;`** 로 바꾼다.
   → 짧은 페이지에서는 화면 아래에 붙어 보이고, 긴 페이지에서는 스크롤을 따라간다
   (발주자가 원한 "스크롤 따라다님" 유지 + 높이 제한 해제 동시 충족).
3. `html, body` 에 `height: 100%; overflow: hidden` 류가 걸려 있으면 **페이지 스크롤이
   생기게** 풀어준다. 단 `overflow` 를 풀 때 그리드 내부 스크롤이 깨지지 않는지 확인.
4. ⚠ **주의**: 에디터(`.sqled { position:absolute; inset:0 }`)와 그리드는
   부모 높이가 확정돼야 그려진다. `#views` 높이 제약을 풀면 **에디터/그리드가 높이 0 으로
   붕괴**할 수 있다. 그래서 워크벤치 같은 "고정 높이가 필요한 뷰"에는
   `min-height` 를 명시적으로 주어(예: `min-height: 520px`) 붕괴를 막아라.
   이 붕괴 위험이 이 항목의 핵심 난점이다. 반드시 실제로 열어서 확인할 것.

### 검증
워크벤치·후보·이력 뷰를 각각 열어 (a) 에디터/그리드가 찌그러지지 않는지,
(b) 내용이 길 때 페이지가 늘어나는지, (c) 푸터가 겹쳐서 컨텐츠를 가리지 않는지 확인.

---

## 파일 소유권 (이 슬라이스 전용 — 다른 슬라이스는 이 파일을 만지지 않는다)
- `web/css/app.css`  ★ 배타 소유
- `web/js/app.js`    ★ 배타 소유
- `web/index.html`   ★ 배타 소유

`web/js/editor.js` 는 **수정하지 않는다** (원인이 CSS 이므로 JS 변경 불필요).
`server/config.js`, `web/js/gridkit.js`, `web/js/views/*` 는 **손대지 말 것.**
