# 배포판 무결성 전수 검사 — 1.0.0-beta.6

- 대상 브랜치: `feature/theme-tone-2026-07-30` / 커밋 `8c2e75a`
- 검사 시각: 2026-07-31 22:48 ~ 23:0x
- 검사 대상 스테이징
  - 설치판 `dist\oracle-tuner-1.0.0-beta.6-installer-win-x64-no-jre\` (파일 431개)
  - 포터블 `dist\oracle-tuner-1.0.0-beta.6-portable-win-x64-no-jre\` (파일 441개) / 동명 zip (엔트리 441개, 일치)
- 방법: 전량 스크립트 정적 분석. 눈으로 센 항목 없음.
  - `require`/`import` 리터럴 **161건** 추출 → 리포·설치판·포터블 3중 대조
  - 계산형 `require(path.join(...))` 별도 grep
  - web 정적 자원 12개 패턴(`src=`,`href=`,`url()`,`fetch`,`new Worker`,`importScripts`,`serviceWorker.register`,manifest `"src"` …) 추출 → 서버 정적 라우트(`/vendor/open-grid/`→`node_modules/open-grid/dist`, `/shared/`→`shared`, `/`→`web`) 로 역매핑 후 대조
  - 템플릿 리터럴로 조립되는 동적 이미지 경로(`/help-img/${name}.${lang}.webp`, `/design/${name}.${lang}.svg`) 는 목록 배열을 파싱해 **4개 언어 × 11개 = 44건** 실체 확인
  - 서버 라우트 47개 vs 웹 API 호출 54건 대조
  - 리포 원본 ↔ 스테이징 **MD5 전량 대조**(server/shared/web/demo/java)

---

## 요약

| 구분 | 건수 |
|---|---|
| **깨진 참조(참조 대상이 배포물에 없음)** | **5건** |
| ─ 실행 코드 경로(require/import/정적자원/API) | **0건** |
| ─ 스크립트·안내문 경로 | 5건 |
| 역방향 위반(들어가면 안 되는 것이 들어감) | 3건 |
| 설치판↔포터블 비대칭 | 10개 파일(그중 결함성 2건) |
| **배포물이 소스와 다름(스테일)** | **7개 파일** |

> 오늘 터진 유형(`require('../tools/install-demo')`)은 `4591bf6`(beta.5)에서 이미 잡혔고,
> **런타임 실행 경로에 같은 유형의 잔여 결함은 없다**(161건 전수 대조 결과 누락 0).
> 다만 아래 5건의 스크립트·안내문 경로가 같은 방식으로 죽어 있고, 역방향 위반 3건이 남아 있다.

### 가장 위험한 것 3개

| # | 항목 | 왜 위험한가 |
|---|---|---|
| **1** | **스테이징이 소스보다 낡았다 — `web/js` 7개 파일 MD5 불일치** | 배포된 beta.6 에는 현재 소스의 `api.js·app.js·editor.js·gridkit.js·i18n.js·util.js·views/library.js` 가 **들어 있지 않다.** 지금 두 에이전트가 `web/js/**` 를 고치는 중이라 "작업 중"일 수 있으나, **현재 배포 스테이징 = 배포된 zip 은 소스와 다른 물건**이다. 홍보 글이 이미 나간 상태이므로 재빌드 없이는 어떤 수정도 사용자에게 도달하지 않는다. |
| **2** | **`STATUS.md` 가 포터블에만 동봉 — 내부 배포 서버 경로 노출** | 포터블 zip 루트에 내부 릴리스 현황 문서가 들어 있고, 그 안에 `https://foxnail.kr/wp-content/uploads/download/oracle-tuner/` 업로드 경로가 적혀 있다. 자격증명은 아니지만 배포 인프라 구조가 공개된다. **설치판에는 없다 — 포터블만 열어보면 안 드러나는 비대칭.** |
| **3** | **`java/out/.sources.txt` · `.build-stamp.json` 이 양쪽 모두에 개발자 절대경로를 싣고 나감** | `"E:/IBANK/SeTools/OracleTuner/java/src/..."` 8줄 + `"javac":"C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.19.10-hotspot\\bin\\javac.exe"`. 빌드 산출물 부산물이며 런타임에 `java/build.js:92` 가 어차피 덮어쓰므로 **실행에는 무해**하나, 내부 경로·개발 환경이 그대로 유출된다. |

---

## 1. 런타임 `require` / `import` 상대경로 전수 (161건)

**깨진 참조 0건.** 리포에서 해석되는 상대경로 참조 116건 전부가 설치판·포터블 양쪽에 존재.
나머지는 내장 모듈(`fs`,`path`,`os`,`crypto`,`net`,`url`,`child_process`) 또는 서버 라우트 URL.

### 함수 안·조건부 `require` (오늘 사고와 같은 형태) — 전부 정상

| 참조 위치 | 참조 대상 | 형태 | 설치판 | 포터블 | 판정 |
|---|---|---|---|---|---|
| `server/api.js:138` | `../java/build` → `java/build.js` | 라우트 핸들러 **안**의 require | ✅ | ✅ | 정상 (`APP_ITEMS` 에 `java/build.js` 명시 + `.iss` 가 `java\*` 재귀 복사) |
| `server/api.js:825` | `path.join(P.root,'demo','02-examples.js')` | **계산형** require, 함수 안 | ✅ | ✅ | 정상 (beta.5 에서 `demo/` 추가됨) |
| `server/demo-install.js:49` | `path.join(DEMO_DIR,'02-examples.js')` | **계산형** require, 함수 안 | ✅ | ✅ | 정상 |
| `server/repo/index.js:19` | `./sqlite` | 최상위 | ✅ | ✅ | 정상 (`node:sqlite`, 번들 node **v24.15.0** 확인 — 요구 22+ 충족) |

### URL 형태 참조(파일 아님) — 서버 정적 라우트로 해소 확인

| 참조 위치 | 참조 대상 | 매핑 근거 | 실체 |
|---|---|---|---|
| `web/js/app.js:24` | `import('/shared/sql-tokenizer.js')` (동적 import) | `server/index.js:45` `{'/shared/'→P.shared}` | ✅ `shared/sql-tokenizer.js` 양쪽 존재 |
| `web/js/gridkit.js:8`, `web/js/icons.js:16` | `'/vendor/open-grid/open-grid.js'` | `server/index.js:44` `{'/vendor/open-grid/'→node_modules/open-grid/dist}` | ✅ `node_modules/open-grid/dist/open-grid.js` 양쪽 존재 |

---

## 2. 런타임이 읽는 데이터 파일

| 참조 위치 | 참조 대상 | 설치판 | 포터블 | 영향 | 심각도 |
|---|---|---|---|---|---|
| `server/demo-install.js:48` | `demo/01-setup.sql` | ✅ | ✅ | — | — |
| `server/demo-install.js:49` | `demo/02-examples.js` | ✅ | ✅ | — | — |
| `server/demo-install.js:52` | `demo/09-drop.sql` | ✅ | ✅ | — | — |
| `server/bridge.js:68`, `server/config.js:309` | `java/out/kr/foxnail/otuner/Bridge.class` | ✅ | ✅ | — | — |
| `server/config.js:263` | `java/lib/*.jar` → `ojdbc11.jar` (7.5MB) | ✅ | ✅ | — | — |
| `server/config.js:264` | `<앱루트>/lib` (선택적 jar 스캔) | ❌ | ❌ | 없음 — `existsSync` 가드(`config.js:255`) | 없음 |
| `server/paths.js:129` | `<앱루트>/config/connections.json` (설치 최초 실행 이관) | ❌ | ❌(빈 폴더) | 없음 — `existsSync` 가드 + `try/catch` | 없음 |
| `server/secret.js:27` | `P.keyFile` | ❌ | ❌ | 없음 — `catch` 후 32byte 새로 생성(`secret.js:31-33`) | 없음 |
| `installer/tray/OracleTunerTray.cs:206-208` | `runtime\node.exe`, `server\index.js`, `OracleTuner.ico` | ✅/✅/스테이징엔 없음* | ✅ | *`.iss:154` 가 `installer\OracleTuner.ico` 를 설치 시 `{app}` 에 넣으므로 **설치된 앱은 정상**. 스테이징 폴더를 그대로 실행하면 아이콘만 빠진다 | 정보 |
| `installer/OracleTuner.vbs:31-32` | `runtime\node.exe`, `server\index.js` | ✅ | ✅ | — | — |
| 포터블 `OracleTuner.bat` | `runtime\node.exe`, `server\index.js` | (해당없음) | ✅ | — | — |

데이터 루트: `server/paths.js resolveMode()` — 설치판은 `portable.marker`/`.git` 둘 다 없으므로 `installed` 모드 → `%LOCALAPPDATA%\OracleTuner\`. 설치 스테이징에 `config/`·`data/`·`logs/` 가 없는 것은 **의도된 설계이며 결함 아님**(`ensureDirs()` 가 생성).

---

## 3. web 정적 자원 (깨진 참조 0건)

| 참조 위치 | 참조 대상 | 실체 | 판정 |
|---|---|---|---|
| `web/index.html:10` | `/icon.svg` | `web/icon.svg` | ✅ |
| `web/index.html:11-12` | `/icons/icon-192.png` | `web/icons/icon-192.png` | ✅ |
| `web/index.html:16` | `/manifest.ko.webmanifest` (+ 런타임에 en/ja/zh 로 교체) | 4벌 전부 | ✅ |
| `web/index.html:19-21` | `/vendor/open-grid/open-grid-{base,themes,skins}.css` | `node_modules/open-grid/dist/` | ✅ |
| `web/index.html:22` | `/css/app.css` | `web/css/app.css` | ✅ |
| `web/index.html:513` | `/js/app.js` (type=module) → `views/*.js` 9개 | 9개 전부 | ✅ |
| `manifest.{ko,en,ja,zh}.webmanifest` | `/icons/icon-192.png`, `/icons/icon-512.png` | 둘 다 | ✅ |
| `web/js/views/help.js:279` | `/help-img/{topbar,sqllist,workbench,tournament,settings}.{ko,en,ja,zh}.webp` **20건** | 20건 전부 | ✅ |
| `web/js/views/help.js:584` | `/design/{overview,sqlflow,tournament,storage,deployment,usecase}.{ko,en,ja,zh}.svg` **24건** | 24건 전부 | ✅ |
| `web/js/views/help.js:750,758` | `/help-img/qr-sudoku.png`, `/help-img/qr-artgrid.png` | 둘 다 | ✅ |
| `web/js/project.js:12` | `licenseFile` = GitHub 외부 URL | (외부) | 해당없음 |

### PWA 서비스워커
`web/sw.js` (50줄) 확인 결과 **precache 목록(`cache.addAll([...])`)이 없다.** `install` 단계에서 파일 목록을 미리 받지 않고 `fetch` 이벤트에서 성공한 응답만 런타임 캐시한다(`sw.js:34` `/api/` 는 캐시 제외).
→ **"캐시 목록에 적혀 있는데 배포물엔 없어서 SW 설치가 통째로 실패하는" 유형의 위험은 구조적으로 없다.**

### API 라우트
서버 47개 라우트 vs 웹 54개 호출 대조 — **미스 0건.** (스크립트가 처음 잡아낸 12건은 전부 오탐: `/api/meta/*` 9개는 `server/api.js:702-710` 의 맵 루프로 등록되고, 나머지 3건은 쿼리스트링 템플릿 리터럴.)

---

## 4. 설치판 vs 포터블 차이

**설치판은 포터블의 진부분집합이다 — 설치판에만 있는 파일 0개.** (오늘 사고의 `demo/` 비대칭은 해소됨: 양쪽 모두 3개 파일 존재.)

| 포터블에만 있는 파일 | 성격 | 문제인가 |
|---|---|---|
| `OracleTuner.bat` | 포터블 전용 런처 | 정상(의도) |
| `OracleTuner.ico` | 트레이 아이콘 | 정상 — 설치판은 `.iss:154` 가 `installer\` 에서 직접 공급 |
| `portable.marker` | 모드 판정 표식 | 정상(의도) — 설치판에 있으면 오히려 사고 |
| `config/.gitkeep`, `data/{snippets,tunings}/.gitkeep`, `logs/.gitkeep` | 빈 폴더 유지용 | 정상 — 설치판은 `%LOCALAPPDATA%` 사용 |
| `README.txt` | 포터블 사용 안내 | 정상(의도) |
| **`STATUS.md`** | **내부 릴리스 현황 문서** | ❌ **역방향 위반 — 3.2 참조** |
| **`tools/fetch-driver.js`** | JDBC 드라이버 내려받기 CLI | ⚠ **비대칭 — 아래 5번 표 참조** |

---

## 5. 깨진 참조 5건 (스크립트·안내문 경로)

전부 "배포 대상이 아닌 폴더를 가리키는" **오늘 사고와 동일한 유형**이다. 다만 UI 버튼이 아니라 CLI·안내문이라 500 은 나지 않는다.

| # | 참조하는 파일:행 | 참조 대상 | 설치판 | 포터블 | 영향(무엇이 죽는가) | 심각도 |
|---|---|---|---|---|---|---|
| B1 | `package.json:11` `scripts.install-demo` | `tools/install-demo.js` | ❌ | ❌ | `npm run install-demo` → `MODULE_NOT_FOUND`. 배포물의 `package.json` 이 없는 파일을 가리킨다 | 중간 |
| B2 | `package.json:13` `scripts.test` | `test/run-tests.js` | ❌ | ❌ | `npm test` → 즉시 실패. 사용자가 자가진단으로 실행할 수 있는 유일한 명령 | 중간 |
| B3 | `package.json:10` `scripts.fetch-driver` | `tools/fetch-driver.js` | ❌ | ✅ | **비대칭.** 설치판에서만 `npm run fetch-driver` 실패 → **포터블만 써보면 안 드러난다**(오늘 `demo/` 와 정확히 같은 함정) | 중간 |
| B4 | `server/config.js:307` | 진단 화면 힌트 문자열 ``"`npm run fetch-driver` 로 내려받을 수도 있습니다"`` | ❌ | ⚠ | ojdbc jar 가 없을 때 UI **[진단]** 탭이 사용자에게 실행 불가능한 명령을 안내한다. 설치판엔 파일 자체가 없고, 양쪽 모두 `npm`/PATH 의 node 가 없다(번들은 `runtime\node.exe` 뿐) | 중간 |
| B5 | `server/demo-install.js:6-7` (주석) | `node tools/install-demo.js` | ❌ | ❌ | 문서상 안내가 배포물에서 성립하지 않음. 소스 읽는 사람만 영향 | 낮음 |

> **B4 보강**: `server/config.js:315` 의 ``"`npm run build:java` 를 실행하거나"`` 힌트는 `java/build.js` 가 **실제로 동봉되어 있으므로**(APP_ITEMS·[Files] 양쪽 확인) 대상 파일은 존재한다. 다만 `npm` 이 없다는 점은 B4 와 동일.

### (확인필요) 인접 위험 — 쓰기 권한

| 참조 위치 | 동작 | 위험 |
|---|---|---|
| `java/build.js:92-93` | `<앱루트>/java/out/.sources.txt` **쓰기** | `POST /api/bridge/build`(`server/api.js:137-141`)은 `build()` 를 **try/catch 없이** 호출한다. 기본 설치 위치 `C:\APPS\Oracle Tuner` 는 쓰기 가능하지만, 사용자가 설치 경로를 `C:\Program Files\...` 로 바꾸면 EPERM → 500. **(확인필요: 라우트 디스패처의 전역 try/catch 유무)** |
| `tools/fetch-driver.js:55,61` | `<앱루트>/java/lib/*.jar` **쓰기** | 위와 동일 조건. 설치판엔 파일이 없어 도달 불가(B3) |

---

## 6. 역방향 점검 — 들어가면 안 되는 것

### 6.1 자격증명 — **유출 0건. 안전.**

| 확인 항목 | 결과 |
|---|---|
| `tools/publish/**` (WordPress 업로드 PHP 4종 — 서버 접속정보 보유) | ✅ **양쪽 모두 미포함.** 포터블이 담는 `tools/` 는 `fetch-driver.js` **1개뿐**임을 파일 목록으로 확인 |
| `config/secret.key` (AES 키) | ✅ 양쪽 미포함 (포터블 `config/` 는 `.gitkeep` 만) |
| `config/connections.json` (접속 프로필, 암호 포함) | ✅ 양쪽 미포함 |
| `.env` / `*.pem` / `*.key` / `.git*` / `.omc` | ✅ 없음 (`isJunk()` 가 `.omc`/`.git` 필터 — `build-installer.js:50-53`) |
| 정규식 스캔 `password=`/`api_key=`/`BEGIN * PRIVATE`/`ftp://`/`sftp://`/`ssh://`/`wp-admin`/`xmlrpc` (node_modules 제외 전량) | ✅ 설치판 **0건 매치**, 포터블 **1건**(`STATUS.md` — 6.2) |
| 사용자 데이터(`data/**` 실데이터, `logs/*.log`) | ✅ 없음 (포터블은 `.gitkeep` 만) |

### 6.2 내부 정보 유출 — **3건**

| # | 파일 | 내용 | 설치판 | 포터블 | 심각도 |
|---|---|---|---|---|---|
| R1 | `STATUS.md` | 내부 릴리스 현황. 16행에 배포 서버 업로드 경로 `https://foxnail.kr/wp-content/uploads/download/oracle-tuner/` | ❌ | ⚠ **포함** | 중간 |
| R2 | `java/out/.sources.txt` | 개발자 절대경로 8줄 (`"E:/IBANK/SeTools/OracleTuner/java/src/kr/foxnail/otuner/*.java"`) | ⚠ 포함 | ⚠ 포함 | 낮음 |
| R3 | `java/out/.build-stamp.json` | 빌드 머신 JDK 절대경로 `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\javac.exe`, 빌드 시각 | ⚠ 포함 | ⚠ 포함 | 낮음 |

R2·R3 는 `java/build.js` 가 실행 시 재생성하므로 **삭제해도 기능에 영향 없다**(`build.js:93` `writeFileSync`).

---

## 7. `package.json` dependencies vs 스테이징 — 정상

| 선언 | 요구 | 스테이징 | 판정 |
|---|---|---|---|
| `dependencies.open-grid` `^1.4.0` | `node_modules/open-grid` | ✅ 양쪽 (v1.4.0, `dist/` 포함 — `/vendor/open-grid/` 라우트가 가리키는 실체) | ✅ |
| `open-grid` 의 전이 의존성 | `dependencies: {}` (없음) | — | ✅ |
| `open-grid` 의 `peerDependencies` (react/vue) | 이 앱은 vanilla 진입점(`open-grid.js`)만 사용 | 미포함 | ✅ 정상 |
| `engines.node >= 18` / `node:sqlite`(22+ 필요) | `runtime/node.exe` | ✅ **v24.15.0** 실측 | ✅ |

---

## 8. 배포물 ↔ 소스 정합성 (MD5 전량 대조)

`server/`·`shared/`·`web/`·`demo/`·`java/src`·`java/out` 전량 해시 비교.

- **누락: 설치판 0건, 포터블 0건**
- **내용 불일치(스테일): 양쪽 동일하게 7개 파일**

| 스테일 파일 | 설치판 | 포터블 |
|---|---|---|
| `web/js/api.js` | ≠ | ≠ |
| `web/js/app.js` | ≠ | ≠ |
| `web/js/editor.js` | ≠ | ≠ |
| `web/js/gridkit.js` | ≠ | ≠ |
| `web/js/i18n.js` | ≠ | ≠ |
| `web/js/util.js` | ≠ | ≠ |
| `web/js/views/library.js` | ≠ | ≠ |

> 검사 시점에 다른 에이전트가 `web/js/**` 를 편집 중이므로 **작업 중 상태일 가능성이 높다.**
> 그러나 사실로서: **현재 `dist\` 에 놓여 있고 홍보 글이 가리키는 beta.6 산출물은 위 7개 파일에 대해 소스와 다른 물건이다.**
> 포터블 zip(441 엔트리)은 스테이징 폴더(441개)와 개수가 일치하므로, zip 도 동일하게 낡았다.

---

# 수정 지시 (총괄이 그대로 적용)

## 즉시 (재빌드 전 필수)

### D1. `STATUS.md` 를 포터블에서 뺀다 — 최우선
`tools\build-portable.js` 의 `INCLUDE` 배열(27-40행)에서 `['STATUS.md', 'STATUS.md'],` 줄(38행)을 **삭제**한다.
(`INCLUDE` 는 `[원본, 대상]` 쌍 배열이다. 같은 배열 34행의 `['tools/fetch-driver.js', ...]` 가 D4 의 비대칭 원인이기도 하다.)
사용자용 안내는 이미 `README.txt` 가 따로 생성되므로 대체물 불필요.
→ *(내부 배포 서버 경로 노출 차단. 설치판엔 원래 없었다.)*

### D2. `java/out/` 의 빌드 부산물 2개를 스테이징에서 제외한다
`tools\build-installer.js` 의 `isJunk()`(50-53행)와 `tools\build-portable.js` 의 동명 함수에
`.sources.txt` · `.build-stamp.json` 을 추가한다.

```js
function isJunk(src) {
  const base = path.basename(src);
  return base === '.omc' || base === '.git' || base === '.vscode'
      || base === '.DS_Store' || base === 'Thumbs.db'
      || base === '.sources.txt' || base === '.build-stamp.json'; // ← 추가
}
```
→ *`java/build.js:92-93` 이 실행 시 재생성하므로 기능 영향 없음. 개발자 절대경로 유출만 사라진다.*
→ 부수 효과(의도된 것): 스탬프가 없으면 첫 실행에서 브리지를 한 번 재빌드하려 시도한다. `javac` 가 없으면 `build.js:84` 가 "기존 빌드된 클래스를 사용합니다" 로 조용히 넘어가므로 no-jre 판에서도 안전하다.
→ **(확인필요)** 이 부수 효과가 싫으면 `.build-stamp.json` 은 남기고 `javac` 절대경로만 마스킹하는 쪽으로 바꿔도 된다.

### D3. 배포물의 `package.json` 에서 죽은 script 를 제거한다 (B1·B2·B3)
`tools\build-installer.js` 와 `tools\build-portable.js` 의 스테이징 단계에서 `package.json` 을
**그대로 복사하지 말고**, `scripts` 를 배포용으로 줄여 쓴다. 두 스크립트 공통으로:

```js
// package.json 은 원본을 그대로 넣지 않는다.
// 배포물에 없는 파일을 가리키는 script 가 남으면 사용자가 실행했을 때 MODULE_NOT_FOUND 로 죽는다
// (2026-07-31 tools/install-demo 사고와 같은 유형).
const pkg = JSON.parse(fs.readFileSync(path.join(P.root, 'package.json'), 'utf8'));
pkg.scripts = { start: 'node server/index.js', 'build:java': 'node java/build.js' };
fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
```
(설치판은 `stageDir`, 포터블은 `stage` 변수명에 맞춰 적용. `APP_ITEMS` / `INCLUDE` 의 `'package.json'` 항목은 그대로 두고 위 덮어쓰기를 **그 뒤에** 실행하면 된다.)

→ 남기는 2개는 대상 파일이 실제로 동봉되어 있음을 확인했다(`server/index.js`, `java/build.js`).

## 곧이어

### D4. `tools/fetch-driver.js` 비대칭을 해소한다 (B3·B4)
두 안 중 하나. **② 권장.**

- **① 양쪽에 넣는다**: `tools\build-installer.js` 의 `APP_ITEMS` 에 `'tools/fetch-driver.js'` 를 추가하고, `installer\OracleTuner.iss` `[Files]` 에
  `Source: "{#SrcDir}\tools\fetch-driver.js"; DestDir: "{app}\tools"; Flags: ignoreversion` 한 줄 추가.
  ⚠ `tools\*` 를 **와일드카드로 넣지 말 것** — `tools\publish\**` 에 서버 접속정보가 있다. 반드시 파일 단위로.
- **② 코드를 `server/` 로 옮긴다 (권장, 오늘 `install-demo` 와 같은 처방)**:
  본체를 `server\driver-fetch.js` 로 이동하고 `tools\fetch-driver.js` 는 `require('../server/driver-fetch.js')` 하는 16줄짜리 CLI 래퍼로 남긴다(`tools\install-demo.js` 가 이미 그 형태다).
  그러면 `server/**` 는 이미 양쪽 스테이징 대상이라 자동으로 해결되고, UI 에서 "드라이버 내려받기" 버튼을 붙일 길도 열린다.

### D5. `server/config.js:307` 의 힌트 문구를 배포판에서 실행 가능한 안내로 고친다 (B4)
현재: ``java/lib 폴더에 ojdbc11.jar(또는 ojdbc8.jar)를 넣거나, 설정에서 경로를 직접 지정하세요. `npm run fetch-driver` 로 내려받을 수도 있습니다.``
→ 배포판에는 `npm` 이 없다(번들은 `runtime\node.exe` 뿐). D4-② 를 택했다면 "설정 → 드라이버 내려받기" 로,
아니면 `npm run fetch-driver` 부분을 삭제하고 수동 배치 안내만 남긴다.
`server/config.js:315` 의 ``npm run build:java`` 도 같은 이유로 "서버를 재시작하면 자동으로 빌드합니다" 만 남기는 편이 정확하다.

### D6. `server/demo-install.js:6-7` 주석 갱신 (B5)
`node tools/install-demo.js` → 배포판에 없음을 명시하거나 `node server/demo-install.js` 로 교체.

## 재빌드 (위 전부 적용 후)

### D7. beta.7 로 올려 **반드시 재빌드·재배포**한다 — 8번 항목
현재 `dist\` 의 beta.6 산출물은 `web/js` 7개 파일에서 소스와 다르다. `web/js/**` 작업 중인 두 에이전트의 작업이 끝난 뒤
설치판·포터블을 다시 굽고, **재빌드 직후 아래 3줄로 정합성을 재확인**할 것(이 검사에 쓴 것과 동일한 대조):

```bash
# 스테이징이 소스와 같은지 (기대: 0건)
node -e "const fs=require('fs'),p=require('path'),c=require('crypto');const R=process.cwd();const S=p.join(R,'dist/<스테이징폴더명>');const w=(d,o=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=p.join(d,e.name);e.isDirectory()?(['node_modules','.git','.omc'].includes(e.name)||w(q,o)):o.push(p.relative(R,q).split(p.sep).join('/'))}return o};const h=f=>c.createHash('md5').update(fs.readFileSync(f)).digest('hex');let n=0;for(const d of ['server','shared','web','demo'])for(const r of w(p.join(R,d))){const a=p.join(S,r);if(!fs.existsSync(a)||h(p.join(R,r))!==h(a)){n++;console.log('DIFF',r)}}console.log('mismatch:',n)"

# 배포물에 접속정보가 섞였는지 (기대: 매치 0)
grep -rIlE "(ftp|sftp|ssh)://|wp-admin|xmlrpc|password\s*[:=]\s*['\"]" --exclude-dir=node_modules dist/<스테이징폴더명>

# 설치판이 포터블의 부분집합인지 (기대: 출력 없음 = 설치판에만 있는 파일 없음)
comm -23 <(cd dist/<설치판> && find . -type f | sort) <(cd dist/<포터블> && find . -type f | sort)
```

---

## 부록 — 이번 검사에서 **문제 없음**으로 확인한 것 (재검 불필요)

| 항목 | 근거 |
|---|---|
| 함수 안·`try` 안 조건부 `require` 전부 | 161건 전수 추출 → 누락 0 (`server/api.js:138`, `825` 포함) |
| 계산형 `require(path.join(...))` 2곳 | `demo/02-examples.js` 양쪽 존재 |
| `demo/` 3파일 | 설치판·포터블 모두 존재 (beta.5 `4591bf6` 수정 반영 확인) |
| `java/lib/ojdbc11.jar` | 양쪽 존재 (7,493,107 bytes) |
| `node_modules/open-grid/dist/**` | 양쪽 존재, `/vendor/open-grid/` 라우트와 일치 |
| web 아이콘·폰트·이미지 | `help-img` 20 + `design` 24 + QR 2 + 아이콘 3 전부 존재 |
| PWA manifest 4벌 + 참조 아이콘 | 전부 존재 |
| `sw.js` 캐시 목록 | precache 목록 자체가 없음(런타임 캐시 전용) — 구조적으로 안전 |
| 웹→서버 API 라우트 | 54 호출 전부 47 라우트에 매칭 |
| `runtime/node.exe` 버전 | v24.15.0 — `node:sqlite` 요구(22+) 충족 |
| 자격증명·`tools/publish/**`·`config/secret.key`·`config/connections.json` | 양쪽 모두 **미포함** |
| 설치판에만 있는 파일 | **0개** (설치판 ⊂ 포터블) |
| 포터블 zip ↔ 스테이징 폴더 | 엔트리 441 = 파일 441, 일치 |
