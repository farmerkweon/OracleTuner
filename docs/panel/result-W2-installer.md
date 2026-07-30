# RESULT · W2 설치 위저드 v2 재작성

작성: W2 (executor 레인) · 2026-07-31
대상: `installer/wizard.ps1`(재작성) · `installer/uninstall.ps1`(재작성) · `installer/lang.ps1`(키 추가만)
기준 스펙: `docs/panel/SPEC-installer-v2.md`, `docs/panel/UI-SPEC-installer-i18n.md` §1·§3.6,
보안 반영: `docs/panel/SEC-REVIEW-installer.md` F1·F2·F6·F7

---

## 요약

| 항목 | 상태 |
|---|---|
| STEP0(언어 선택) 신설 + 4언어 라디오 | 완료 |
| 제목줄 언어 콤보와 STEP0 라디오 양방향 동기화 | 완료(로직 검증됨). **콤보 텍스트 표시가 이 개발환경(VDI/RDP)에서만 안 보이는 렌더링 문제 잔존 — 아래 "알려진 문제" 참조** |
| 라이선스 영문 원문 고정 표시 | 완료 |
| GetNewClosure() 전수 적용 + 이벤트 발화 SelfTest | 완료 (wizard.ps1 55/55, uninstall.ps1 19/19) |
| 컨트롤 폭 조치(langLabel 78px, btnFindPort 140px) | 완료 |
| SEC-REVIEW F1(삭제 가드)·F2(경로 검증)·F6(쓰기 시험)·F7(포트 검증) | 완료, SelfTest 로 검증 |
| `node tools/build-installer.js` | 성공 (41.4MB) |
| 실제 exe 캡처 | **exe 자체는 실패(아래 참조), 대신 exe 내부와 바이트 동일한 스테이징 wizard.ps1 로 캡처 성공, 4장 확보·육안 확인** |

---

## 1. 실제 있었던 함정과 조치 (재현 순서대로)

### 1.1 BOM 누락 → 파서가 한글을 깨진 토큰으로 읽음
`Write` 도구로 새로 만든 `wizard.ps1`/`uninstall.ps1`은 BOM 없는 UTF-8로 저장됐다. Windows
PowerShell 5.1은 BOM이 없으면 시스템 코드페이지(CP949)로 읽어, 다국어 문자열 속 멀티바이트
시퀀스가 `{`/`'` 같은 토큰과 충돌해 파서가 통째로 깨졌다. `lang.ps1`(기존, 정상 동작)의
바이트를 `xxd`로 실측 비교해 `EF BB BF`(UTF-8 BOM) 여부 차이를 확인하고, 두 파일을
`[System.Text.UTF8Encoding]::new($true)`로 다시 썼다.

### 1.2 `.GetNewClosure()`가 캡처하는 것은 "변수"뿐, "함수"와 "`$script:` 스코프 자체"는 아니다
SPEC이 경고한 함정 #1(핸들러 안에서 바깥 변수 접근 불가)은 알고 있었지만, 실제로 두 종류의
**새로운** 하위 함정을 이 라운드에서 직접 만났다(SPEC 문서에 명시되지 않았던 것):

1. **함수 조회 단절**: `GetNewClosure()`로 만든 스크립트블록 안에서 `Get-Str` 같은
   일반 함수를 부르면 `"Get-Str" 이(가) cmdlet... 이름으로 인식되지 않습니다`로 죽는다.
   dot-source 로 읽은 함수든, 이 파일에서 `function`으로 정의한 함수든 전부 해당한다.
   **조치**: 클로저가 직접 호출하는 함수를 전부 `Set-Item function:global:<name>` 으로
   Global 스코프에도 등록해 둔다(`wizard.ps1` 상단, `Build-Wizard` 정의 직전).
2. **`$script:` 조회 단절**: 클로저 안에서 `$script:LangCodes` 를 **읽기만** 해도 `$null`이
   된다(SPEC은 "대입"만 위험하다고 적었으나, 실측으로는 **조회도** 끊긴다 — 클로저가
   자기만의 격리된 `$script:` 스코프를 갖는 것으로 보인다). `$null[$idx]` → "null 배열에
   대한 인덱스를 만들 수 없습니다" 로 죽는다. **조치**: `Build-Wizard` 진입 직후
   `$langCodes = $script:LangCodes` 처럼 지역 변수로 복사해 두고, 클로저들은 전부 이
   지역 변수를 참조하게 했다.

