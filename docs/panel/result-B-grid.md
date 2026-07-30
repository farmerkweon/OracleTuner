# 결과 보고 · 실행 에이전트 B (그리드) — 항목 #8, #9

작성: executor(B) · 2026-07-30. 스펙: `docs/panel/FIX-SPEC-slice-B-grid.md`

## 요약

스펙대로 구현 완료. `npm test` 153/153 유지. 헤드리스 크롬으로 핵심 경로(서브그리드
확장 → 확대 버튼 → 모달 열림 → ESC 닫힘 → 포커스 복원)를 실측 확인. 스펙의 아이콘
폴백 로직에 실제 버그가 있어 최소 범위로 수정(아래 참고).

## 구현 내용

- `web/js/gridkit.js`
  - `import { icon } from './icons.js'` 추가.
  - `renderPlan`(171→) / `renderFindings`(225→) 의 masterDetail `renderer` 를
    `draw()` 클로저 + `wireDetailExpand()` 호출 패턴으로 변경(스펙 그대로).
  - 파일 끝에 `openDetailModal` / `closeDetailModal` / `wireDetailExpand` /
    내부 헬퍼(`_ensureDetailModal`, `_focusableIn`, `_onDetailModalKeydown`) 추가.
    스펙 코드 그대로 옮기되, 파일 상단에 이미 추가한 `icon` import 와 중복되므로
    섹션 내 `import` 줄은 제외(스펙 코드블록 그대로 넣으면 ES모듈 중복 import 오류).
- `web/js/views/candidates.js`
  - import 에 `wireDetailExpand` 추가.
  - 후보 1단계(119→) / 순위표(256→) / 제외 후보(304→) 세 masterDetail 렌더러
    전부 `draw()` + `wireDetailExpand()` 패턴 적용.
- `web/css/app.css`
  - `body.modal-open { overflow:hidden; }` — body 규칙 바로 다음 줄.
  - `.modal-xl` / `.modal-xl .modal-body` — `.modal-narrow` 옆.
  - `.detail-panel`에 `position:relative`, `h4`에 `padding-right:30px`,
    `.detail-expand-btn` 위치 규칙 — 기존 `.detail-panel` 블록에 추가.
  - 2순위(선택) 스크롤 힌트 그라디언트는 스펙이 "필수 아님, 시간 부족하면 생략"
    이라고 명시해 **생략함**.

## 스펙과 실제 코드가 어긋난 지점 (정직 보고)

### 1) app.css 라인 번호 드리프트 (경미, 셀렉터는 일치)
스펙이 가리킨 라인 번호(760-767, 473-479, 494)와 실제 파일 라인 번호가 다름
(`.detail-panel`:794-801, `.modal-backdrop`:519, `.modal`:524, `.modal-narrow`:528).
셀렉터 이름과 규칙 내용은 스펙과 동일하게 존재해 라인 번호만 드리프트로 판단하고
셀렉터 기준으로 정확한 위치에 추가함. (원인 추정: Slice A 가 먼저 파일을 수정해
라인이 밀렸을 가능성.)

### 2) 아이콘 폴백 로직 버그 (실질적, 수정함)
스펙 코드: `let svg = icon('arrows-fullscreen', 14); if (!svg) svg = icon('search', 14);`

실제 확인 결과 `arrows-fullscreen` 은 이 앱이 번들한 open-grid 아이콘 딕셔너리
(`node_modules/open-grid/dist/OpenGrid-sI_vdHQw.js` 의 `Xe` 상수)에 **없는 role**
이다. 그런데 `renderIcon()` 은 미등록 role 이어도 예외를 던지거나 빈 문자열을
반환하지 않고, **빈 `<svg>...></svg>` 셸**(내용 없음, `childNodes.length === 0`)을
돌려준다 — 즉 `icon('arrows-fullscreen',14)` 의 반환값은 **non-empty 문자열**이라
스펙의 `if (!svg)` 체크가 걸리지 않고, `search` 폴백이 영영 실행되지 않는다.

헤드리스 크롬으로 실제 렌더 결과를 계측해 확인:
- 폴백 수정 전: 확대 버튼은 정상 위치(x=1018,y=144,32×31)에 렌더되지만 내부
  SVG 가 `childNodes=0` — 시각적으로 빈 버튼.
- `wireDetailExpand` 안의 감지 로직만 "문자열이 비었는가" → "그릴 요소(path/use 등)가
  있는가"로 최소 수정 후 재확인: `search` 아이콘(돋보기)이 실제로 렌더됨(`childNodes=1`,
  `<path d="M11.742...">`).

