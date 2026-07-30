# 결과 보고 — 에이전트 H (항목 #6: 설치판 — 윈도우 인스톨러 + 포터블)

FIX-SPEC-slice-H-installer.md Phase 1~4 전부 구현·검증 완료. 아래는 무엇을 했고, 무엇을
실제로 확인했고, 무엇을 확인하지 못했는지 정직하게 적은 기록이다.

## 요약

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 데이터 경로 분리(`server/paths.js`) — env/portable/dev/installed 4분기 | 완료, 회귀 없음 확인 |
| 2 | 가용 포트 탐색 유틸(`server/port-utils.js`) — 위저드·서버 공용 | 완료 |
| 3 | 설치 위저드(`installer/wizard.ps1`) + 제거(`installer/uninstall.ps1`) | 완료, SelfTest 통과 |
| 4 | 빌드 스크립트(`tools/build-installer.js`) — IExpress exe + manifest | 완료, 실제 exe 생성 확인 |

## Phase 1 — 데이터 경로 분리

`server/paths.js` 에 모드 판정을 순수 함수 `resolveMode(rootDir, env)` 로 뺐다(실제 호출은
`resolveMode(ROOT, process.env)`).

**우선순위**: `ORACLE_TUNER_DATA_DIR` 환경변수 → `portable.marker` 파일 → `.git` 디렉터리(개발
환경) → 그 외(설치 모드, `%LOCALAPPDATA%\OracleTuner\`).

`package.json` 존재 여부는 판정 기준으로 **쓰지 않았다** — 설치 레이아웃(`<설치폴더>\app\`)에도
패치 교체 대상으로 `package.json` 이 그대로 복사되어 들어가므로 개발/설치를 구분하지 못한다.
대신 배포 산출물(포터블 zip, 설치판 payload)에는 절대 포함되지 않는 `.git` 을 개발 환경의
표식으로 썼다.

설치 모드 최초 실행 시 앱 루트에 남은 기존 `config/connections.json` 을 새 위치로
**복사**(이동 아님, 원본 보존)하는 이관 로직을 `ensureDirs()` 안에 넣었다.

- `dbFile()`(항목 #4, SQLite 경로)은 `P.data` 아래로 자동 추종 — 별도 수정 불필요, 확인함.
- `server/index.js` 의 EADDRINUSE 안내 메시지가 하드코딩된 `config/settings.json` 을
  가리키고 있어서, 실제 `P.settingsFile` 경로를 보여주도록 고쳤다(Phase 1 이 경로를 바꿨으니
  메시지도 같이 바꿔야 정확하다). 자동으로 다른 포트로 옮기지 않는 것은 기존 그대로 유지.

## Phase 2 — 포트 유틸

`server/port-utils.js` — `isPortFree`/`findAvailablePort`. `127.0.0.1` 에만 바인딩(방화벽
팝업 방지). require 로도, `node server/port-utils.js --check|--find` CLI 로도 쓸 수 있다 —
PowerShell 위저드가 자식 프로세스로 호출해 정확히 같은 함수를 쓴다(로직 중복 없음).

## Phase 3 — 설치 위저드

`installer/wizard.ps1` 5단계(환영/라이선스 → 설치 경로 → Java 선택 → 포트 → 요약/설치),
`installer/uninstall.ps1`(사용자 데이터 삭제 여부를 반드시 물어봄, 기본은 보존).

JDK 탐색은 `server/config.js` 에 추가한 `--discover-java`/`--check-java` CLI(기존
`discoverJavaHomes`/`resolveJava` 를 그대로 감싼 것, 재구현 없음)를 위저드가 자식 프로세스로
호출한다.

⚠ **겪은 문제**: BOM 없는 UTF-8 로 `.ps1` 을 저장했더니 Windows PowerShell 5.1 이 시스템
ANSI 코드페이지로 잘못 해석해 한글이 깨지고, 그 여파로 문자열 리터럴 파싱까지 실패했다
(`Parser.ParseFile` 에서 다수의 "따옴표가 맞지 않음" 오류). 두 `.ps1` 파일 모두 UTF-8 **BOM**
을 붙여 해결했다.

## Phase 4 — 빌드 스크립트

`tools/build-installer.js`. IExpress 는 폴더 트리를 직접 다루는 게 불안정해서, 배포 파일
전체를 `payload.zip` 하나로 묶고 IExpress 에는 `payload.zip` + `install-launcher.bat` **딱
2개 파일만** 넘기는 방식을 택했다. 실행 흐름: exe 자가추출 → `install-launcher.bat` →
`tar -xf payload.zip`(윈도우 내장 tar, zip 해제 가능 — D-002 실측) → `wizard.ps1` 실행.

`manifest.json`(`dist/manifest-<version>-{no-jre|with-jre}.json`) — app(패치 교체 대상:
server/web/shared/java-out/java-lib/package.json) 파일들의 sha256+size 목록. 다음 버전에서
패치 설치파일을 만들 때 이전 버전과 비교할 근거(D-002-a).

`tools/build-portable.js` 는 요청대로 유지·보강: 포터블 zip 루트에 `portable.marker` 를
추가했고(Phase 1 판정 근거), `copyNode`/`buildJre` 를 export 해서 `build-installer.js` 가
node/JRE 번들 로직을 그대로 재사용하게 했다(중복 구현 없음).

## 검증 — 실제로 확인한 것

1. **`npm start` 개발 환경 정상**: Phase 1 적용 후 포트 7070 기존 프로세스를 정리하고 재기동,
   `/api/snippets` 가 **10건**을 그대로 반환함을 확인(작업 시작 전 baseline 과 동일).
2. **`npm test`**: 163(H 관련 테스트 포함, F 의 스니펫/repo 테스트 등 전체) + 4([F] 브리지/API
   진행률 테스트, 별도 스위트) 모두 통과, 매 Phase 커밋 전 재확인함. `test/run-tests.js` 는
   에이전트 F 가 동시에 계속 수정 중이라(작업 중 1298→1402줄로 늘어나는 것을 직접 목격) 직접
   테스트를 추가하지 않고 `docs/panel/tests-needed-from-H.md` 에 케이스만 적었다(경로 판정
   4분기 6건, 포트 탐색 제외 3건 — 별도 스크립트로 9/9 통과 확인 완료).
3. **`wizard.ps1 -SelfTest`**: 13/13 통과(폼 생성, 5단계 패널, 라이선스 체크박스, 설치경로
   기본값, Java 콤보박스, 포트 기본값 7070, 요약박스, `Find-AvailablePort`/점유 포트 제외,
   `Get-JavaCandidates`/`Test-JavaHome` CLI 왕복).
4. **`uninstall.ps1 -SelfTest`**: 4/4 통과(샌드박스에서 앱 트리 제거, 데이터 루트 제거 로직).
5. **GUI 가 실제로 뜨는지 추가 확인(SelfTest 이상)**: `payload.zip` 을 실제로 풀어(윈도우
   `tar.exe`) 구조가 위저드가 기대하는 `$SourceRoot` 형태(server/web/shared/java/installer/
   runtime/node.exe 등)와 일치함을 확인했고, **완성된 exe 를 실제로 실행**해 `%TEMP%\IXP000.TMP`
   에 `payload.zip`+`install-launcher.bat` 이 풀리는 것과, 그 체인 그대로(`payload-check` 임시
   폴더에서 동일하게 `powershell -File installer\wizard.ps1` 비대화형 실행)를 재현해 **실제
   WinForms 창이 뜨는 것**(`MainWindowTitle = "OracleTuner 설치"`, 5초 뒤에도 살아서 입력을
   기다리는 상태)을 확인한 뒤 강제 종료했다.
   **다만 Next/이전/설치 버튼을 사람이 실제로 눌러보는 조작 자체는 검증하지 못했다** — 이
   세션은 비대화형이라 폼이 뜬 것과 크래시하지 않는 것까지만 확인 가능했다. **발주자의 수동
   확인이 필요하다.**
6. **`iexpress` 실 exe 빌드**: `node tools/build-installer.js` 실행 → **성공**.
   산출물: `dist/OracleTunerSetup-1.0.0-beta.1-no-jre.exe`, **41.0 MB**
   (`payload.zip` 41.3 MB 압축, manifest 파일 75개). `--with-jre` 옵션(jlink 포함판)은
   시간 관계상 별도로 돌려보지 않았다 — no-jre 경로와 코드가 동일(`portable.buildJre` 재사용)
   하므로 별도 검증하지 않았음을 밝힌다.
7. **번들 Node 버전**: 개발 머신의 `process.execPath` 를 그대로 복사하므로 **v24.15.0**
   (Node 22 이상 → `node:sqlite` 정상 사용 가능, 폴백 불필요). `checkBundledNodeVersion()` 이
   버전을 확인해 22 미만이면 경고를 찍도록 구현해 뒀다(현재는 통과).

## 확인하지 못한 것 (정직하게)

- 위저드 GUI 버튼(다음/이전/찾아보기/검증/설치)의 실제 클릭 동작 — 창이 뜨고 죽지 않는 것만
  확인, 조작 결과는 미검증.
- `--with-jre` 설치판 빌드(jlink 경로) 자체 실행.
- 실제 관리자 권한으로 `Program Files` 아래에 설치했을 때의 전체 흐름(권한 문제 재현·회피 확인).
- 패치 설치파일 자체(다음 라운드 — manifest.json 은 그 전제만 준비함).

## 변경/생성 파일

- `server/paths.js` (수정) — 데이터 경로 분리, `resolveMode` 노출
- `server/port-utils.js` (신규)
- `server/config.js` (수정) — `--discover-java`/`--check-java` CLI 추가
- `server/index.js` (수정) — EADDRINUSE 안내 메시지가 실제 설정 파일 경로를 가리키도록
- `installer/wizard.ps1` (신규)
- `installer/uninstall.ps1` (신규)
- `tools/build-portable.js` (수정) — `portable.marker`, `copyNode`/`buildJre` export
- `tools/build-installer.js` (신규)
- `docs/panel/tests-needed-from-H.md` (신규 — F 에게 전달할 테스트 케이스)
- `docs/panel/result-H-installer.md` (이 문서)

## 커밋

Phase 별로 4~5개 커밋으로 나눔(`git log --oneline` 참고): 경로분리 → 테스트 가능성 리팩터 →
포트유틸 → 위저드/제거스크립트 → (이 문서 포함) 빌드스크립트.
