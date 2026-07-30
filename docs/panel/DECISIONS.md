# 설계 결정 로그 (Decision Log)

## D-001 · 저장소 백엔드 = `node:sqlite` (내장 SQLite)  [항목 #4]

- **일시**: 2026-07-30 19:3x
- **결정**: 파일 기반 JSON 저장소를 SQLite 로 전환한다. 드라이버는 Node **내장 모듈 `node:sqlite`**.
- **실측 근거** (총괄이 직접 실행):
  ```
  node -v                          → v24.15.0
  require('node:sqlite') + CREATE/INSERT/SELECT  → OK
  ```
- **왜 이것인가** (발주자 제약 3개를 모두 만족하는 유일 후보):
  | 발주자 제약 | node:sqlite 판정 |
  |---|---|
  | "용량을 너무 차지하면 안 됨 (억세스DB처럼 작은 거)" | **추가 용량 0 B.** node.exe 바이너리에 이미 포함. npm 패키지·네이티브 빌드 불필요 |
  | "윈도우 전용이면 그냥 XML이 나음" | **크로스플랫폼.** Node 가 도는 모든 OS 에서 동일 동작 → XML 유지 조건 해당 없음 |
  | 오프라인 VDI (네트워크 설치 불가) | **네트워크 불필요.** `npm install` 도, 컴파일러도, VC++ 재배포도 필요 없음 |
- **탈락 후보와 이유**:
  - `better-sqlite3` — 네이티브 애드온. prebuilt 다운로드 필요 → 오프라인 VDI 위반. node-gyp 빌드 요구 위험.
  - MS Access(.mdb/.accdb) — 윈도우 전용 + ACE OLEDB 드라이버 별도 설치 필요. 발주자 기준상 XML보다 못함.
  - XML 유지 — 인덱스·정렬·부분갱신이 전량 재작성이라 튜닝 이력이 늘면 느려진다. 전환 이유 자체를 못 없앰.
- **⚠ 검증 필요 (P-QA 숙제)**: 포터블 배포판이 **어떤 node 버전을 번들하는지**.
  번들 node 가 22 미만이면 `node:sqlite` 가 없어 런타임에 죽는다.
  → 정찰 R5 결과 확인 후, 필요 시 번들 node 를 24.x 로 올리거나 `--experimental-sqlite` 플래그 검토.
- **롤백 안전선**: `Repository` 인터페이스를 먼저 도입하고 `JsonFileRepository`(현행) 를 그대로 남긴다.
  SQLite 초기화 실패 시 자동으로 파일 모드로 폴백. 기존 `data/tunings/*.json` 은 이관 전 무조건 백업.

---

## D-002 · 인스톨러 = **PowerShell/WinForms 위저드 + IExpress 자가압축 EXE**  [항목 #6]

- **일시**: 2026-07-30 20:03
- **실측 근거** (총괄이 직접 `Get-Command` 로 확인):
  ```
  iexpress   → C:\WINDOWS\system32\iexpress.exe      ✅ 윈도우 내장
  powershell → C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe  ✅
  tar        → C:\WINDOWS\system32\tar.exe            ✅ 윈도우 내장(zip 해제 가능)
  Add-Type -AssemblyName System.Windows.Forms         ✅ 로드 성공 → GUI 위저드 가능
  makensis (NSIS)   → 없음 ❌
  iscc (Inno Setup) → 없음 ❌
  ```
- **결정**: 설치 위저드는 **PowerShell + System.Windows.Forms** 로 만들고,
  배포 형태는 **IExpress 로 감싼 단일 `.exe`** + **포터블 zip** 두 가지로 낸다.
- **왜 이것인가**:
  - NSIS·Inno Setup 은 이 머신에 없다. 폐쇄망 VDI 라 **설치용 도구를 새로 받아올 수 없다.**
    빌드 머신에도 없는 도구를 전제한 설계는 실행 불가능하다.
  - IExpress 는 Windows 에 기본 포함된 자가압축 EXE 생성기다. **서드파티 0개**로
    진짜 `.exe` 인스톨러가 나온다.
  - WinForms 로 위저드 UI(설치 경로·JDK 선택·포트 지정·테스트 버튼)를 다 만들 수 있다.
    콘솔 bat 보다 발주자가 요구한 "설치 위저드" 에 부합한다.
