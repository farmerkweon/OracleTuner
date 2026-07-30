# FIX SPEC · 앱 전체 테마 톤 통일 (#12)

브랜치 `feature/theme-tone-2026-07-30` · 총괄 작성 2026-07-30 22:5x

---

## 발주자 요구
> "테마 톤을 다 맞추어주면 좋지. 그렇지 않아도 붕뜨더라고."
> (현재 라운드 완료·커밋 후 새 브랜치에서 진행하기로 합의)

## 문제 (총괄 실측)
지금 "테마"는 **그리드 색만** 바꾼다. 상단바·레일바·에디터·버튼·푸터·모달은 어떤 테마를 골라도 같다.
- `web/css/app.css` 의 `:root` 블록은 **단 1개**. 테마별 오버라이드가 **아예 없다**.
- 테마가 실제로 바꾸는 건 Open Grid 라이브러리의 `--og-*` 변수뿐
  (`node_modules/open-grid/dist/open-grid-themes.css`). 이름도 다르고 앱 변수와 연결도 없다.
- `app.css` 에 **하드코딩 헥사가 104건** 남아 있다(그라디언트·배지·문법색 등).

## ★ 관문: 전역 테마 훅이 없다 (이것부터 해결)

`web/js/gridkit.js:57-60`
```javascript
export function setTheme(theme) {
  currentTheme = theme;
  for (const g of registry) { try { g.setTheme(theme); } catch (e) {} }
}
```
그리드 인스턴스에만 전달한다. **`<html>`/`<body>` 에는 아무 속성도 안 붙는다.**
`data-og-theme` 은 Open Grid 가 자기 그리드 컨테이너에만 붙이는 속성이다.
(그래서 앞서 넣은 `[data-og-theme="forest"] { --og-row-selected-bg }` 는 그리드에만 먹었다.)

⇒ **Phase 0**: `setTheme()` 에서 `document.documentElement.dataset.otTheme = theme` 를 함께 설정한다.
앱 레벨 오버라이드는 `:root[data-ot-theme="forest"] { ... }` 형태로 쓴다.
이 훅 없이는 나머지가 전부 무의미하다.

## 테마 8종
`default · modern · slate · ocean · forest · indigo · executive · dark`

각 테마가 제공하는 `--og-*` (forest 예):
`--og-primary #388e3c` / `--og-primary-light #e8f5e9` / `--og-primary-dark #2e7d32` /
`--og-header-bg` / `--og-header-color` / `--og-row-bg` / `--og-row-alt-bg` / `--og-row-hover-bg` /
`--og-row-color` / `--og-row-selected-bg` / `--og-row-selected-color` …

## 앱 변수 (톤을 맞춰야 할 대상 · `app.css:7-41`)
`--bg --panel --panel-2 --border --border-strong --text --text-dim --text-faint`
`--primary --primary-dark --primary-soft --accent --accent-soft`
`--ok --ok-soft --warn --warn-soft --danger --danger-soft`

---

## 작업 단계

### Phase 0 — 전역 훅 (선행, 단독 커밋)
`gridkit.js setTheme()` 에 `document.documentElement.dataset.otTheme = theme` 추가.
초기 진입 시에도 반드시 걸리게 할 것(`app.js` 의 `setTheme(themeSel.value)` 경로가 이미 있다).

### Phase 1 — 팔레트 설계 (문서만, 코드 없음)
테마 8종 × 앱 변수 19개의 **대응표**를 만든다. 원칙:
- **그리드 팔레트에서 유도한다.** 새 색을 발명하지 말고 `--og-primary` / `--og-primary-light` /
  `--og-header-bg` 등에서 파생시켜 그리드와 앱이 한 몸으로 보이게 한다.
- **채도를 낮춰 배경에 쓴다.** 상단바·패널 배경에 원색을 그대로 쓰면 눈이 아프다.
  발주자 표현 "붕뜬다" 는 그리드만 색이 있고 나머지가 흰색이라 생긴 이질감이다.
- **`dark` 테마는 별도 취급.** `--bg`/`--panel`/`--text` 가 반전되므로
  **SQL 문법색 12종(`.sqlt-*`)을 어두운 배경용으로 다시 골라야 한다.** 현재 값은 흰 배경 전용이다.
- 모든 조합에 대해 **WCAG AA(본문 4.5:1, 큰 글자 3:1)** 를 계산해 표에 수치를 적는다.
  미달이면 그 자리에서 값을 조정한다. "대충 어울린다" 로 넘어가지 말 것.

### Phase 2 — 하드코딩 제거 (구현)
`app.css` 의 하드코딩 헥사 104건을 훑어 **변수로 치환**한다. 특히:
- `.topbar` / `.app-footer` / `#btn-help` 의 `linear-gradient(...)` 고정색
- `.conn-off/.conn-on/.conn-prod`, `.cap-badge.lv-*` 배지색
- `.sqlt-*` 문법색 12종 (Phase 1 의 dark 대응표 반영)
- `.sqled` / `.sqled-gutter` 는 이미 변수화됨 — 건드리지 말 것
치환이 부적절한 곳(예: 브랜드 고정색)은 **남기고 이유를 주석으로** 남긴다.

### Phase 3 — 검증
**8개 테마 전부 스크린샷**을 찍어 눈으로 확인한다. 최소 화면 3종(SQL 목록 / 워크벤치 / 도움말).
테마 전환은 `localStorage.setItem('ot.theme', '<name>')` 후 `/` 로 리다이렉트하는 하네스로 한다.
확인 항목: 대비 미달, 읽을 수 없는 글자, 그리드와 앱의 색 충돌, 에디터 문법색 가독성.

---

## 안전선
- `npm test` 163건(+섹션 4) 유지.
- 기존 사용자가 고른 테마(`localStorage('ot.theme')`)를 무시하지 말 것.
- 한 커밋에 한 Phase. 리팩토링(변수화)과 새 팔레트를 같은 커밋에 섞지 말 것.
