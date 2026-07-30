# FIX SPEC · Slice L — #17 유즈케이스 · #18 QR · 캡처 크롭 조이기

총괄 작성 · 2026-07-30 22:2x. 세 건 모두 `help.js` 를 건드리므로 한 슬라이스로 묶는다.

---

## L-1 · #17 유즈케이스 다이어그램 (설계 보기 탭 6번째 그림)

발주자: "유즈케이스도 넣어줘유 — 도움말 UML에"

기존 파이프라인을 **그대로 재사용**한다. 새로 만들 것은 `.puml` 1장 + 라벨 + 설명뿐이다:
- `design/src/usecase.puml` 신규 (라벨은 `${키}` 플레이스홀더)
- `design/labels.json` 에 ko/en/ja/zh 라벨 추가
- `node design/render.js` → `web/design/usecase.<locale>.svg` **4벌**
- `help.js` 의 로케일 사전 4곳에 제목·설명 추가, 설계 탭에 그림 추가

**PlantUML 유즈케이스는 DESCRIPTION 타입이라 smetana 로 렌더된다** (총괄 smoke 테스트에서
`data-diagram-type="DESCRIPTION"` 성공 확인). Graphviz 불필요.

### 내용 (초안 — 필요하면 다듬어라)
- 액터: **개발자/튜닝 담당**(주), **DBA**(권한 부여 — 점선으로 연결)
- 유즈케이스: 접속 관리 · 스키마 탐색 · SQL 진단 · 실행계획 조회 · 튜닝 후보 생성 ·
  토너먼트 실행(성능 + 결과 동일성) · 비교 검증 · 튜닝 이력 저장·내보내기 · 데모 데이터 생성
- **권한에 따라 되고 안 되는 것**(예: `V$SQL` 접근 불가 시 계측이 TIMING_ONLY 로 떨어짐)을
  note 로 달아 **'권한 이해' 탭과 연결**하라. 이게 이 그림의 실용적 가치다.
- 요소가 15개를 넘으면 쪼개지 말고 **묶어서 단순화**하라(사용자용 그림이다).

---

## L-2 · #18 QR 코드 (개발자 응원 절)

발주자가 파일을 직접 넣어줬다. 총괄이 확인한 사실:
```
E:\IBANK\SeTools\sudoku.png    357x357, 5795 B, 24bppRgb — 'LottoSudoku' 제목 + 금색 테두리 + 중앙 로고
E:\IBANK\SeTools\artgrid.png   357x357, 5332 B
```
- `web/help-img/qr-sudoku.png`, `web/help-img/qr-artgrid.png` 로 **복사**하라(원본은 그대로 둔다).
- `help.js` 의 `.help-apps` 안 각 `.help-app` 카드에 QR 을 나란히 배치.
  현재 카드 구조는 `.help-app-name` / `.help-app-desc` / `.help-app-url` 이다(`about` 탭).
- 표시 크기 **120~140px**. 원본이 357px 이라 고밀도 화면에서도 선명하다.
- `app.css` 에 `.help-app-qr` 스타일 추가.
- `alt` 는 로케일 사전 4곳에 추가 (예: ko `LottoSudoku 다운로드 QR 코드`).
  **QR 이미지 자체는 언어 무관이므로 1벌씩이면 된다.**

### ⚠ QR 은 스캔 가능성이 생명이다
- `filter`·`box-shadow`·`opacity`·`border-radius` 를 QR 위에 씌우지 마라. 인식률이 떨어진다.
- `image-rendering` 을 건드리지 마라(기본값 유지).
- 140px 이하로 더 줄이지 마라. 5KB 대라 추가 최적화도 불필요하다 — **재인코딩하지 마라**(WebP 변환 금지).
- **artgrid.png 도 배치 전에 눈으로 한 번 확인하라**(총괄은 sudoku.png 만 확인했다).

---

## L-3 · 캡처 크롭 조이기 (#16 후속)

Slice K 가 만든 `web/help-img/*.webp` 20장은 내용은 맞지만 **크롭이 느슨하다.**
총괄이 확인: `tournament.*` 는 아래쪽 **25~30% 가 빈 공간**이다. `sqllist.*` 는 40KB 로 가장 크다
(ko 40652 B, en 40328 B — 목표 40KB 초과).

발주자 요구가 "**누끼도 따고**" 였으므로 빈 공간은 요구 미달이다. 조여라:
- `design/capture-help-shots.js` 를 손봐 각 샷의 캡처 영역을 **내용에 맞게** 줄여라.
- 목표: 모든 이미지가 **40KB 이하**, 눈에 보이는 빈 여백 없음.
- 다시 캡처한 뒤 **매직바이트가 여전히 WEBP** 인지 확인하라
  (`RIFF`=0x52,0x49 + 8~9바이트 `WE`=0x57,0x45. PNG 는 0x89,0x50 → 가짜 확장자).
- 로케일 4벌이 **여전히 서로 다른지** md5 로 확인하라(같은 화면 4장이면 실패다).
- 총 용량을 보고서에 적어라(현재 393.2 KB).

---

## 검증 (필수)
1. `node design/render.js` → SVG **24개**(6장 × 4로케일). 개수 확인.
2. 유즈케이스 4로케일을 **PNG 로 찍어 눈으로** 확인 — ja/zh 두부(□□□) 없는지, 상자 밖 넘침 없는지.
3. QR 2장을 **눈으로** 확인 — 흐림·잘림·왜곡 없는지. 도움말 `about` 탭 렌더도 확인.
4. 재캡처한 webp 20장: 개수 · 총용량 · 매직바이트 · md5 유일성 4가지 전부 확인.
5. `npm test` — 현재 163(+섹션 4) 유지.
6. 임시 하네스는 **전부 삭제**. `git status` 로 의도한 파일만 스테이징 확인.
7. 확인 못 한 것을 완료로 적지 마라.

## 파일 소유권 (배타)
`design/**` · `web/design/**` · `web/help-img/**` · `web/js/views/help.js` · `web/css/app.css`

**만지지 말 것**: `server/**` · `java/**` · `web/index.html` · `web/js/app.js` · `web/js/i18n.js` ·
`web/sw.js` · `tools/**` · `installer/**` · `test/run-tests.js`
