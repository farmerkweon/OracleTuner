# FIX SPEC · Slice I — 항목 #15 (도움말 "설계 보기" 탭 · PlantUML 렌더 이미지)

총괄 작성 · 2026-07-30 21:3x

---

## 발주자 요구
> 도움말에 PlantUML 렌더링해서 설명도 함께 붙이면 좋겠다. 별도 탭 마련해서 "SQL 튜너 설계 보기" 식으로.
> UML 도 한국어/영어/일본어/중국어 따로따로.
> **"이미지를 넣으면 돼요. PlantUML 텍스트는 깃에다가 넣어주면 되고."**

⇒ **런타임에 렌더하지 않는다.** `.puml` 은 git 에 소스로 두고, **빌드 시점에 SVG 로 렌더해
그 이미지를 앱에 넣는다.** 폐쇄망 사용자는 렌더러가 없으므로 이 방식만 성립한다.

## 총괄이 실측으로 확인한 사실 (재조사 금지 — 그대로 쓰라)

| 항목 | 결과 |
|---|---|
| Graphviz(`dot`) | **없음** → PlantUML 내장 **smetana** 레이아웃을 써야 한다 |
| `plantuml-mit` | Maven Central 에 **1.2026.6 존재** (MIT 라이선스 변종. 표준 배포판은 GPL) |
| Docker | **이 머신에 미설치** (`docker` 명령 없음). 그래서 도커 경로는 폴백으로만 |
| Java | 17.0.19 (Eclipse Adoptium) 있음 |
| 렌더 실증 | 아래 명령으로 한글·전각대시·한자 포함 SVG 생성 성공, 실제 다이어그램 확인 |

**검증된 렌더 명령** (그대로 쓰라):
```
java -jar <plantuml-mit.jar> -tsvg -Playout=smetana <파일.puml>
```
`.puml` 안에 `!pragma layout smetana` 도 함께 넣어라(이중 안전).

⚠ **PlantUML SVG 는 비ASCII 를 숫자 문자 참조(`&#53916;`)로 인코딩한다.**
그래서 SVG 안에서 리터럴 한글을 grep 하면 안 나온다 — 정상이다. 이걸로 실패 판정하지 마라.
(총괄이 이 함정에 한 번 빠졌다. 검증은 **렌더한 PNG 를 눈으로 보는 방식**으로 하라.)

---

## 설계

### I-1. 디렉터리 (신규 — `tools/` 는 다른 에이전트 소유라 쓰지 마라)
```
design/
  fetch-plantuml.js     jar 다운로드(없으면). tools/fetch-driver.js 의 관용구를 따르라
  render.js             로케일별 .puml 생성 → SVG 렌더 → web/design/ 출력
  labels.json           { "<라벨키>": { ko, en, ja, zh } }
  src/*.puml            ★ 소스(git 에 커밋). 라벨은 ${키} 플레이스홀더로
  vendor/               jar 두는 곳 — .gitignore 에 추가(배포물·git 에 넣지 않는다)
web/design/*.svg        ★ 생성 결과(git 에 커밋 — 배포물이 이걸 쓴다)
```

### I-2. 로케일 4종 처리 (중요)
**`.puml` 을 4벌 손으로 쓰지 마라.** 1벌 + 번역표로 4벌을 생성하라.
`src/overview.puml` 안에 `${title}`, `${browser}` … 처럼 두고 `labels.json` 에서 치환해
`web/design/overview.ko.svg` … `overview.zh.svg` 4개를 만든다.

**렌더 시 로케일별 폰트를 지정하라.** PlantUML 이 글자 폭을 측정해 상자 크기를 정하므로
글리프가 없는 폰트면 레이아웃이 깨진다:
| 로케일 | `skinparam defaultFontName` |
|---|---|
| ko | `Malgun Gothic` |
| ja | `Yu Gothic` (없으면 `MS Gothic`) |
| zh | `Microsoft YaHei` |
| en | `Segoe UI` |