이 두 가지를 각각 별도 SelfTest 실행 → 실패 로그 → 원인 규명 → 수정 → 재검증 사이클로
잡아냈다(로그: `logs/agent/W2-installer.log`).

### 1.3 SelfTest 안에서 `PerformClick()`이 아무 효과가 없었다
언어 콤보/라디오 이벤트는 다 통과했는데 `btnNext.PerformClick()` 이 `State.CurrentStep`을
전혀 바꾸지 않았다(예외도 없이 그냥 무효). 원인: `Button.PerformClick()`은 내부적으로
`CanSelect`(= 조상 체인 전체의 `Visible && Enabled`)를 확인하고 거짓이면 조용히 아무 일도
안 한다. `ShowDialog()`/`Show()`를 한 번도 안 부른 폼은 `Visible=false` 상태라 이 게이트에
걸린다. **조치**: SelfTest 안에서 `$built.Form.Show()`(비모달, `Application.Run()` 을 안 불러
메시지 펌프를 돌리지 않으므로 블로킹 없음)를 한 번 호출해 조상 체인을 "보이는" 상태로
만들었다. 이후 `PerformClick()` 이 정상적으로 실제 Click 이벤트를 발화했다.

---

## 2. STEP 구성 (확정)

```
STEP 0  언어 선택      ← 신설. 4개 언어 라디오(자국어 표기: 한국어/English/日本語/中文)
STEP 1  라이선스(영문 원문 고정) + 동의 체크
STEP 2  설치 경로 (F2/F6 검증 포함)
STEP 3  Java (시스템 JDK / 내장 JRE)
STEP 4  포트 (자동 탐색 + 직접 입력 + 테스트, F7 검증 포함)
STEP 5  요약 → 설치 → 완료
```

제목줄 옆 언어 콤보는 5단계 전체에서 항상 보이고, STEP0 라디오와 양방향 동기화된다(순환
호출 방지용 `$state.SyncingLang` 가드).

라이선스 본문은 `Build-LicenseDisplayText`(lang.ps1)가 리포 루트 `LICENSE`를 읽어 그대로
표시한다 — 번역·요약 없음, 항상 영문, Consolas 고정폭.

---

## 3. SEC-REVIEW-installer.md 반영 내역 (F1·F2·F6·F7)

| # | 조치 | 위치 |
|---|---|---|
| F1 | `Test-SafeToRemove` 가드 추가 — 드라이브 루트·시스템/사용자 최상위 폴더 거부, `version.json` 증거 요구. `Remove-InstallTree` 실행 **전에** 미리 계산해 둔다(실행 후엔 `version.json` 이 이미 지워져 자기모순에 빠지므로). `cmd.exe` 도 `%SystemRoot%\System32\cmd.exe` 절대경로로 고정 | `installer/uninstall.ps1` |
| F2 | `Resolve-InstallPath` 추가 — 절대경로만 허용, 드라이브 루트 거부, 비어있지 않은 폴더는 YesNo 확인 후에만 진행 | `installer/wizard.ps1` |
| F6 | `Test-CanWrite` 추가 — 실제로 파일을 만들어 쓰기 가능 여부 시험(승격 요청은 하지 않음 — "가장 안전한 답은 승격을 아예 안 하는 것" 이라는 검토 권고를 따름) | `installer/wizard.ps1` |
| F7 | `[다음]` 클릭 시 포트 범위(1~65535)를 검증하고 `$state.Port` 에 즉시 반영 — 이전에는 `[테스트]` 버튼을 눌러야만 커밋됐다 | `installer/wizard.ps1` |

F3(lang.ps1 을 JSON 데이터로)·F5(build-installer.js 절대경로)·F4(서명/체크섬)·F10(레지스트리
등록)은 소유 파일 밖(F5/F4 는 `tools/build-installer.js`, 총괄이 배포 시 처리)이거나 이번
라운드 대상이 아니라고 지시받아 손대지 않았다.

lang.ps1 에 4로케일 신규 키 5개 추가(`step2.pathNotAbsolute`, `step2.pathInvalidChars`,
`step2.pathDriveRoot`, `step2.pathNonEmptyConfirm`, `step2.writeCheckFailed`) — 기존 키는
건드리지 않았다.

---

## 4. SelfTest 결과 (이벤트 발화 포함)

```
installer/wizard.ps1 -SelfTest     → 통과 55 / 실패 0
installer/uninstall.ps1 -SelfTest  → 통과 19 / 실패 0
```

`PerformClick()`/`SelectedIndex =`/`.Checked =` 로 실제 이벤트를 발화시켜 검증한 항목(직접
함수 호출로 대신하지 않음):

