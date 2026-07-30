# P-UI 감수 결과 — 실행계획 우측 텍스트 창(`.plan-text`) 글자색 가독성

## 지시
발주자: "실행계획 결과 하단 우측창 폰트컬러 가독성 떨어지는 거 잡아줘. 한명수님 불러서 컬러 맞춰봐."
대상: `web/css/app.css` `.plan-text` (466-470행), `#plan-text`(DBMS_XPLAN 원문, `.plan-split` 우측).

## 원인
`.plan-text` 는 `background: var(--panel-2)` 로 테마를 따라가는데 `color: #333` 만 리터럴로 고정돼 있었다.
light 5종(default/modern/ocean/forest/indigo)은 `#333` 이 밝은 `--panel-2` 위에서 우연히 잘 보였지만,
dark 3종(slate/executive/dark)은 `--panel-2` 자체가 어두워(`#2e3d44`/`#0b1a2c`/`#252525`) 짙은 회색 글자가
짙은 배경에 얹혀 사실상 안 보였다.

## 수정
```diff
- background: var(--panel-2); white-space: pre; color: #333;
+ background: var(--panel-2); white-space: pre; color: var(--text);
```
새 색을 만들지 않고 기존 본문 변수 `var(--text)` 로 교체했다. 코드 원문이라 본문 대비가 가장 크고
자연스럽다고 판단했다(과제 지시문의 제안과 일치).

## 대비 실측 (WCAG 2.x, `relative luminance` 기반 직접 계산 — CSS 원본 hex 값 사용)

### `.plan-text` 수정 전/후 (기준: AA 본문 4.5:1)

| 테마 | panel-2 | 수정 전 (#333) | 수정 후 (var(--text)) | 판정 |
|---|---|---|---|---|
| default | #fafafa | 12.10 | 14.50 | PASS (수정 전에도 PASS) |
| modern | #f8fafc | 12.08 | 15.18 | PASS (수정 전에도 PASS) |
| ocean | #f0f9ff | 11.85 | 13.30 | PASS (수정 전에도 PASS) |
| forest | #f1f8f1 | 11.69 | 13.22 | PASS (수정 전에도 PASS) |
| indigo | #f5f6ff | 11.74 | 14.21 | PASS (수정 전에도 PASS) |
| **slate** | #2e3d44 | **1.12 FAIL** | **9.74 PASS** | 수정으로 해결 |
| **executive** | #0b1a2c | **1.39 FAIL** | **11.84 PASS** | 수정으로 해결 |
| **dark** | #252525 | **1.21 FAIL** | **11.61 PASS** | 수정으로 해결 |

수정 전 dark 3종은 1.1~1.4:1로 AA(4.5:1)는 물론 AA-large(3:1)에도 못 미쳤다.
수정 후 8종 전부 최저 9.74:1로 AA를 여유 있게 통과한다.

## 부수 발견 — 같은 유형 재검사

`Grep 'color:\s*#[0-9a-fA-F]{3,6}'` 로 app.css 전체를 훑어 "배경은 변수, 글자는 리터럴" 패턴을 모두 확인했다.

- `.sqlt-*` 12종(368-380행) — 이미 dark 3종 오버라이드(389-428행)가 있음. **손대지 않음.**
- `.log-text`(473-480행) — 의도적으로 고정된 어두운 터미널이라는 주석 있음. **손대지 않음.**
- `.toast`/`.toast.ok/.err/.warn`(966-973행) — 테마 독립 오버레이라는 주석 있음(962-963행). **손대지 않음.**
- `.help-app-qr`, `.design-fig-img`, `.design-fig-zoom` — QR 인식률/SVG 렌더링 이유로 `background:#fff` 고정 주석 있음. **손대지 않음.**
- **`.sev-low`(982행)** — `.plan-text` 와 정확히 같은 모양(`background: var(--panel-2); color: #4a5568;`)이었다.
  실측 결과 slate 1.49 / executive 2.33 / dark 2.04 로 역시 AA 미달. 형제 규칙인 `.sev-info` 가 이미
  `color: var(--text-dim)` 을 쓰고 있어 그것과 맞춰 동일하게 고쳤다.
  수정 후: default 5.29 / modern 5.58 / ocean 4.95 / forest 4.89 / indigo 5.22 / slate 5.25 / executive 4.80 / dark 5.05 — 8종 전부 PASS.
- `.brand-mark`(174행, `background:var(--primary); color:#fff`), `.badge` 계열(444-450행,
  `background:var(--danger)/var(--warn)/var(--ok); color:#fff`) 도 같은 "배경 var + 글자 리터럴" 모양이고
  dark 3종에서 대비가 무너져 있다(예: brand-mark #fff-on-primary — slate 2.10 / executive 2.42 / dark 1.75,
  badge #fff-on-danger/warn/ok 도 slate·executive·dark 전부 1.68~3.12로 FAIL).
  **다만 이번 과제 범위 밖으로 판단해 고치지 않았다.** 이유: 이 둘은 "패널 위 본문 텍스트"가 아니라
  채도 있는 배경색 칩(브랜드 마크·상태 배지) 위 흰 글자라는 다른 유형의 문제이고, 이미 `.btn-primary`/
  `.btn-accent`/`.btn-danger`/`#btn-help:hover` 에 대해서만 dark 3종용 `color:var(--bg)` 오버라이드
  (645-661행)가 선례로 있다. 같은 패턴을 brand-mark/badge까지 확장할지는 브랜드 정체성이 걸린
  디자인 결정이라 총괄 판단이 필요해 별도 보고로 남긴다.

## 눈으로 확인

`web/__contrast-harness.html`(임시, `.plan-split` 구조 재현 — 좌측 `.grid-host` + 우측
`<pre class="plan-text">` 에 DBMS_XPLAN 유사 다중 라인)을 만들어 4개 테마(dark/slate/executive/forest)를
헤드리스 크롬으로 캡처해 육안 확인했다. 4장 모두 우측 실행계획 텍스트가 명확히 읽힌다.
**확인 후 하네스 파일은 삭제했다**(`web/__contrast-harness.html` 은 저장소에 남아있지 않다 — `git status` 로 확인).

## 테스트

`npm test` — 통과 163 · 실패 0 (+ 섹션 F 4건 통과), 기존과 동일하게 유지.

## 변경 파일

`web/css/app.css` 만 수정(2줄: `.plan-text` color, `.sev-low` color). 다른 파일 변경 없음(`git status` 로 확인).
