# 결과 보고 — K (항목 #16: 도움말 화면 캡처 이미지)

## 한 일

1. **캡처 파이프라인** (`design/capture-help-shots.js`, 신규, 영구 스크립트 — design/render.js 와 대칭 위치)
   - 크롬 헤드리스 + `<iframe>` 하네스(같은 오리진) 방식으로 앱을 실제 렌더링해 캡처.
     `localStorage('ot.lang')` 로 로케일 전환, `.rail-tab`/`.tree-leaf`/`.rtab` 클릭으로 원하는
     화면 상태를 만든 뒤, iframe 을 음수 오프셋으로 밀어 넣고 `--window-size` 를 크롭 크기와
     똑같이 줘서 그 영역만 스크린샷("누끼" = 관심 영역만 타이트하게).
   - **크롬 프로세스 함정을 실측으로 발견/우회**: 이 환경의 `chrome.exe` 는 렌더링을 detach 된
     프로세스에 넘기고 먼저 종료해, `spawnSync` 의 "프로세스 종료 = 작업 완료" 가정이 깨지고
     `--dump-dom` 의 stdout 도 부모가 못 받는다(항상 빈 문자열). 그래서 애초 계획했던
     "measure(dump-dom)+shoot(screenshot)" 2단계 자동 측정 방식을 버리고, **CSS 실측값
     (`--topbar-h:46px`, `--railbar-h:36px`, `--footer-h:28px`, `.wb-dock` 230px,
     `.settings-wrap max-width:980px`)으로 크롭 좌표를 계산**하고 4개 화면(4 nav 상태)을 눈으로
     확인해 검증하는 방식으로 바꿨다. 완료 판정은 스크린샷 결과 파일이 생기고 크기가 안정될
     때까지 폴링.
   - **용량 최적화**: PNG→canvas→WebP 재인코딩 단계 없이, 크롬이 `--screenshot=out.webp` 로
     WebP 를 직접 출력한다는 걸 실측으로 확인해 그대로 사용(별도 재인코딩 하네스 불필요).

2. **이미지 자산** (`web/help-img/*.webp`, 신규 20개, 5종 × 4로케일)
   - `topbar` — 상단바(접속 버튼·상태 배지·언어/테마)
   - `sqllist` — SQL 목록(트리에서 항목을 실제로 클릭해 미리보기가 채워진 상태로 캡처)
   - `workbench` — 워크벤치(같은 항목을 더블클릭해 편집기에 실제 SQL 이 보이는 상태로 캡처;
     SQL 목록 도크는 이미지 ②와 중복이라 크롭에서 제외)
   - `tournament` — 튜닝 후보·토너먼트 탭(툴바 + 안내문. **실제 DB 연결이 없어 토너먼트를
     구동해 진행률 바가 도는 장면은 캡처하지 못했다** — 정적 상태만)
   - `settings` — 설정 화면의 "실행 기본값" 카드(안전모드 토글 포함)로 스크롤한 상태

3. **도움말 삽입** (`web/js/views/help.js`, `web/css/app.css`)
   - `HELP_SHOTS` 배열 + `shotsHtml(lang)` 을 추가하고 `start` 탭 렌더링에
     `(START[lang]||START.ko) + shotsHtml(lang)` 로 이어붙였다(기존 4벌 번역 템플릿 리터럴은
     건드리지 않음 — 위험 최소화).
   - 이미지는 `design` 탭이 이미 쓰던 **`design-fig`/`design-fig-img` 클래스를 그대로 재사용**
     — 새 모달을 만들지 않고 기존 `onDesignFigClick` → `gridkit.js` 의 `openDetailModal` 로
     확대되는 걸 그대로 물려받는다. `app.css` 에는 세로 스택 레이아웃용 `.help-shots` 규칙
     2줄만 추가.
   - 캡션 4개 국어(ko/en/ja/zh) 모두 작성.

## 검증

- **개수/용량**: 20개(5×4) 생성, 0개 실패. 총 393KB.
  `sqllist.ko`(40,652B)·`sqllist.en`(40,328B) 두 장만 40KB 목표를 약간(0.3~0.6KB) 초과, 나머지
  18장은 전부 40KB 이하(최소 5.6KB topbar, 최대 25KB workbench).
- **로케일 실제 전환 확인**: ko/ja/zh 세 로케일을 실제로 하네스에 렌더해 스크린샷으로 눈으로
  확인 — ja/zh 두부(□□□) 현상 없음, 텍스트 잘림 없음, 의도한 영역이 정확히 잡힘. en 은
  topbar/sqllist/settings 크롭 경계에서 텍스트가 한국어보다 길어질 수 있는 지점을 별도로
  점검해 잘림 없음을 확인.
- **도움말 실제 렌더 확인**: 임시 하네스(`web/help-img/_verify.html`, 확인 후 삭제)로 앱을 열어
  도움말 → 시작하기 탭까지 실제로 클릭해 5개 이미지가 모두 표시되는 것을 스크린샷으로 확인.
  이미지 클릭 시 `design` 탭과 동일한 확대 모달(`openDetailModal`)이 뜨는 것도 확인.
- **npm test**: 통과 163 + [F] 4 = **167**, 실패 0 (변경 전 대비 건수 유지 — 이 변경은
  프런트엔드 정적 자산이라 기존 테스트 스위트가 직접 다루지 않는다).
- **정리**: `web/help-img/_verify.html`, `web/help-img/_tmp/` 등 임시 파일 전부 삭제 확인.
  `git status` 로 의도한 파일만 변경됨을 확인(`design/capture-help-shots.js`,
  `web/help-img/*.webp` 20개, `web/js/views/help.js`, `web/css/app.css`).

## 알려진 한계 / 확인하지 못한 것

- `tournament.*` 이미지는 **실제 토너먼트를 실행한 화면이 아니다**(라이브 Oracle 연결이 이
  캡처 환경에 없어 [토너먼트 실행] 버튼을 눌러도 진행되지 않음). 발주자가 언급한 "방금 추가된
  프로그레스바" 가 도는 장면은 이번 캡처에 담기지 못했다. 필요하면 실제 DB 가 연결된 환경에서
  같은 하네스(`design/capture-help-shots.js` 의 `tournament` 타겟, `pick`/`rtab` 로직)를 재사용해
  버튼 클릭 후 대기 시간을 늘려 재캡처하면 된다.
- `web/help-img/*.webp` 는 `server/index.js` 의 MIME 맵에 `.webp` 항목이 없어
  `application/octet-stream` 으로 서빙된다(서버 코드는 다른 에이전트 소유라 손대지 않음).
  `<img>` 렌더링 자체는 실측 확인상 문제없었지만(브라우저가 nosniff 와 무관하게 이미지는
  바이트 스니핑으로 디코드), 정확한 `Content-Type` 을 원하면 `server/index.js` 의 `MIME` 맵에
  `'.webp': 'image/webp'` 한 줄 추가를 권장한다(이번 작업 범위 밖).
- 크롭 좌표는 CSS 실측값 + 시각 확인으로 정한 "실질적으로 안전한" 값이며, `getBoundingClientRect`
  기반 완전 자동 측정은 이 환경의 크롬 프로세스 특성 때문에 포기했다. 향후 UI 레이아웃이 크게
  바뀌면(예: `.wb-dock` 폭, `--topbar-h` 등 변경) `design/capture-help-shots.js` 의 `TARGETS`
  좌표를 다시 맞춰야 한다.
