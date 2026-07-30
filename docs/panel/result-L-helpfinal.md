# 결과 · Slice L — #17 유즈케이스 · #18 QR · 캡처 크롭 조이기

실행 에이전트 L, 2026-07-30 22:22 ~ 22:37. 커밋 3개, 모두 `feature/improve-2026-07-30` 브랜치.

## 커밋

| 해시 | 내용 |
|---|---|
| `5c546d1` | feat(help): add use-case diagram to 설계 보기 tab (#17) |
| `0ad9329` | feat(help): add QR codes to support-the-developer cards (#18) |
| `7e39eb5` | fix(help): tighten help-img capture crops, remove blank margins (#16 후속) |

`web/js/views/help.js` 는 L-1/L-2 가 함께 건드리는 파일이라, `git diff` 로 두 변경의 hunk 경계를
확인한 뒤(줄 563 부근 usecase 배열 추가 vs 줄 614+ QR 관련 4곳) `git apply --cached` 로 부분
스테이징해 두 커밋으로 정확히 분리했다. `git add -A` 는 쓰지 않았다.

## L-1 · #17 유즈케이스

- `design/src/usecase.puml` 신규(액터 2: 개발자/튜닝 담당, DBA / 유즈케이스 9개 — 브리핑 원안 그대로,
  15개 안 넘어 쪼갤 필요 없었음).
- `design/labels.json` 에 `usecase.*` 14개 키 × 4로케일 추가.
- `design/render.js` → `web/design/usecase.{ko,en,ja,zh}.svg` 4벌. 확인: `data-diagram-type="DESCRIPTION"`
  (smetana 렌더 확인, Graphviz 불필요).
- note 로 "V$SQL 접근 없으면 계측이 TIMING_ONLY 로 자동 하향" 을 달고, help.js 설명문에서
  `[권한 이해]`/`[Permissions]`/`[権限の理解]`/`[权限说明]` 탭 이름을 그대로 인용해 연결(기존
  시작하기 탭의 "[권한 이해] 탭에서 확인하세요" 패턴 재사용).
- `help.js` `DESIGN_DIAGRAMS` 배열에 6번째 항목으로 추가.

## L-2 · #18 QR

- `E:\IBANK\SeTools\sudoku.png`, `artgrid.png` 를 `web/help-img/qr-sudoku.png`,
  `qr-artgrid.png` 로 **복사만**(원본 미변경, 재인코딩 없음, WebP 변환 안 함).
- artgrid.png 를 배치 전 육안 확인함 — "ART GRID" 제목 + 빨간 테두리, 정상 QR.
- `.help-app` 카드를 `flex-direction: row` 로 바꿔 QR(128px) 을 텍스트와 나란히 배치.
- `.help-app-qr` 에 `filter`/`box-shadow`/`opacity`/`border-radius`/`image-rendering` 전혀
  적용 안 함(app.css 전역에도 `img{...}` 규칙이나 다크테마 filter 없음을 grep 으로 확인).
- alt 텍스트 4로케일 사전 추가(`appLottoQrAlt`, `appArtQrAlt`).

## L-3 · 캡처 크롭 조이기

`design/capture-help-shots.js` 의 `TARGETS` 3곳을 실측 기반으로 조임(topbar/settings 는 이미
타이트해서 변경 안 함):

| 대상 | 이전 h | 이후 h | 근거 |
|---|---|---|---|
| sqllist | 430 | 405 | 트리 10항목이 실측 ~y390 까지 채움, 그 아래만 여백 |
| workbench | 790 | 420 | 편집기(6줄)+결과 안내문이 실측 ~y402 에서 끝남, 그 아래 전부 빈 캔버스였음 |
| tournament | 442 | 180 | 안내문이 로케일 중 가장 긴 en 2줄 기준 ~y165 에서 끝남 |

## 검증 결과 (7개 항목, 전부 확인함)

1. `node design/render.js` → **SVG 24개**(6장×4로케일), 실패 0. 커밋 후 재확인도 동일.
2. 유즈케이스 4로케일 PNG 헤드리스 캡처 후 육안 확인 — ja/zh 두부(□□□) 없음, 상자 밖 넘침 없음,
   note 텍스트도 SVG 캔버스(1106px) 안에 완전히 들어감(1000px 스크린샷에서 잘려 보인 건 뷰포트
   문제였고 1150px 재캡처로 완전한 형태 확인).
3. QR 2장 육안 확인(about 탭 ko/en 렌더, 하네스로 서버 기동 후 헤드리스 캡처) — 흐림·잘림·왜곡
   없음, 나란히 배치 정상. 하네스(`web/help-img/_tmp/about-harness.html`)는 확인 후 삭제.
4. 재캡처 webp 20장: 개수 20 확인 / 매직바이트 전부 `52 49 46 46 ... 57 45`(RIFF...WE, 진짜 WEBP,
   PNG 위장 없음) / md5 로케일 그룹마다 4종 전부 상이(전환 정상) / 총 397,014 B(≈388KB, 이전
   393.2KB 대비 소폭 감소 — 빈 캔버스는 WebP 압축이 이미 잘 먹어서 바이트보다 **시각적** 여백
   제거가 핵심 효과였음). 40KB(41,943B) 이하는 20장 전부 충족 — sqllist 가 가장 크지만
   39,732~40,542B 로 여유 있게 통과.
5. `npm test` → **통과 163 · 실패 0** + 별도 섹션 **[F] 통과 4 · 실패 0**. 요구된 기준선 그대로 유지.
6. 임시 파일 전부 삭제(스크린샷 temp 디렉터리, about-harness.html, node 서버 프로세스 kill).
   `git status` 로 확인: 내 3커밋 반영 후 남은 건 `STATUS.md`(타 세션 소유, 미접촉) 뿐.
7. 미검증 항목 없음 — 7개 검증 모두 실측으로 확인함.

## 참고 — 동시 작업 중이던 다른 세션

작업 중 `git status` 에서 `web/js/app.js`, `web/js/i18n.js`, `web/__verify-diag.html`(PWA
관련, 커밋 `f647f11`/`e45d0bf`)이 나타났다. 배타 소유 파일이 아니어서 손대지 않았고, 커밋에도
포함하지 않았다. 같은 저장소에서 다른 슬라이스가 병행 진행 중이었던 것으로 보인다.