### I-3. 어떤 다이어그램을 그릴 것인가 (★ 판단 필요)
`docs/uml/*.puml` 은 **정찰 에이전트가 개발자용으로 덤프한 것**이다. 그걸 그대로 보여주지 마라 —
사용자·검토자가 읽을 화면이므로 **큐레이션한 5장**을 새로 작성하라:

1. **전체 구조** — 브라우저 / Node 서버 / Java 브리지 / Oracle 4계층과 오가는 것
2. **SQL 실행 흐름** — 편집기에서 실행 → API → 브리지 → JDBC → 결과 그리드 (시퀀스)
3. **튜닝 후보 · 토너먼트** — 분석 → 후보 생성 → 예선(결과 동일성) → 본선(계측) → 순위
4. **저장소** — 스니펫·튜닝이력·접속정보가 SQLite(`node:sqlite`) 에 어떻게 놓이는지 + 파일 모드 폴백
5. **배포 구조** — 설치판 `app\`/`runtime\`/`%LOCALAPPDATA%` 3분할과 포터블 차이

각 장은 **한 화면에 들어오게** 유지하라. 요소 15개를 넘기면 쪼개라.
시퀀스 다이어그램은 Graphviz 를 아예 안 쓰므로 2·3번은 시퀀스로 하면 안전하다.

### I-4. 도움말 탭
- `web/js/views/help.js` 는 **자체 로케일 사전 `L`** 을 가지고 있다(i18n.js 가 아니다).
  탭 제목·각 다이어그램 설명문을 그 `L` 에 ko/en/ja/zh **4개 전부** 넣어라.
- 탭 이름: ko `설계 보기` / en `Architecture` / ja `設計を見る` / zh `查看设计`
- 각 다이어그램마다 **그림 + 설명 문단**을 붙여라. 그림만 있으면 발주자 요구("설명도 함께")를 못 지킨다.
- 현재 로케일에 맞는 SVG 를 `<img src="/design/overview.<locale>.svg">` 로 불러라.
  언어를 바꾸면 그림도 함께 바뀌어야 한다.
- 그림은 **클릭하면 확대**되게 하라. 기존 모달(`.modal-backdrop`/`.modal`, 그리고 최근 추가된
  `.modal-xl`)을 재사용하라. 새 모달을 만들지 마라.
- `<img>` 에 `alt` 를 넣어라(접근성). `loading="lazy"` 도 넣어라(도움말은 무거운 화면이다).

---

## 검증 (필수)
1. `node design/render.js` 가 **SVG 20개**(5장 × 4로케일)를 만들어야 한다. 개수를 확인해 보고하라.
2. **눈으로 확인하라.** 각 로케일 대표 1장씩(총 4장) 헤드리스 크롬으로 PNG 로 찍어
   글자가 깨지지 않고 상자 밖으로 넘치지 않는지 확인하라:
   ```
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --no-sandbox `
     --user-data-dir=<임시> --window-size=1000,900 --virtual-time-budget=6000 `
     --screenshot=<png> file:///<svg 절대경로>
   ```
   ja/zh 는 폰트가 없으면 두부(□□□)로 나온다. 그러면 폰트를 바꿔 다시 렌더하라.
3. 도움말 탭을 실제로 열어 확인하라. 도움말은 클릭이 필요하니 `web/` 아래 임시 하네스로
   해당 렌더 함수만 호출해 찍고, **확인 후 하네스를 삭제**하라.
4. `npm test` — 기존 건수 유지.
5. jar 가 git 에 들어가지 않았는지 `git status` 로 확인하라(`.gitignore` 에 `design/vendor/`).

## 파일 소유권 (배타)
`design/**`(신규) · `web/design/**`(신규) · `web/js/views/help.js` · `web/css/app.css` ·
`web/index.html` · `.gitignore`

**만지지 말 것**: `server/**` · `java/**` · `web/js/i18n.js` · `web/js/views/candidates.js` ·
`tools/**` · `installer/**` · `test/run-tests.js` — 다른 에이전트가 작업 중이다.
