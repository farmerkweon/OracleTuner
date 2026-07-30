# RESULT · Slice I — 항목 #15 (도움말 "설계 보기" 탭 · PlantUML 렌더 이미지)

실행 에이전트 I. 상세 로그: `logs/agent/I-design.log`

## 결론

**런타임 렌더 없음.** `.puml` 은 `design/src/*.puml` 에 소스로 커밋하고, 빌드 시점(개발자 PC)에
`node design/render.js` 로 `java -jar plantuml-mit.jar -tsvg -Playout=smetana` 를 돌려 만든
SVG 20개(5장 × ko/en/ja/zh)를 `web/design/*.svg` 로 커밋했다. 앱은 그 SVG 를 `<img>` 로
보여줄 뿐이다 — 폐쇄망 사용자 PC 에는 Java/PlantUML 이 전혀 없어도 된다.

총괄이 실측한 렌더 명령·환경(Graphviz 없음 → smetana, plantuml-mit 1.2026.6, Java 17)을
그대로 썼고 재검증하지 않았다.

## 구조

```
design/
  fetch-plantuml.js   plantuml-mit jar 를 Maven Central 에서 받아 design/vendor/ 에 저장(idempotent)
  render.js            src/*.puml + labels.json → 로케일 치환 + 폰트 주입 → java -tsvg 렌더 → web/design/*.svg
  labels.json           {라벨키: {ko,en,ja,zh}} — .puml 은 ${키} 플레이스홀더만 쓴다(1벌)
  src/*.puml            5장 소스(git 커밋). 큐레이션 — docs/uml/*.puml(정찰 덤프)과는 다른 새 그림
  vendor/                jar 저장 위치(.gitignore, git 미포함)
web/design/*.svg         렌더 결과 20개(git 커밋 — 배포물이 이걸 쓴다)
```

- **로케일 4벌을 손으로 안 썼다** — `.puml` 1벌 + `render.js` 의 `substitute()` 가 `${키}` 를
  `labels.json` 로 치환해 4벌을 만든다.
- **폰트를 로케일별로 주입한다** — `!pragma layout smetana` 바로 다음 줄에
  `skinparam defaultFontName <Malgun Gothic|Yu Gothic|Microsoft YaHei|Segoe UI>` 를 끼워 넣는다.
- **PlantUML 은 `@startuml <이름>` 이 있으면 그 이름으로 출력 파일명을 정한다**(입력 파일명이
  아니다) — 처음엔 `@startuml overview` 식으로 썼다가 로케일마다 같은 이름(`overview.svg`)을
  덮어써서 20개 중 5개만 남는 버그를 렌더 직후 실측으로 발견했다. `@startuml`(이름 생략)로
  바꿔 입력 파일 basename(`overview.ko.svg` 등)을 그대로 쓰도록 고쳤다.

## 그림 5장 (docs/uml/*.puml 를 그대로 쓰지 않고 새로 큐레이션)

1. **overview** — 브라우저/Node 서버(REST API·정적 파일)/Java 브리지/Oracle, component 다이어그램
2. **sqlflow** — 실행→API→브리지→JDBC→결과 그리드, sequence
3. **tournament** — 후보 생성→예선(결과 동일성)→본선(계측)→순위, sequence
4. **storage** — SQL 라이브러리·튜닝이력·접속정보 → SQLite(node:sqlite) 기본, 실패 시 파일 모드 폴백
5. **deployment** — 설치판 `app\`/`runtime\`/`%LOCALAPPDATA%` 3분할 vs 포터블(`portable.marker` + 상대경로)

4·5번은 `server/repo/index.js`, `server/paths.js`, `docs/panel/FIX-SPEC-slice-H-installer.md`
를 읽고 사실관계를 확인한 뒤 그렸다(추측으로 그리지 않았다).

## 도움말 탭 (`web/js/views/help.js`)

- `TABS` 에 `design` 탭 추가(ko `설계 보기` / en `Architecture` / ja `設計を見る` / zh `查看设计`).
  자체 로케일 사전 `L` 대신 이 파일 안의 `DESIGN_DIAGRAMS`/`DESIGN_ZOOM_HINT` 상수로 4개 언어를
  모두 채웠다(기존 `START`/`ABOUT` 과 같은 패턴).
- 그림마다 `<h4>제목</h4><img loading="lazy" alt="...">` 뒤에 **설명 문단**을 붙였다(그림만 있으면
  발주자 요구 "설명도 함께"를 못 지킨다는 스펙 지적 반영).
- `<img src="/design/<name>.<locale>.svg">` — `getLang()` 이 바뀌면 `render()` 가 다시 불려
  그림도 같이 바뀐다(언어 전환 = 이미지 전환, 새로 만든 상태 없음).
- 확대는 **새 모달을 만들지 않고** `gridkit.js` 의 기존 `openDetailModal()`(`.modal-backdrop`/
  `.modal`/`.modal-xl`, 서브그리드 상세용으로 이미 있던 것)을 그대로 재사용했다. `#help-content`
  에 델리게이트 클릭 리스너 하나만 `initHelp()` 에서 등록(탭 재렌더 때마다 리스너가 쌓이지
  않도록 `render()` 안이 아니라 `initHelp()` 안에 둠).

