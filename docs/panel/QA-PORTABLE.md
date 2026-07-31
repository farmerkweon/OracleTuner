# QA — Oracle Tuner 1.0.0-beta.6 포터블 실물 점검

| 항목 | 값 |
|---|---|
| 점검 일시 | 2026-07-31 22:48 ~ 23:20 (KST) |
| 대상 | `dist\oracle-tuner-1.0.0-beta.6-portable-win-x64-no-jre.zip` (43.8MB, 441 entries)<br>`dist\oracle-tuner-1.0.0-beta.6-portable-win-x64-with-jre.zip` (65.4MB) |
| 시험 위치 | `dist\_qa-portable\` (no-jre) / `dist\포터블 시험\Oracle Tuner 1.0\` (with-jre, 한글+공백 경로) |
| 시험 포트 | 7071 / 7072 (설치판 7070 은 건드리지 않음) |
| DB | docker `oracle-free` — `orahelper@localhost:1521/FREEPDB1` |
| 방법 | 브라우저(Playwright Chromium, **headed**) 육안 + 스크린샷 38장, 콘솔·네트워크 전량 수집 |
| 스크린샷 | `docs\panel\qa-portable-shots\` |
| 로그 | `logs\QA-portable.log` |

---

## 발견 오류 **10건** (치명 2 · 높음 2 · 보통 3 · 낮음 3)

### 최악 3개

| # | 심각도 | 한 줄 요약 |
|---|---|---|
| **D-01** | **치명(Blocker)** | **포터블 `OracleTuner.exe` 를 더블클릭해도 아무 일도 일어나지 않는다.** 설치판 트레이가 잡고 있는 뮤텍스 때문에 "중복 실행"으로 판정되어 즉시 종료되고, 대신 **설치판(7070)** 브라우저가 열린다. 포터블 서버는 뜨지 않고 트레이 아이콘도 없다. → 사용자는 포터블을 쓰고 있다고 믿지만 실제로는 설치판을 만지고 있다. **README 가 "권장"하는 실행 방법이 통째로 불능.** |
| **D-02** | **치명(Blocker)** | **"JRE 포함판"의 내장 JRE(`runtime\jre`)를 앱이 전혀 인식하지 못한다.** `server/config.js resolveJava()` 는 설정값 → `JAVA_HOME` → `PATH` 만 본다. `JAVA_HOME` 을 넣어주는 것은 `OracleTuner.bat` 뿐이고, 권장 런처인 `OracleTuner.exe` 는 넣지 않는다. Java 없는 PC(=이 판을 받는 바로 그 사람)에서 트레이로 띄우면 `환경 진단 ✕ Java 런타임 — 찾지 못했습니다`. README 의 "Java: 포함되어 있습니다. 따로 설치할 필요 없습니다" 는 **거짓**. |
| **D-03** | 높음 | **포터블 기본 포트가 설치판과 같은 7070.** 설치판이 떠 있으면 포터블은 `EADDRINUSE` 로 즉시 종료. 안내 문구는 `config\settings.json` 을 고치라고 하는데 **그 파일은 존재하지 않는다**(앱이 만들지 않음). 포맷 안내도 없음. |

---

## 항목별 표

| # | 무엇을 했나 | 무엇이 보였나 | 스크린샷 | 판정 |
|---|---|---|---|---|
| 1 | zip 내용 확인 (no-jre) | `OracleTuner.exe`(43KB, .NET PE32) · `OracleTuner.bat` · `OracleTuner.ico` · `portable.marker`(0B) · `runtime\node.exe` 모두 포함. 트레이 런처는 **패키징돼 있다** | — | **OK** |
| 2 | 압축 해제 후 `OracleTuner.bat` 실행(무설정) | 콘솔에 배너 출력 후 `ERROR 포트 7070 가 이미 사용 중입니다 … config\settings.json 파일의 server.port 를 바꾼 뒤` → 종료. 그런데 그 경로에 파일이 없음 | — | **오류 D-03** |
| 3 | 데이터 저장 위치 | `_qa-portable\config\secret.key`, `_qa-portable\config\settings.json`, `_qa-portable\data\oracletuner.db`, `_qa-portable\logs\*.log` 로 **앱 폴더 상대경로에 생성됨.** `%LOCALAPPDATA%\OracleTuner` 의 config/logs 에 `QA Portable`·`_qa-portable` 문자열 **흔적 없음** | `07-tab-settings.png` (경로 표시) | **OK — 설치판과 데이터 섞이지 않음** |
| 4 | `config\settings.json` 에 `{"server":{"port":7071}}` 만 적고 재기동 | 정상 기동, `듣는 중: http://127.0.0.1:7071/`, 브라우저 자동 열림(explorer.exe 경유) | — | **OK** |
| 5 | 브라우저 첫 화면 | DB 접속 모달 자동 표시 + 토스트 "먼저 DB 접속 정보를 등록하세요." | `01-initial.png` | **OK** |
| 6 | 접속 시험 / 접속 | `접속 성공 / Oracle AI Database 26ai Free … 스키마: ORAHELPER` → 접속 확립, 헤더에 `QA Portable (ORAHELPER)` | `03·04·05·30-connected.png` | **OK** |
| 7 | 탭 5개 전환 (SQL 목록·워크벤치·스키마·튜닝 이력·설정) | 전부 렌더링. 콘솔 오류 0, 4xx/5xx 0 | `07-tab-*.png` | **OK** |
| 8 | **[샘플 예제]** | confirm → 10건 설치, 토스트 "샘플 예제 10건을 넣었습니다", 좌측 "데모" 폴더에 10건 | `11-sample-clicked.png` | **OK** |
| 9 | **[데모 데이터 생성]** | confirm → 진행 토스트 → `api.log: 데모 데이터 생성 완료: 300000 건` (3.4초) | `12-demo-start.png` | **OK** |
| 10 | 워크벤치 — 예제 ① 열고 실행 / 실행계획 / 진단 | SQL 로드·실행·`DBMS_XPLAN` 계획(총 비용 3,804 · INDEX FULL SCAN) 정상 표시 | `32·33-wb-*.png` | **OK** |
| 11 | 튜닝 후보 → **[후보 생성]** | 후보 9개 생성, 위험도/유형/무엇이 바뀌나 표 정상 | `35-candidates-generated.png` | **OK** |
| 12 | 스키마 → [조회] | 좌측 12개 객체(OT_ORDERS·OT_BAD_CUST 포함) 정상. **우측 컬럼/인덱스/제약/통계 영역은 완전 백지 — 안내 문구도 없음** | `36-schema.png` | **오류 D-08** |
| 13 | 튜닝 이력 → [새로고침] | 0건 + 빈 상태 안내(첫 기록 만드는 법) 정상 | `37-history.png` | **OK** |
| 14 | 설정 → 재탐색/재기동/설정 저장 | 모두 반응. 저장 후 `settings.json` 이 전체 스키마로 재작성되고 **port 7071 보존됨** | `38·39·40-set-*.png` | **OK** |
| 15 | 도움말(F1) | 모달 정상, 링크·QR 이미지 정상 | `41-help.png` | **OK** |
| 16 | 언어 4종 전환 | ko/en 정상. **ja/zh 에서 [설정] 탭 '환경 진단' 카드 전체가 한국어 그대로** (Java 런타임 / Java 컴파일러(javac) / Oracle JDBC 드라이버 / JDBC 브리지 빌드 / 실행 환경 / 설정 파일 / [사용] 버튼) | `42-lang-ja.png`, `42-lang-zh.png` | **오류 D-04** |
| 17 | 콘솔 수집 | `[LocaleRegistry] 미등록 로케일 "ja"/"zh" — 무시하고 현재 로케일 유지` **12회** / `[OpenGrid] masterDetail.heightMode:'auto' 는 … 미공개 기능입니다` | `qa-portable-console-7.txt` | **오류 D-05, D-09** |
| 18 | **트레이 런처 `OracleTuner.exe` 더블클릭** | **즉시 종료(HasExited=True).** 트레이 아이콘 없음, 7071 LISTEN 없음. `logs\tray.log` 에 `중복 실행 감지 — 기존 인스턴스에 '열기'를 요청하고 종료합니다.` 한 줄만. 설치판 브라우저가 열림 | — | **오류 D-01 (치명)** |
| 19 | **한글+공백 경로** `dist\포터블 시험\Oracle Tuner 1.0\` 에 with-jre 판 해제 후 기동 | 정상 기동·정적파일·API 모두 OK. 경로도 화면에 온전히 표시 | `50·52-withjre-*.png` | **OK** |
| 20 | with-jre 판을 **Java 없는 환경**으로 기동 | `환경 진단 ✕ Java 런타임 — java 실행 파일을 찾지 못했습니다` + 토스트 "설정 확인이 필요합니다: Java 런타임". **패키지 안 `runtime\jre\bin\java.exe` 가 버젓이 있는데도** 자동탐색 후보에도 안 올라오고, 대신 시스템 JDK 를 제안 | `50·52-withjre-nojava-*.png` | **오류 D-02 (치명)** |
| 21 | 종료 — 콘솔 창 닫기(.bat) | cmd → node → java 트리가 **전부 정리됨**. 7071 LISTEN 사라짐, 고아 java 없음 | — | **OK** |
| 22 | 실행 중 폴더 삭제 시도 | `oracletuner.db … used by another process` 로 실패하되 **582개 파일이 이미 지워진 반쯤 부서진 상태로 남음** | — | **오류 D-06** |
| 23 | 종료 후 폴더 삭제 | 두 시험 폴더 모두 **완전 삭제 성공**. 잠긴 파일 없음 | — | **OK** |
| 24 | stdout 파이프 단절 상태 | `logger.js` EPIPE → `uncaughtException` 무한 반복. 포트는 LISTEN 인데 **모든 `/api/*` 가 25초 타임아웃까지 무응답**(좀비). 화면은 껍데기만 뜨고 목록·설정이 백지 | — | **오류 D-07** |

---

## 결함 목록 (재현 절차 포함, 심각도 순)

### D-01 [치명] 포터블 트레이 런처가 설치판과 뮤텍스를 공유해 아무 일도 하지 않는다

* **재현**
  1. 설치판(`C:\APPS\Oracle Tuner`)을 정상 실행해 트레이에 띄워 둔다.
  2. 포터블 zip 을 다른 폴더에 풀고 `OracleTuner.exe` 를 더블클릭한다.
* **결과** 프로세스가 즉시 사라진다. 트레이 아이콘 안 생김. 포터블 서버 미기동(포터블 포트 LISTEN 없음). 대신 **설치판** 화면이 브라우저에 열린다. 유일한 흔적은 포터블 `logs\tray.log` 한 줄:
  `[2026-07-31 23:05:05] INFO TRAY 중복 실행 감지 — 기존 인스턴스에 '열기'를 요청하고 종료합니다.`
* **원인** `installer/tray/OracleTunerTray.cs:953`
  `private const string MutexName = "Local\\OracleTunerTray.Instance";`
  이름이 설치 경로·포트와 무관한 고정값이라, 서로 다른 설치본(설치판 vs 포터블, 포터블 A vs 포터블 B)끼리도 같은 인스턴스로 취급된다. `EvtOpen/Quit/Start/Stop` 이벤트 이름(954~958행)도 동일 문제.
* **영향** 홍보글이 설치판·포터블을 함께 링크하므로 **둘 다 받은 사용자는 반드시 겪는다.** 게다가 포터블을 켰다고 믿은 채 설치판 데이터를 편집하게 되므로 "데이터가 섞이는" 사고로 이어진다(경로 분리는 정상인데 런처 때문에 무력화됨).
* **참고** 이 결함 때문에 **포터블 트레이의 정상 동작(아이콘 표시·열기/시작/정지/종료·Job Object 정리)은 이 PC 에서 검증 자체가 불가능**했다. 설치판 QA 가 진행 중이라 설치판 트레이를 내릴 수 없었다.

### D-02 [치명] with-jre 판의 내장 JRE 를 앱이 못 찾는다 (README 와 불일치)

* **재현**
  1. `...with-jre.zip` 을 푼다 → `runtime\jre\bin\java.exe` 존재 확인.
  2. Java 가 설치돼 있지 않은 PC(또는 `JAVA_HOME` 없음 + `PATH` 에 java 없음)에서 `OracleTuner.exe` 로 띄운다.
* **결과** `[설정]` → `환경 진단` 에 `✕ Java 런타임 — java 실행 파일을 찾지 못했습니다. 설정에서 JDK/JRE 홈 경로를 지정하세요.` 토스트 `설정 확인이 필요합니다: Java 런타임`. DB 접속 불가(브리지 기동 실패).
* **원인**
  * `server/config.js` `resolveJava()` 후보 = `settings.java.home` → `JAVA_HOME` → `PATH`. **`<앱루트>\runtime\jre` 를 보지 않는다.**
  * `discoverJavaHomes()` 도 `JAVA_HOME`/`PATH`/`C:\Program Files\...` 만 훑고 앱 폴더는 훑지 않는다 → 설정 화면의 "발견된 JDK/JRE" 후보에도 안 뜬다.
  * `JAVA_HOME` 을 넣어주는 곳은 `OracleTuner.bat` 한 곳뿐(`set "JAVA_HOME=%~dp0runtime\jre"`). 트레이는 `ProcessStartInfo` 에 환경변수를 전혀 손대지 않는다(`OracleTunerTray.cs:560~568`).
* **영향** "JRE 포함판"의 존재 이유가 사라진다. README 의 `Java: 포함되어 있습니다 (runtime/jre). 따로 설치할 필요 없습니다.` 가 권장 실행 경로에서는 사실이 아니다.
* **회피책(사용자)** `OracleTuner.bat` 으로 실행하거나, `[설정] → Java 홈 경로` 에 `<앱폴더>\runtime\jre` 를 직접 입력.

### D-03 [높음] 기본 포트가 설치판과 동일(7070) + 안내가 없는 파일을 가리킨다

* **재현** 설치판이 7070 에서 돌고 있는 상태에서 포터블을 그대로 실행.
* **결과** `ERROR server 포트 7070 가 이미 사용 중입니다. … <앱폴더>\config\settings.json 파일의 server.port 값을 사용 가능한 포트로 바꾼 뒤 다시 실행하세요.` 후 `process.exit(1)`, `pause`.
  그런데 해제 직후 `config\` 에는 `.gitkeep` 밖에 없고 앱도 `settings.json` 을 만들지 않는다. 사용자는 **없는 파일을 고치라는 안내**를 받고, JSON 형식 예시도 없다.
* **영향** 설치판+포터블 동시 보유가 정상 시나리오인데(홍보글이 둘 다 링크) 포터블이 바로 죽는다. `server/port-utils.js` 에 후보 포트 탐색 로직(`findAvailablePort`)이 이미 있는데도 포터블 기동 경로에서는 쓰지 않는다.
* **제안** 최소한 (a) 첫 실행 시 기본 `settings.json` 을 생성하거나, (b) 오류 메시지에 붙여넣을 JSON 예시를 넣거나, (c) 포터블에 한해 `findAvailablePort` 폴백.

### D-04 [높음] ja/zh 전환 시 [설정]탭 '환경 진단' 카드 전체가 한국어

* **재현** 접속 후 우측 상단 언어를 `日本語` 또는 `中文` 으로 바꾸고 `[설정]` 탭.
* **결과** 카드 제목·설명은 번역되는데 **항목 본문은 한국어 그대로**: `Java 런타임`, `Java 컴파일러(javac)`, `Oracle JDBC 드라이버`, `JDBC 브리지 빌드`, `실행 환경`, `설정 파일:`, 그리고 발견된 JDK 옆의 `[사용]` 버튼.
* **스크린샷** `42-lang-ja.png`, `42-lang-zh.png`
* **원인 추정** 진단 항목의 `label` 이 서버(`server/config.js diagnose()`)에서 한국어 문자열로 내려오고 프런트가 그대로 출력.

### D-05 [보통] OpenGrid 가 ja/zh 로케일을 모른다 — 콘솔 경고 반복

* **재현** 언어를 `日本語`/`中文` 으로 전환.
* **결과** 콘솔에 `[LocaleRegistry] 미등록 로케일 "ja" — 무시하고 현재 로케일 유지. / unknown locale, keeping current.` 가 전환 때마다 6회씩(총 12회) 출력. 그리드 헤더 메뉴·필터 UI 는 이전 로케일에 머문다.
* **영향** 일본어·중국어 사용자에게 그리드만 다른 언어로 남는다.

### D-06 [보통] 실행 중 폴더를 지우면 반쯤 부서진 채로 남는다

* **재현** 포터블이 실행 중인 상태에서 폴더 삭제(탐색기 Shift+Del 또는 `Remove-Item -Recurse -Force`).
* **결과** `The process cannot access the file 'oracletuner.db' because it is being used by another process.` 로 실패하지만 그 시점까지 **582개 파일이 이미 삭제**되어 되돌릴 수 없는 반파 상태가 된다.
* **연쇄** D-01 때문에 트레이 아이콘이 없으므로 사용자는 **실행 중인지 알 방법이 없다.** README 는 "반드시 [종료] 로 끄세요" 라고 하는데 그 [종료] 메뉴에 도달할 수단이 없다.
* **정상 경로 확인** 서버를 먼저 내리면 두 시험 폴더 모두 **완전 삭제 성공**(잠긴 파일 없음). `.bat` 콘솔 창을 닫으면 node·java 손자까지 전부 정리되는 것도 확인.

### D-07 [보통] stdout 파이프가 끊기면 서버가 좀비가 된다

* **재현** `node server\index.js` 의 표준출력을 파이프로 받다가 리더를 종료(콘솔 호스트가 사라지는 경우 등).
* **결과** `logs\server.log` 에 `ERROR server uncaughtException: Error: EPIPE: broken pipe, write … at logger.js:45 … at index.js:264` 가 무한 반복. 포트는 계속 LISTEN 이라 **화면(정적 파일)은 200 으로 뜨는데 `/api/*` 는 전부 무응답** → SQL 목록·설정이 전부 백지. 사용자에겐 "빈 화면"만 보인다.
* **원인** `index.js:264` 의 `uncaughtException` 핸들러가 로거로 쓰는데, 그 로거가 다시 stdout 에 써서 같은 예외를 재발생시킨다.
* **주의** 이번 점검 중 처음 이 상태를 만나 "모든 API 무응답"으로 기록했다가, 파일 리다이렉트로 재기동해 **API 100ms 정상 응답**을 확인하고 원인을 특정했다. 일반 실행 경로에서는 재현되지 않는다.

### D-08 [낮음] 스키마 탭 우측 상세 영역이 백지 (안내 문구 없음)

* **재현** `[스키마]` → `[조회]`.
* **결과** 좌측에 객체 12개가 나오지만 우측 `컬럼/인덱스/제약/통계` 탭 아래는 화면 전체가 흰 여백. "표를 선택하세요" 같은 빈 상태 안내가 없다. 다른 탭(SQL 목록·튜닝 이력)은 빈 상태 안내가 잘 되어 있어 더 눈에 띈다.
* **스크린샷** `36-schema.png`

### D-09 [낮음] 배포판에 개발용 콘솔 경고가 그대로 출력

* **내용** `[OpenGrid] masterDetail.heightMode:'auto' 는 Spike-B(가변높이 VirtualScroll) 통과 전까지 미공개 기능입니다. 'fixed' 로 동작합니다(11_design_F2_v2.md §2.2/C12.2).`
* **영향** 사용자가 F12 를 열면 내부 설계문서 파일명이 노출된다.

### D-10 [낮음] 문서·UI 사소한 어긋남

* README 는 `브라우저가 자동으로 http://127.0.0.1:7070 을 엽니다` 로 포트를 고정 안내 — D-03 회피로 포트를 바꾸면 즉시 불일치.
* DB 접속 모달의 `[삭제]` 버튼이 **저장된 접속이 하나도 없는 첫 실행에서도 활성**(`01-initial.png`).
* 저장한 접속 프로필을 다시 선택해도 비밀번호 칸이 비어 있다("비밀번호 저장(로컬 암호화)" 체크 상태로 저장했는데도 화면 복원은 안 됨). 접속 자체는 되지만 사용자는 매번 다시 입력해야 하는 것으로 오해할 수 있다.

---

## 정상 확인된 것 (증거 있음)

* 포터블 패키징에 트레이 런처 `OracleTuner.exe`·`OracleTuner.ico`·`portable.marker` 가 **정상 포함**되어 있다.
* **데이터 격리 정상** — `portable.marker` 판정이 동작해 config/data/logs/DB 가 전부 앱 폴더 아래에 생성되고, `%LOCALAPPDATA%\OracleTuner` 로 새지 않았다(설치판 config/log 에 포터블 흔적 0건).
* **한글+공백 경로 정상** — `dist\포터블 시험\Oracle Tuner 1.0\` 에서 기동·경로표시·정적파일·API 모두 문제 없음.
* 샘플 예제 10건 설치 / 데모 데이터 30만 건 생성(3.4초) / 실행 / 실행계획 / 진단 / 튜닝 후보 9개 생성 모두 정상.
* `.bat` 콘솔 창을 닫으면 node·java(손자)까지 **전부 정리**되고, 종료 후 폴더는 **잠긴 파일 없이 완전 삭제**된다.
* 정상 기동 시 브라우저 콘솔 오류 0건, 4xx/5xx 네트워크 실패 0건(경고는 D-05·D-09 뿐).

---

## 뒷정리

* 시험 폴더 **삭제 완료**: `dist\_qa-portable\`, `dist\포터블 시험\` — 둘 다 `Test-Path` = false 로 확인. 잠긴 파일 없었음.
* 설치판(`C:\APPS\Oracle Tuner`, node PID 18584 / tray 21008 / java 45592, 포트 7070 LISTENING)은 **시작·종료·재설치 어느 것도 하지 않았고 점검 종료 시점에도 그대로 살아 있음**을 확인.
* 리포 소스는 **읽기만** 했고 수정하지 않았다.
* ⚠ 남긴 것 하나 — Oracle `orahelper` 스키마에 데모 표 `OT_ORDERS`(30만 건)·`OT_BAD_CUST` 가 생성돼 있다. 다른 에이전트가 같은 스키마로 QA 중일 수 있어 임의로 DROP 하지 않았다. 정리하려면 앱의 `데모 9) 정리 (DROP)` 예제를 실행하면 된다.