- **발주자 요구사항 대응 설계**:
  | 요구 | 설계 |
  |---|---|
  | JDK 지정 **또는** 내장 JRE 선택 | 위저드 3단계에서 라디오 선택. "시스템 Java 탐색" 버튼은 `server/config.js:186-196` 의 기존 JDK 탐색 로직을 재사용 |
  | Program Files 설치 시 접속정보 쓰기 권한 문제 | **데이터 디렉터리를 설치 폴더에서 분리** → `%LOCALAPPDATA%\OracleTuner\` (config·data·logs). 설치 폴더는 읽기 전용으로 취급. 이것이 이 항목의 핵심 |
  | 포트 지정 (가용포트 탐색 + 직접입력 + 테스트) | 위저드 4단계. 가용포트 탐색은 후보 목록을 **병렬 TcpListener 바인드 시도**로 확인. "테스트" 버튼으로 즉시 검증 |
  | 포터블 형태 | 기존 `tools/build-portable.js` 를 유지·보강. 포터블은 데이터를 **설치 폴더 상대경로**에 둔다(USB 이동성) |
- **⚠ 선결 조건**: 데이터 경로 분리는 `server/paths.js` 를 고쳐야 한다.
  **항목 #4(SQLite 전환)와 같은 파일을 건드리므로 #4 를 먼저 끝내고 #6 을 착수한다.**
  순서를 뒤집으면 경로 로직을 두 번 고치게 된다.

---

## D-003 · 토너먼트 진행률 = **Java stdout 이벤트 + Node 캐시 + 클라이언트 폴링**  [항목 #10]

- **실측 근거** (정찰 R4b):
  - 프로토콜은 stdin/stdout 라인 JSON, 응답에 `@@OT@@` 표식, **요청 id 로 1:1 매칭**
  - **같은 id 로 응답이 여러 개 와도 첫 번째만 매칭되고 나머지는 로그로 흘러가 파서가 깨지지 않는다**
  - SSE·WebSocket 은 서버에 **없다** (정찰 R1)
  - Java 워커는 요청을 풀에서 처리하고 `cancel`/`shutdown` 만 즉시 처리 →
    토너먼트 진행 중 다른 명령을 보내면 **큐에서 대기**한다(진행률 질의를 Java 로 보낼 수 없다)
- **결정**: 아래 4단 구조. SSE 를 새로 만들지 않는다.
  1. Java 가 토너먼트 루프에서 `@@OT@@{"id":…,"event":"progress","done":n,"total":m,"label":…}` 를 흘린다
  2. `server/bridge.js` 파서가 `event` 필드가 있는 메시지는 **promise 를 resolve 하지 않고** 진행률 맵에 저장
  3. `server/api.js` 에 `GET /api/sql/tournament/progress?sessionId=` 를 추가해 그 맵을 읽어준다
  4. 클라이언트가 토너먼트 실행 중 ~500ms 간격으로 폴링해 프로그래스바를 갱신
- **왜 이것인가**: 기존 요청/응답 매칭을 **깨지 않고** 증분으로 얹을 수 있다.
  SSE 도입은 서버 구조 변경 + 프록시/방화벽 변수까지 끌고 오는데, 폐쇄망 도구에 그만한 값을 못 한다.
- **⚠ 선결 조건**: 토너먼트 루프는 `Exec.java:820` 부근에 있다. **항목 #1(Slice C)이 같은 파일을
  수정 중이므로 C 커밋 이후에 착수한다.**

## D-003 · (예약) 뷰 계층 OOP 리팩토링 범위  [OOP]
정찰 R3 의 "뷰 공통 규약" 결과 대기 중.
