# FIX SPEC · Slice H — 항목 #6 (설치판: 윈도우 인스톨러 + 포터블)

총괄 작성 · 2026-07-30 21:2x. 결정 근거: `DECISIONS.md` 의 **D-002** 및 **D-002-a**.

---

## 발주자 요구 (원문)
> 설치판 필요 (윈도우, 포터블 형태) / 설치시 jdk 지정 또는 내장 jre 선택 가능 /
> 윈도우용의 경우 program files 설치시 접속 정보 저장 시 쓰기 권한등의 문제가 발생할 수 있음 /
> 설치위저드에서 포트지정 필요(가용포트는 병렬로 찾아도 되고, 직접 입력 및 테스트 기능 필요)

추가 (2026-07-30): "1.0 버전이 맞으면 그다음 업그레이드는 패치용 설치파일 만들어서 패치시킬까 해."

## 확정된 기술 선택 (실측 근거 있음 — 재검토 금지)
`Get-Command` 실측: **`iexpress.exe` 있음**(윈도우 내장), **`tar.exe` 있음**, `Add-Type System.Windows.Forms` **로드 성공**,
**NSIS(`makensis`) 없음**, **Inno Setup(`iscc`) 없음**.
⇒ **PowerShell + WinForms 위저드**, 배포는 **IExpress 자가압축 EXE** + **포터블 zip**.
폐쇄망이라 서드파티 설치 도구를 받아올 수 없다. 없는 도구를 전제한 설계는 실행 불가능하다.

---

## Phase 1 — 데이터 경로 분리 (`server/paths.js`) ★ 먼저, 단독 커밋

이게 발주자가 지적한 "Program Files 쓰기 권한" 문제의 본체이고, 패치 배포의 전제다.

**모드 2개를 구분한다:**
| 모드 | 판정 | config·data·logs·DB 위치 |
|---|---|---|
| 포터블 | 앱 루트에 마커 파일 `portable.marker` 존재 | 앱 루트 상대경로 (현행 유지, USB 이동성) |
| 설치 | 마커 없음 | **`%LOCALAPPDATA%\OracleTuner\`** |

- 판정 우선순위: 환경변수 `ORACLE_TUNER_DATA_DIR` 이 있으면 그것이 최우선(진단·테스트용) →
  `portable.marker` → 없으면 설치 모드.
- **기존 동작이 깨지지 않게 하라**: 개발 환경(리포에서 `npm start`)은 지금처럼 리포 안의
  `data/`·`config/` 를 써야 한다. 개발 중엔 마커가 있는 것으로 취급하거나(`package.json` 존재로 판정 등)
  안전한 규칙을 골라라. **판정 규칙과 그 이유를 주석으로 남겨라.**
- G 슬라이스가 추가한 **DB 경로 반환 함수 한 곳**만 고치면 SQLite 도 함께 따라가야 한다. 확인하라.
- 설치 모드에서 데이터 디렉터리가 없으면 **처음 실행 시 생성**하라.
- 마이그레이션: 설치 모드인데 앱 루트에 기존 `config/connections.json` 이 있으면
  `%LOCALAPPDATA%` 로 **복사**(이동 아님)하고 로그를 남겨라. 원본은 지우지 마라.

## Phase 2 — 포트 선택 유틸 (`tools/` 또는 `server/`) ★ 단독 커밋
- 가용 포트 탐색: 후보 목록(7070, 7071, 7080, 8070, 8080, 9070 …)을 **병렬로** `net.createServer().listen()
  시도 → 즉시 close** 방식으로 검사한다. `127.0.0.1` 에 바인딩해서 검사하라(0.0.0.0 은 방화벽 팝업 유발).
- 위저드와 서버가 **같은 함수**를 쓰게 하라. 로직을 두 번 쓰지 마라.
- 서버 기동 시 지정 포트가 사용 중이면 지금은 그냥 죽는다(정찰 R1 확인).
  **사용 중일 때 명확한 안내 메시지**를 내라(어떤 포트가 점유됐고 어떻게 바꾸는지).
  자동으로 다른 포트로 옮기지는 마라 — 사용자가 북마크한 주소가 바뀌면 더 혼란스럽다.

## Phase 3 — 설치 위저드 (`installer/wizard.ps1`) ★ 단독 커밋

WinForms 5단계. **한국어 UI**(기존 도구가 한국어다).
1. 환영 + 라이선스(MIT) 표시
2. **설치 경로** — 기본 `%LOCALAPPDATA%\Programs\OracleTuner`.
   `Program Files` 를 고르면 "관리자 권한 필요 + 데이터는 %LOCALAPPDATA% 에 저장됩니다" 를 안내하라.