## CSS (`web/css/app.css`)

`.design-tab`/`.design-fig`/`.design-fig-img`/`.design-fig-zoom` 추가. PlantUML SVG 는 항상
흰 배경으로 렌더되므로, 다크 테마에서도 이미지에 `background:#fff` 카드를 씌워 뜬 배경이
안 생기게 했다.

## 검증

1. **`node design/render.js` → SVG 20개, 실패 0개**(직접 실행 결과 확인: "완료: 20개 생성,
   0개 실패").
2. **로케일 4개 대표 1장씩 PNG 로 눈으로 확인**(헤드리스 크롬):
   `overview.ko`(한글 정상, 두부 없음) · `overview.en` · `tournament.ja`(일본어 시퀀스 라벨
   정상) · `storage.zh`(중국어 정상, 노트 줄바꿈 정상). 네 장 모두 글자 깨짐·두부(□□□)·
   상자 밖 넘침 없음.
3. **도움말 탭 실제 렌더 확인** — `web/design-harness-tmp.html` 임시 하네스로 실제 실행 중인
   서버(`http://127.0.0.1:7070`, 다른 에이전트가 이미 띄워 둔 인스턴스, 새로 안 띄움)에서
   `design/help.js` 의 `designHtml()` 를 직접 호출해 `app.css` 적용 상태로 스크린샷
   (lang=ko, lang=zh 확인 — 언어 전환 시 SVG 도 함께 바뀌는 것 확인됨). **확인 후 하네스
   파일을 삭제했고, 테스트를 위해 임시로 걸었던 `export` 한정자도 되돌렸다.**
   ⚠ 미검증: 그림 클릭 → 확대 모달이 실제로 뜨는 상호작용은 스크린샷 1장짜리 헤드리스
   캡처로는 확인할 수 없었다(정적 스크린샷 도구의 한계). `openDetailModal()` 자체는
   `gridkit.js` 에서 서브그리드 상세 확대로 이미 쓰이고 있는 검증된 함수이고, import·호출
   경로에 문법/런타임 오류가 없음은 하네스 로드 성공(콘솔 에러 없이 정상 렌더)으로 확인했다.
4. **`npm test` → 통과 163 · 실패 0**(+ 별도 섹션 F 4건도 통과) — 손댄 파일이 없는 테스트
   스위트라 기존 건수 그대로다.
5. **`git status` — jar 미포함 확인.** `git check-ignore -v design/vendor/plantuml-mit-1.2026.6.jar`
   → `.gitignore:31 design/vendor/` 매치 확인. `git ls-files --others --exclude-standard design/`
   에 `vendor/` 가 안 나온다(소스 8개 파일만).

## 파일

새로 만든 것: `design/fetch-plantuml.js`, `design/render.js`, `design/labels.json`,
`design/src/{overview,sqlflow,tournament,storage,deployment}.puml`, `web/design/*.svg`(20개).
고친 것: `web/js/views/help.js`, `web/css/app.css`, `.gitignore`.
안 건드린 것: `server/**`, `java/**`, `web/js/i18n.js`, `web/js/views/candidates.js`,
`tools/**`, `installer/**`, `test/run-tests.js` — 다른 에이전트 결과물이 그대로 있다
(`git status` 에 보이는 `tools/build-portable.js`/`tools/build-installer.js` 변경은 내 것이 아니다).
