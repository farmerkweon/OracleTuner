# Result · T-theme (Phase 2 실행)

브랜치 `feature/theme-tone-2026-07-30` · 커밋 3개(각 Phase 지시대로 분리):

1. `7af9276` theme: app.css 하드코딩 헥사를 CSS 변수/color-mix로 치환 (동작 불변)
2. `aceba32` theme: 테마 8종 앱 변수 오버라이드 추가 (:root[data-ot-theme] 블록)
3. `1286914` theme: dark 패밀리 문법색 12종·버튼 on-color, 그라디언트 변수화

배타 소유 파일만 수정: `web/css/app.css` (총 202줄 변경, 3커밋 분리). `web/js/gridkit.js`는
건드리지 않았다(필요 없었음). `web/js/views/workbench.js`는 세션 시작 전 다른 레인이 이미
커밋한 상태였고 내가 건드리지 않았다 — 확인 후 커밋 대상에서 제외.

## 검증

- `npm test`: 163건 + 섹션 F 4건, 전부 통과(커밋마다 재확인).
- 8개 테마(default·modern·ocean·forest·indigo·slate·executive·dark) × SQL목록/워크벤치
  스크린샷 16장 + Help 모달(forest/dark/slate/executive) 4장 + 실제 SQL 로드 후 문법색
  4장(default/dark/slate/executive), 총 24장. 임시 하네스(`web/__theme-harness-T.html`)는
  검증 후 삭제, `git status`로 `web/css/app.css` 외 변경 없음 확인.
- 결과: 8개 테마 전부 상단바·레일바·패널·버튼·푸터가 그리드 톤과 한 몸으로 보임(기존
  "그리드만 색 있고 나머지 흰색" 문제 해소 확인, 특히 dark/slate/executive에서 뚜렷).
  dark 3종의 `.btn-primary`/`.btn-accent`/`#btn-help:hover` 글자가 `var(--bg)`로 바뀌어
  선명하게 읽힘. dark 3종 SQL 에디터 문법색(키워드/문자열 등)도 실제 SQL 로드해 육안 확인 —
  가독성 양호. light 5종은 커밋1 이전과 사실상 동일(회귀 없음).

## 판단이 필요한 지점 (임의로 정하지 않고 여기 남김)

1. **Group C(경고/accent 텍스트) 커밋 배정**: 팔레트 §4.3의 `.hw-notables`/`.help-disclaimer`
   (`#6b4e10`→`var(--warn)`)와 `.help-support`(`#4a3a78`→`var(--accent)`)는 3커밋 구조 어디에도
   명시적으로 배정돼 있지 않았다(커밋2=§2A/§2B만, 커밋3=§3.2/§3.3/§4.4만). 소거법으로 커밋1에
   넣었는데, 이 치환 자체가 기본 테마에서 **육안으로 확인 가능한 색 변화**를 만든다(warn 텍스트가
   `#6b4e10`→`#b26a00`으로, accent 텍스트가 `#4a3a78`→`#6b3fd4`로 — 둘 다 커밋1의 "동작 불변"
   요구와 결이 다르다). 팔레트 문서가 이 치환을 명시적으로 지시했고(§4.3), 오히려 앱 안에
   이미 존재하던 불일치(`.diag-hint`/`.caution-list`는 진작부터 `var(--warn)`을 쓰고 있었음,
   `.help-support-title`도 이미 `var(--accent)`를 쓰고 있어 본문 텍스트만 따로 놀았음)를
   없앤다고 판단해 진행했다. **총괄 확인 필요**: 이 판단이 맞는지, 아니면 커밋1에서 제외하고
   별도 처리했어야 하는지.
2. **forest 예외 처리 위치**: `.help-support`의 forest AA 미달(3.88, §2A 각주)을 막기 위한
   `:root[data-ot-theme="forest"] .help-support { color: #4a3a78; }`는 커밋2(테마 오버라이드)에
   넣었다 — 커밋2 지시문이 "§2A/§2B 표의 값을 그대로"라고만 했지만 이 예외도 테마별 오버라이드의
   성격이라 커밋2가 가장 자연스럽다고 판단.
3. **`.help-support` 보더(`#e0d6fb`)**: 팔레트 §4 어디에도 이 보더는 언급이 없다. 임의로 확장하지
   않고 리터럴 그대로 남겼다(코드에 주석 남김). 텍스트만 테마를 따라가고 보더는 고정이라 8개
   테마 중 accent가 많이 다른 테마(예: ocean `#3931b9`, indigo `#7e31b9`)에서 보더·텍스트 색이
   서로 안 어울릴 수 있음 — 스크린샷에서는 크게 눈에 띄지 않았으나 총괄 확인 권장.

## WARN (코드에 주석으로도 남김, 고치지 않음)

- `.btn-danger`의 `color:#fff`: 팔레트 §4.4가 `.btn-primary`/`.btn-accent`/`#btn-help:hover`만
  명시하고 `.btn-danger`는 언급하지 않아 dark 패밀리 대응에서 제외했다. dark 3종의 `--danger`가
  텍스트용으로 밝게 튜닝된 파스텔이라(§2B) 흰 글자와 대비가 낮을 가능성이 있다.
  `.btn-danger`가 실제로 쓰이는 화면(삭제 확인 등)을 스크린샷 경로에 넣지 못해 육안 확인은
  못 했다 — 미확인.
- `.badge`(결과 탭 배지)·`.brand-mark`(로고 이니셜)의 `color:#fff`: 같은 종류의 위험이 있으나
  팔레트 문서 범위 밖이라 손대지 않았다.
- `.sqlt-qident`의 밑줄 `rgba(0,0,0,.25)`: 다크 배경에서 거의 안 보일 수 있으나 문서가 다루지
  않아 그대로 뒀다.
- `.plan-text`의 `color:#333`, `.sev-low`의 `color:#4a5568`, `.detail-panel code/pre`의
  `background:#f4f6f8`: 팔레트 §4 그룹 목록에 없어 변수화하지 않았다(스코프 확장 안 함).
- Group B(color-mix 35% 배지/보더)와 Group C(경고/accent 텍스트) 치환은 원본 리터럴과 화소
  단위로 완전히 같지 않다(계산 예: `--ok 35% + panel` → `#b0d7c5`, 원본 `#b9e2cd`, 채널당
  8~11 차이). 팔레트 문서가 이 공식을 명시적으로 지시했고 스크린샷상 눈에 띄는 차이는 아니라고
  판단했다.

## 확인하지 못한 것 (완료로 적지 않음)

- `.btn-danger` 실제 클릭 동선(삭제 확인 등)의 dark 3종 렌더링.
- 힌트 위저드(`.hw-item` 등, `.hw-notables` 제외)·튜닝 이력·스키마 뷰는 스크린샷 경로에 넣지
  못했다 — DB 미접속 상태라 데이터가 없는 빈 화면만 확인 가능했을 것으로 예상되나 실측하지 않음.
- 그리드 자체 색(Open Grid `--og-*`)과 이번 앱 변수 사이의 실제 데이터 로드 상태에서의 충돌
  여부는 DB 접속 없이는 확인 불가 — 미확인.