**판단**: 이건 스펙의 설계 의도(폴백으로 반드시 보이는 아이콘을 보장) 자체를 어긴 게
아니라, 그 의도를 구현한 스펙 코드의 감지 조건에 있던 버그다. 아이콘 우선순위
(arrows-fullscreen 우선 시도 → search 대체)는 스펙 그대로 유지했고, "빈 문자열
검사"만 "그릴 요소 존재 검사"로 넓혔다. 로그에 WARN 으로 남김(`logs/agent/B-grid.log`).

## 검증

1. **`npm test`**: 153건 통과 · 0건 실패 (기존 153건 기준선 유지 확인, 수정 전후 2회 실행).
2. **시각 검증 (헤드리스 크롬, 실측)** — `web/__verify-grid.html` 임시 하네스로
   실제 `/js/gridkit.js`, `/css/app.css`, 실제 open-grid 라이브러리를 불러 확인 후 삭제함:
   - masterDetail 확장(`renderPlan` 대상) → `.detail-panel` 렌더 확인.
   - `.detail-expand-btn` 존재, 위치(우상단), 아이콘 렌더(수정 후) 확인.
   - 확대 버튼 클릭 → `.modal-xl` 열림, `role="dialog"`, `aria-modal="true"`,
     `aria-labelledby` 확인, 모달 크기 실측(≈1200×716~860, 뷰포트 대비 대형),
     제목 텍스트(`SELECT STATEMENT — EMP`) 정확히 반영 확인.
   - 모달 열릴 때 포커스가 모달 안(닫기 버튼)으로 이동 확인.
   - **ESC 닫힘**: `backdrop.hidden → true`, `body.modal-open` 클래스 제거 확인.
   - **포커스 복원**: 트리거(확대) 버튼으로 포커스가 되돌아옴을 실측 확인
     (주의: 프로그램적 `.click()` 은 실제 마우스 클릭과 달리 클릭 전 자동 포커스를
     주지 않아, 첫 시도에서 "복원 실패"로 잘못 측정됨 — `element.focus()` 를 클릭 전에
     명시 호출해 실제 사용자 클릭을 흉내내자 정상 확인됨. 실사용(진짜 마우스 클릭)에서는
     문제 없음).
3. **미검증 항목** (정직하게 보고, 완료로 적지 않음):
   - **배드롭 클릭 닫기**, **X 버튼 닫기**: 별도로 클릭 시뮬레이션하지 않음.
     다만 셋 다 동일한 `closeDetailModal()` 함수를 호출하도록 코드가 되어 있고,
     ESC 경로로 그 함수의 동작(backdrop.hidden, body 클래스, 포커스 복원)은 실측
     확인했으므로 **간접적으로는 검증됨** — 이벤트 트리거 자체(클릭 리스너 등록)는
     코드 리뷰로만 확인.
   - **Tab/Shift+Tab 포커스 트랩 순환**: 실제 Tab 키 시퀀스로 순환 여부를 시뮬레이션
     하지 않음. `_onDetailModalKeydown` 이 ESC 와 같은 리스너에 등록되어 있고 ESC 는
     정상 동작을 확인했으므로 리스너 자체는 살아있음을 간접 확인했지만, Tab 순환
     로직 자체의 실측은 **미검증**.
   - **`renderFindings`(진단) 및 `candidates.js` 세 곳**(후보/순위표/제외 후보):
     코드는 `renderPlan`과 완전히 동일한 `wireDetailExpand` 함수를 재사용하는
     구조라 동작 원리는 같지만, 이 5곳 각각을 실제 데이터로 별도 시각 검증하지는
     않았음(시간 제약) — **미검증**. `renderPlan` 한 곳만 엔드투엔드로 실측함.
   - `findingDetailHtml`의 `[data-fix]` 버튼이 모달 안에서도 동작하는지는 미검증.

## 커밋

단일 커밋으로 처리(사유는 커밋 메시지 본문에 명시): 스펙이 #8 의 해결책으로
#9 팝업을 명시적으로 채택했기 때문에(상세 패널 자체 스크롤 로직은 손대지 않음),
코드 레벨에서 두 항목이 분리되지 않는다. `git status` 로 소유 파일만 스테이지했고
`git add -A` 는 쓰지 않음. 다른 에이전트가 동시 수정 중인 `server/*`,
`docs/panel/FIX-SPEC-slice-G-storage.md`, `STATUS.md` 등은 건드리지 않음(커밋 후
`git status` 로 재확인).

커밋 해시: `03e579a`