3. **Java 선택** — 라디오 2개:
   - `시스템 JDK/JRE 사용` + [탐색] 버튼. 탐색 로직은 **`server/config.js:186-196` 의 기존 JDK 탐색을 재사용**하라
     (새로 구현하지 마라). 선택한 경로로 `java -version` 을 실제 실행해 검증하고 결과를 보여준다.
   - `내장 JRE 사용` — 배포판에 JRE 가 포함된 경우에만 활성화
4. **포트 지정** — 입력창 + [가용 포트 찾기] + [테스트] 버튼. Phase 2 유틸 사용.
   테스트 결과를 초록/빨강으로 즉시 보여준다.
5. 요약 확인 → 복사 → 바로가기 생성(시작 메뉴·바탕화면 선택) → 완료

**설치 레이아웃 (D-002-a — 패치 가능성의 전제, 반드시 이대로)**
```
<설치폴더>\app\        server, web, shared, java\out (또는 jar), package.json  ← 패치가 교체
<설치폴더>\runtime\    내장 JRE (있을 때)                                      ← 거의 불변
<설치폴더>\version.json  { version, installedAt, port, javaMode, javaHome }
%LOCALAPPDATA%\OracleTuner\  config, data, logs, oracletuner.db               ← 패치 불가침
```
- 위저드가 고른 포트·Java 설정은 **`%LOCALAPPDATA%` 쪽 설정 파일**에 쓰라(설치 폴더가 아니라).
  설치 폴더에 쓰면 Program Files 에서 권한 오류가 난다 — 이 항목이 발주자 지적의 핵심이다.
- 제거 스크립트(`uninstall.ps1`)도 만들되 **사용자 데이터는 지우지 말고** 물어보라.

## Phase 4 — 빌드 스크립트 (`tools/build-installer.js`) ★ 단독 커밋
- `installer/` 산출물 + `app/` + (선택)`runtime/` 를 모아 **IExpress SED 파일을 생성**하고
  `iexpress.exe /N /Q <sed>` 로 단일 `.exe` 를 만든다.
- 동시에 **`manifest.json`** 을 생성한다: `{ version, files: [{ path, sha256, size }] }`.
  이게 있어야 다음 버전에서 **패치 설치파일**을 만들 수 있다(D-002-a).
- 기존 `tools/build-portable.js` 는 **유지·보강**한다: 포터블 zip 루트에 `portable.marker` 를 넣어라
  (Phase 1 의 판정 근거). 포터블은 데이터를 앱 폴더에 두어 USB 이동성을 지킨다.
- ⚠ **번들 node 버전 확인 필수**: `node:sqlite` 는 Node 22+ 에만 있다.
  포터블/설치판이 번들하는 node 가 22 미만이면 SQLite 저장소가 파일 모드로 폴백한다(죽지는 않는다).
  **번들 node 의 실제 버전을 확인해 보고서에 적어라.** 22 미만이면 그 사실을 명시하고 상향을 권고하라.

---

## 검증 (필수)
1. `npm test` — 기존 건수 유지. `test/run-tests.js` 는 **다른 에이전트(F)가 쓰는 중일 수 있다**:
   `git status` 로 깨끗하면 테스트를 추가하고, 수정 중이면 `docs/panel/tests-needed-from-H.md` 에 케이스만 적어라.
   추가할 테스트: 경로 판정(포터블/설치/환경변수 3분기), 포트 탐색이 사용 중 포트를 제외하는지, manifest 해시 재현성.
2. **`npm start` 로 개발 환경이 여전히 정상 동작해야 한다.** Phase 1 이 개발 경로를 깨면 안 된다.
   기동 후 `/api/snippets` 가 10건을 반환하는지 확인하라(현재 실제 데이터 건수).
3. **위저드를 실제로 띄워보라**: `powershell -File installer\wizard.ps1` — 단 이 세션은 비대화형이라
   창을 띄우면 멈춘다. 그래서 **`-WhatIf` 류의 자체 점검 모드**(`-SelfTest`)를 위저드에 넣어
   폼 생성·컨트롤 배치·포트 검사 로직이 예외 없이 통과하는지 **콘솔에서** 검증하라.
   GUI 실제 조작은 발주자가 할 몫이므로 **"GUI 수동 조작 미검증"을 정직하게 명시**하라.
4. `iexpress` 로 실제 exe 를 만들어봤는지 여부를 보고서에 정직하게 쓰라. 만들었으면 산출물 크기를 적어라.

## 파일 소유권 (배타)
`server/paths.js` · `server/config.js` · `installer/**` · `tools/**`

**만지지 말 것**: `java/**`(특히 `java/build.js` — jar 전환은 이번 라운드에서 하지 않는다) ·
`server/api.js` · `server/bridge.js` · `server/repo/**` · `server/tuning-store.js` ·
`server/snippet-store.js` · `server/connections.js` · `web/**`