- 언어 콤보 4개 인덱스 전환 × (State.Lang 갱신, 창 제목 갱신, STEP0 라디오 동기화)
- STEP0 라디오 4개 체크 × (State.Lang 갱신, 언어 콤보 동기화)
- `Next.PerformClick()` 으로 STEP0→1→2→3→4→5 전체 전이, `Back.PerformClick()` 으로 5→4
- 라이선스 미동의 시 다음 버튼 비활성 → 동의 체크 이벤트로 활성화
- F2: `Resolve-InstallPath` 빈 값/상대경로/드라이브 루트 거부(단위 테스트 — MessageBox 를
  띄우는 케이스라 비대화형 세션에서 무한 대기하므로 PerformClick 경로로는 발화시키지
  않았다), 유효 경로는 실제 `PerformClick()` 으로 STEP2→3 전이 확인
- F6: `Test-CanWrite` 가 TEMP 하위 샌드박스에 실제로 쓸 수 있는지 확인
- F7: `[테스트]` 버튼을 누르지 않고 포트 값(18080)만 입력한 뒤 `PerformClick()` →
  `State.Port` 에 그대로 반영됨을 확인(이전 버그의 정확한 반례)
- `Test-SafeToRemove`(uninstall.ps1): 정상 설치 폴더 허용 / `version.json` 없는 폴더·드라이브
  루트·`%TEMP%`·`%USERPROFILE%`·빈 값 전부 거부
- 4로케일 문자열 테이블 완전성(`Test-StringTableCompleteness`) — 누락 0

---

## 5. 빌드

```
node tools/build-installer.js
→ 생성됨: dist/OracleTunerSetup-1.0.0-beta.1-no-jre.exe (41.4 MB)
```
성공. (보안 수정 반영 후 2회, DPI/AutoScale 조치 후 2회 재빌드 — 총 4회 모두 성공)

---

## 6. 실제 exe 캡처 — 있었던 일 그대로

### 6.1 패키징된 exe(`OracleTunerSetup-*.exe`) 자체는 이 환경에서 못 띄웠다

`Start-Process` 로 두 차례(도합 4개 프로세스 인스턴스) 띄웠으나 전부 IExpress 자가압축
단계에서 2분 이상 멈췄다 — 창이 안 뜨고, `%TEMP%` 에 `IXP*.TMP` 임시폴더가 생기지 않고,
`cmd.exe`/`tar.exe` 자식 프로세스도 안 생겼다(즉 `AppLaunched` 커맨드라인까지 도달하지도
못했다). 이벤트로그 확인 결과 이 머신에 **AhnLab V3(AMSI 후킹) + AppLocker 정책**이 활성
상태였다 — 서명되지 않은 새 exe 를 보안 소프트웨어가 조용히 가로막는 것으로 강하게
의심되지만(정확한 차단 로그까지는 못 찾았다), **확진하지 못했다**. 멈춘 프로세스 2개는
정리했다.

**정직한 한계**: 패키징된 exe 자체를 실제로 띄워보는 동적 검증은 이번에 완료하지 못했다.
F4/F5(서명·체크섬·절대경로)는 이 환경의 실행 차단과도 관련될 수 있는 항목인데, 그건 내
소유 파일이 아니라 손대지 못한다.

### 6.2 대안 — exe 내부와 바이트 동일한 스테이징 wizard.ps1 로 캡처

`node tools/build-installer.js` 가 `installer/wizard.ps1`/`lang.ps1` 을 **손대지 않고 그대로**
`dist/oracle-tuner-*-installer-*/installer/` 에 복사한다는 것을 `diff` 로 실측 확인했다
(바이트 동일). 이 스테이징 사본을 `powershell -File` 로 직접 띄워 캡처했다 — exe 를 못
띄운 것과 별개로, **exe 안에 실제로 들어가는 코드 자체**를 검증한 것이다.

캡처 절차: `Start-Process`(-Wait 없음) → 창 뜰 때까지 폴링 → `AppActivate` →
`{DOWN}` 4회로 STEP0 라디오/콤보 전환 → 매번 스냅샷 → `Stop-Process`. 처음엔
`PrimaryScreen.Bounds` 전체를 찍었더니 창이 화면 경계를 넘어가 잘렸고, `GetWindowRect` +
크롭으로 바꿨더니 이번엔 이 프로세스가 DPI-unaware 라 논리 좌표와 물리 좌표가 어긋나
엉뚱한 영역이 잘렸다. `SetProcessDPIAware()` 를 캡처 스크립트에도 넣고서야 창 전체가
정확히 잘렸다.

### 6.3 캡처 4장 — 육안 확인 결과

`wiz2c-step0-default.png`(ko) · `wiz2c-step0-lang1.png`(en) · `wiz2c-step0-lang2.png`(ja) ·
`wiz2c-step0-lang3.png`(zh) — scratchpad 에 저장, Read 도구로 직접 열어 확인함.

**정상 확인된 것** (4개 언어 전부):
- 제목줄("OracleTuner 설치"/"Setup"/"セットアップ"/"安装"), 굵은 heading, `0/5 · 언어 선택`
  류 진행 표시, 안내 문구 — 전부 해당 언어로 정확히 전환됨. 글자 잘림·깨짐 없음.
- STEP0 라디오 4개 — 각 언어가 항상 "자기 자신의 언어"(한국어/English/日本語/中文)로
  표기되고, 선택 시 파란 점으로 정확히 반영됨. CJK 두부(□□□) 없음.
- 하단 `취소`/`< 이전`/`다음 >` (및 en/ja/zh 대응 문구) 버튼 — 정확히 로컬라이즈되고
  잘림 없음.
- 라이선스 화면(STEP1) 등 나머지 단계는 이번 캡처 범위(STEP0 4장)에 포함하지 않았다 —
  발주자 지시가 "STEP 0 에서 4개 언어 캡처"였고 SelfTest 가 STEP1~5 전이 자체는 이미
  검증했다.

**남은 문제 — 정직하게 미해결로 남긴다**:
- 제목줄 옆 언어 콤보박스(`langLabel`+`langCombo`)가 이 개발 환경(VDI/RDP 세션)에서는
  **빈 흰 상자로만 보이고 텍스트가 안 보인다.** 시도한 것: (1) `AutoScaleMode = None`
  (2) `SetProcessDPIAware()` (3) 캡처 대기시간 500ms→2.5s 연장 (4) `FlatStyle = 'System'`
  — 넷 다 효과 없었다. `langLabel`/`langCombo` 만 이러고 나머지 모든 컨트롤(라디오·버튼·
  라벨)은 멀쩡한 것으로 보아 이 특정 ComboBox 하나의 원격/가상 디스플레이 렌더링 문제로
  추정되며, **정확한 근본 원인은 규명하지 못했다.**
  - **기능 자체는 SelfTest 로 완전히 검증됐다** — `SelectedIndex` 이벤트 발화 → `State.Lang`
    갱신 → 창 제목 갱신 → STEP0 라디오 동기화까지 4개 언어 전부 통과(55/55 중 일부).
    즉 "고르면 언어가 안 바뀐다" 류의 기능 결함이 아니라 **이 화면에서 그리기만 안 되는**
    현상으로 보인다.
  - 실사용 환경(발주자 PC, 일반 로컬 디스플레이)에서 재현되는지는 **확인하지 못했다** —
    같은 종류의 VDI/RDP 세션에서 발생하는 알려진 WinForms ComboBox 페인트 버그일 가능성이
    있으나 단정할 근거는 없다.
  - STEP0 라디오가 이미 "제목 옆 콤보보다 우선하는" 주 진입점이므로(SPEC 자체가 콤보를
    "되돌리는 탈출구"로 규정), 이 잔여 문제가 있어도 언어 선택 기능은 STEP0 라디오로
    완전히 대체 가능하다.

---

## 7. 배타 소유 준수

`installer/wizard.ps1`, `installer/uninstall.ps1` 만 수정. `installer/lang.ps1` 은 키
추가만(기존 키 무변경). `tools/**`, `server/**`, `web/**`, `java/**`, `docs/**`(이 보고서
제외) 미접촉 — `git status`/`git diff --stat` 로 실측 확인.

## 8. 완료 조건 체크리스트

1. `wizard.ps1 -SelfTest` (이벤트 발화 포함) — ✅ 55/0
2. `uninstall.ps1 -SelfTest` — ✅ 19/0
3. `node tools/build-installer.js` — ✅ 성공
4. 실제 exe 캡처 4장 — ⚠️ **exe 자체는 실패**(§6.1), exe 와 바이트 동일한 wizard.ps1 로 대체
   캡처 성공(§6.2)
5. 캡처 육안 확인 — ✅ (§6.3, 언어 콤보 렌더링 잔여 문제 포함해 정직히 기록)
6. 확인 못 한 것을 완료로 적지 않음 — exe 자체 기동, 언어 콤보 렌더링 원인 모두 "미해결"로
   명시함
