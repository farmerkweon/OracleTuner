# SEC-REVIEW · 설치 위저드 v2 보안 검토 (P-SEC 레인)

**검토자:** P-SEC (읽기 전용 레인) · **작성:** 2026-07-31
**대상:** `installer/wizard.ps1` · `installer/uninstall.ps1` · `installer/lang.ps1` · `tools/build-installer.js`
**스펙 기준:** `docs/panel/SPEC-installer-v2.md`
**종합 위험도:** **MEDIUM-HIGH**

> ⚠ **`wizard.ps1` 은 검토 시점에 다른 에이전트가 재작성 중이다.**
> 아래 wizard 관련 지적은 **2026-07-31 02:33 커밋본**을 근거로 한다. 재작성으로 사라질 수 있는 항목은
> `[재작성 중 — 확정 불가]` 로 표시했다. 반대로 `[구조 확정]` 표시 항목은 빌드 스크립트·설치 레이아웃·
> 경로 정책처럼 재작성과 무관하게 유지되는 것이므로 **반드시 조치해야 한다.**

---

## 요약

| # | 항목 | 심각도 | 상태 |
|---|---|---|---|
| F1 | uninstall.ps1 이 검증 없이 설치 폴더 트리를 통째로 재귀 삭제 | **높음** | [구조 확정] |
| F2 | 설치 경로 입력 무검증 (드라이브 루트·상대경로·기존 폴더 덮어쓰기) | **높음** | [재작성 중] |
| F3 | 사용자 쓰기 가능 폴더의 스크립트를 승격 실행할 위험 | 중간 | [구조 확정] |
| F4 | exe 무서명 + SHA-256 미공개 | 중간 | [구조 확정] |
| F5 | IExpress 임시폴더 경유 실행 · tar 와 powershell 을 상대 경로로 호출 | 중간 | [구조 확정] |
| F6 | Program Files 선택 시 권한 승격·사전 쓰기검사 부재 → 반쪽 설치 | 중간 | [재작성 중] |
| F7 | 포트 값이 검증 없이 settings.json 으로 (테스트 안 누르면 기본값) | 낮음 | [재작성 중] |
| F8 | `secret.key` 의 `mode: 0o600` 이 Windows 에서 무효 | 낮음 | [구조 확정] |
| F9 | zip-slip | 낮음 (현재 비악용) | [구조 확정] |
| F10 | 제거 프로그램 레지스트리 미등록 | 낮음 | [구조 확정] |

**통과한 항목 (실측 확인):** 평문 비밀 없음 · 127.0.0.1 고정 · 데이터 분리 실재 · 의존성 취약점 0건.

---

## 1. 권한 · 경로

### ✅ 데이터 분리는 **실제로 되어 있다** (실측 확인)

- `server/paths.js:91-93` — `settingsFile` · `connectionsFile` · `keyFile` 전부 `DATA_ROOT` 하위.
- `server/paths.js:28,57` — 설치 모드에서 `DATA_ROOT = %LOCALAPPDATA%\OracleTuner`.
- `installer/wizard.ps1:159-162` — 위저드가 `config` · `data` · `logs` 를 그 아래에 만든다.
- `installer/wizard.ps1:172-173` — `settings.json` 을 `%LOCALAPPDATA%\OracleTuner\config\` 에 쓴다.

⇒ SPEC 80-90행의 레이아웃 약속(`%LOCALAPPDATA%` 불가침)은 **코드로 지켜지고 있다.**
   Program Files 설치 시 "데이터는 딴 데 저장되니 안전하다"는 안내
   (`wizard.ps1:335-337`, `lang.ps1:42/105/168/231`)는 **사실에 부합한다.**

---
### 🔴 F1 [높음][구조 확정] · uninstall.ps1 의 무조건 자기 삭제

**위치:** `installer/uninstall.ps1:115-116`

```powershell
$cmdLine = "/c ping 127.0.0.1 -n 3 >nul & rmdir /s /q `"$InstallDir`""
Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdLine -WindowStyle Hidden
```

`$InstallDir = $PSScriptRoot` (`uninstall.ps1:91`). **그 폴더가 정말 OracleTuner 설치 폴더인지
한 번도 확인하지 않고 트리 전체를 지운다.**

- **악용 가능성:** 원격 공격 불필요. **사용자 오조작만으로 발생한다** — 그래서 더 나쁘다.
  사용자가 설치 경로에 `D:\Tools` 나 `C:\` 를 직접 타이핑하면(F2 참조 — 막는 코드가 없다),
  uninstall.ps1 이 그 폴더에 복사되고(`wizard.ps1:134-137`), 나중에 제거를 누르는 순간
  **그 폴더 전체가 무관한 파일까지 통째로 삭제된다.**
- **피해 범위:** 사용자 임의 데이터 소실. 관리자 권한으로 제거를 실행했다면 시스템 영역까지.
  이 명령은 확인도, 휴지통도 없다.
- **부수 결함:** `uninstall.ps1:23-26` 의 `Remove-InstallTree` 는 알려진 4개 항목만 지워
  올바르게 설계돼 있는데, 115행이 그 신중함을 무효화한다. 앞뒤가 안 맞는다.

**조치 (반드시):** 삭제 전에 "여기가 우리 설치 폴더"라는 증거를 요구하고, 위험 경로를 거부하라.

```powershell
# GOOD — 위 BAD 코드를 이 가드 뒤에서만 실행한다
function Test-SafeToRemove {
  param([string]$Dir)
  if (-not $Dir) { return $false }
  $full = [IO.Path]::GetFullPath($Dir).TrimEnd('\')
  # 1) 드라이브 루트 거부  (C 콜론 백슬래시 등)
  if ($full -match '^[A-Za-z]:$') { return $false }
  # 2) 알려진 시스템·사용자 최상위 폴더 거부
  $forbidden = @(
    $env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)},
    $env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA, $env:TEMP,
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('MyDocuments'),
    (Join-Path $env:LOCALAPPDATA 'Programs')
  ) | Where-Object { $_ }
  foreach ($f in $forbidden) {
    if ($full -eq $f.TrimEnd('\')) { return $false }
  }
  # 3) 우리 설치본이라는 증거(version.json)가 있어야 한다
  if (-not (Test-Path (Join-Path $full 'version.json'))) { return $false }
  return $true
}

if (-not (Test-SafeToRemove -Dir $InstallDir)) {
  [System.Windows.Forms.MessageBox]::Show(
    "설치 폴더로 보이지 않아 폴더 삭제를 건너뜁니다: $InstallDir`r`n" +
    "남은 파일은 직접 지워 주세요.", 'OracleTuner 제거', 'OK', 'Warning') | Out-Null
  exit 0
}
```

추가로 `Start-Process` 의 `-FilePath` 도 `"$env:SystemRoot\System32\cmd.exe"` 처럼
**절대 경로로 고정**하라 (F5 와 같은 이유).

---
### 🔴 F2 [높음][재작성 중] · 설치 경로 입력이 사실상 무검증

**위치:** `installer/wizard.ps1:313-317` (자유 입력 TextBox) · `installer/wizard.ps1:583-588` (다음 버튼 검증)

```powershell
} elseif ($script:currentStep -eq 1) {
  $state.InstallPath = $pathBox.Text
  if (-not $state.InstallPath) { ... return }    # ← 비었는지만 본다
}
```

빠져 있는 검증:

| 검증 | 현재 | 결과 |
|---|---|---|
| 절대 경로인가 | 없음 | `..\..\Foo` 입력 시 **위저드의 cwd 기준**으로 해석된다. IExpress 경로에서 cwd 는 임시폴더(IXP***.TMP) → 설치본이 임시 폴더에 박힌다 |
| 드라이브 루트인가 | 없음 | `C:\` 입력 가능 → **F1 과 결합해 재앙** |
| 기존 폴더가 비어 있는가 | 없음 | `Copy-Item -Force` (`wizard.ps1:119,125,130,136`)가 **경고 없이 덮어쓴다** |
| 유효 문자인가 | 없음 | 예외가 `installResultLabel` 에 raw 로 노출 (`wizard.ps1:616-617`) |

`찾아보기` 버튼(`wizard.ps1:344-350`)은 `Join-Path $dlg.SelectedPath 'OracleTuner'` 로 하위 폴더를
붙여 주므로 **안전하다.** 위험한 것은 직접 타이핑 경로뿐이다.

**"점두개 경로 탈출" 판정:** 이것은 **권한 상승이 아니다.** 위저드는 사용자 권한으로 돌고 그 사용자가
쓸 수 있는 곳에만 쓴다. 진짜 피해는 **의도치 않은 위치 설치 + F1 에 의한 데이터 소실**이다.
심각도를 "높음"으로 두는 이유는 상승 때문이 아니라 **되돌릴 수 없는 파일 삭제로 이어지기 때문**이다.

**조치 (재작성본에 반영할 것):**

```powershell
function Resolve-InstallPath {
  param([string]$Raw)
  if ([string]::IsNullOrWhiteSpace($Raw)) { return @{ ok=$false; msg='설치 경로를 입력하세요.' } }
  $t = $Raw.Trim().Trim('"')
  if (-not [IO.Path]::IsPathRooted($t)) {
    return @{ ok=$false; msg='절대 경로를 입력하세요.' }
  }
  try { $full = [IO.Path]::GetFullPath($t).TrimEnd('\') }
  catch { return @{ ok=$false; msg='경로에 사용할 수 없는 문자가 있습니다.' } }
  if ($full -match '^[A-Za-z]:$') {
    return @{ ok=$false; msg='드라이브 루트에는 설치할 수 없습니다. 하위 폴더를 지정하세요.' }
  }
  if ((Test-Path $full) -and (Get-ChildItem -LiteralPath $full -Force | Select-Object -First 1)) {
    return @{ ok=$true; path=$full; warnNonEmpty=$true }   # 사용자에게 덮어쓰기 확인을 받는다
  }
  return @{ ok=$true; path=$full; warnNonEmpty=$false }
}
```

비어 있지 않은 폴더에는 **YesNo 확인 후에만** 진행하고, 확인 문구에 "이 폴더의 기존 파일이 덮어써질 수
있으며 제거 시 폴더 전체가 삭제됩니다"를 반드시 넣어라.

---

## 2. 스크립트 실행 · ExecutionPolicy

### `-ExecutionPolicy Bypass` 의 불가피성 — **정당하다. 다만 대가가 있다**

**위치:** `tools/build-installer.js:173` · (빌드 시 zip 압축용) `tools/build-installer.js:153`

- **불가피한가: 그렇다.** 인스톨러 본체가 PowerShell 스크립트이고 서명이 없다. 기본 정책
  (Restricted 또는 RemoteSigned)에서는 실행 자체가 막힌다. 서명하지 않는 한 대안이 없다.
- **`Bypass` 자체는 취약점이 아니다.** ExecutionPolicy 는 Microsoft 스스로 보안 경계가 아니라고
  못박은 "실수 방지 장치"다. 사용자가 어차피 우회할 수 있다.
- **진짜 문제는 이것이다:** Bypass 를 쓰는 순간 **"이 .ps1 이 우리 것인가"를 보증하는 수단이
  스크립트 파일의 위치 ACL 과 exe 서명, 딱 둘만 남는다.** 그런데 지금 **둘 다 약하다**(F3, F4).
- **잘한 점:** `-NoProfile` 이 붙어 있다 (`build-installer.js:153,173`). 사용자 프로필 스크립트를
  통한 코드 주입을 막는다. **재작성 시 이 플래그를 지우지 마라.**

---

### 🟠 F3 [중간][구조 확정] · 설치본 스크립트의 변조 위험 — 설치 위치에 따라 갈린다

설치본에는 `uninstall.ps1` 이 놓이고(`wizard.ps1:134-137`), SPEC 85행에 따라 재작성본은
`lang.ps1` 도 같이 놓게 된다. `lang.ps1` 은 **dot-source 로 읽히는 문자열 테이블**이므로
(`build-installer.js:80-82` 주석이 명시) **그 파일에 쓰기 = 임의 코드 실행**이다.

| 설치 위치 | 스크립트 ACL | 위험 |
|---|---|---|
| `%LOCALAPPDATA%\Programs\OracleTuner` (**기본값** — `wizard.ps1:209`) | 사용자 쓰기 **가능** | 같은 사용자 권한 코드가 `lang.ps1` 을 바꿔치기할 수 있다. 단, 그 코드는 **이미 그 사용자 권한을 가졌으므로 경계를 넘지는 않는다** → 그 자체로는 낮음 |
| `C:\Program Files\OracleTuner` | 관리자만 쓰기 | **스크립트 무결성 측면에서는 이쪽이 안전하다** |

**⚠ 위험이 실제로 발생하는 지점은 "승격 실행"이다.**
기본 설치 위치(사용자 쓰기 가능)에 놓인 `uninstall.ps1` 이나 `lang.ps1` 을 사용자가
**"관리자 권한으로 실행"** 하는 순간, **비특권 코드가 심어 둔 내용이 관리자 권한으로 실행된다.**
제거가 잘 안 될 때 관리자로 다시 시도하는 것은 사용자의 매우 자연스러운 행동이므로 현실적인 경로다.

**조치:**

1. `%LOCALAPPDATA%` 설치본의 `uninstall.ps1` 은 **승격을 요구하지도, 권하지도 마라.** 필요 없다.
   문서·UI 에 "관리자 권한으로 실행하지 마세요"를 명시.
2. Program Files 설치본의 제거만 승격시키되, 그 스크립트는 관리자 전용 ACL 아래 있으므로 안전하다.
3. `lang.ps1` 을 dot-source 하기 전에 **폴더가 사용자 쓰기 가능한데 현재 승격 상태이면 중단**하라.

```powershell
$isElevated = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isElevated -and (Test-IsUserWritable -Path $PSScriptRoot)) {
  Write-Error '관리자 권한으로 실행 중이지만 스크립트가 사용자 쓰기 가능한 폴더에 있습니다. 중단합니다.'
  exit 1
}
. (Join-Path $PSScriptRoot 'lang.ps1')
```

4. **더 나은 대안:** `lang.ps1` 을 dot-source 하지 말고 **데이터로만 읽어라**
   (`lang.json` + `ConvertFrom-Json`). 코드 실행 경로를 아예 없애는 것이 근본 해결이다.
   현재 `lang.ps1` 은 순수 해시테이블 리터럴 364행이므로 JSON 전환 비용이 낮다.

---
## 3. IExpress 패키징

### 🟠 F5 [중간][구조 확정] · `%TEMP%` 의 `IXP***.TMP` 경유 실행

**위치:** `tools/build-installer.js:160-179` (`writeLauncherBat`) · `:219` (`AppLaunched`)

`install-launcher.bat` 이 하는 일 (원문 요지):

- `cd /d "%~dp0"` — cwd 를 `%TEMP%` 의 `IXP***.TMP` 로 옮긴다
- `tar -xf payload.zip -C extracted` — **`tar` 를 상대 이름으로 부른다**
- `powershell -NoProfile -ExecutionPolicy Bypass -File "extracted\installer\wizard.ps1"`
  — **`powershell` 도 상대 이름이다**

문제:

- `%TEMP%` 는 **해당 사용자가 자유롭게 쓸 수 있는 폴더**다. cwd 를 그리로 옮긴 뒤
  `tar` 와 `powershell` 을 **상대 이름으로** 부른다. cmd.exe 는 실행 파일을 찾을 때
  **현재 디렉터리를 먼저 본다.** 그 폴더에 `tar.exe` 나 `powershell.exe` 를 미리 심어 둘 수 있는
  코드가 있으면 가로챈다.
- 사용자가 **Program Files 설치를 위해 setup.exe 를 "관리자 권한으로 실행"** 하면, 그 전체 사슬
  (IXP 임시 폴더 내용 → tar → powershell → wizard.ps1)이 **비특권 사용자가 쓸 수 있는 폴더에서
  관리자 권한으로 실행된다.** 로컬 권한 상승 경로다.
  (단, 같은 사용자의 UAC 승격은 Microsoft 가 보안 경계로 보지 않으므로 CRITICAL 은 아니다 → 중간.)
- 폴더명이 매번 랜덤(`IXP000.TMP` 계열)이라 정밀 타격은 어렵지만, 폴링 레이스로 충분히 가능하다.

**조치 — 비용이 거의 0 이므로 반드시 하라.**
`writeLauncherBat` 의 명령줄에서 **시스템 바이너리를 절대 경로로 고정**한다.

```javascript
// build-installer.js:167,173 을 다음과 같이 바꾼다
'set "PS=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
'set "TAR=%SystemRoot%\\System32\\tar.exe"',
'"%TAR%" -xf payload.zip -C extracted',
'if errorlevel 1 ( echo payload.zip 압축 해제 실패 & pause & exit /b 1 )',
'"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0extracted\\installer\\wizard.ps1"',
```

`wizard.ps1` 경로도 상대(`extracted\...`)가 아니라 `%~dp0` 기준 절대 경로로 주는 편이 안전하다.

추가 권고: 위저드 종료 후 `extracted` 폴더를 정리하라. 현재는 위저드가 예외로 죽으면
**앱 소스 전체와 node.exe 가 `%TEMP%` 에 그대로 남는다**(IExpress 가 AppLaunched 반환 후 정리하지만,
비정상 종료 시 잔존 사례가 있다). 정보 노출이라기보다 위생 문제다 — 낮음.

---

### 🟢 F9 [낮음][구조 확정] · zip-slip — **현재 구조에서는 악용 불가**

**위치:** `tools/build-installer.js:145-156` (zip 생성) · `:167` (`tar -xf`)

- `payload.zip` 은 `[System.IO.Compression.ZipFile]::CreateFromDirectory` 로
  **빌드 머신의 스테이징 폴더에서** 만들어진다(`:149-151`). 엔트리 이름은 전부 스테이징 루트 기준
  상대 경로이고 **공격자 입력이 개입할 여지가 없다.**
- Windows 내장 `tar`(bsdtar)는 `-P` 없이는 선행 슬래시를 제거하고 상위 이동 성분을 거부한다.
- ⇒ **현재 zip-slip 은 성립하지 않는다.** payload.zip 을 바꿔치기할 수 있는 공격자는 이미 exe 를
  통째로 바꿀 수 있으므로 zip-slip 을 쓸 이유가 없다.
- **다만 F5 의 절대 경로 고정을 적용해야** `tar` 가 진짜 Windows 내장 tar 임이 보장되어
  이 방어가 실제로 유효해진다. 지금은 `tar` 가 무엇인지 보장이 없다는 점이 남은 구멍이다.

---

## 4. 설정 파일 — 평문 비밀

### ✅ **통과. 위저드는 평문 비밀을 쓰지 않는다** (실측 확인)

- **비밀 스캔:** `installer/` 전체에 대해 `password` `passwd` `secret` `token` `apiKey` `credential`
  (대소문자 무시) → **0건.**
- `installer/wizard.ps1:168-173` — `settings.json` 에 기록하는 것은 **딱 두 갈래뿐**이다.

```powershell
$settings = [ordered]@{
  java   = [ordered]@{ home = $javaHome }
  server = [ordered]@{ port = [int]$State.Port; host = '127.0.0.1'; openBrowser = $true }
}
```

  접속정보·비밀번호·토큰은 **한 글자도 들어가지 않는다.** 위저드는 DB 접속정보를 아예 묻지 않는다.
- 비밀번호는 앱 쪽 `server/secret.js` 가 담당한다. AES-256-GCM(기밀성+무결성),
  저장 형식 `v1:iv:tag:cipher` (`secret.js:11,51-57`). 알고리즘 선택은 적절하다.
- `secret.js:5-9` 가 **한계를 정직하게 문서화**하고 있다("키를 같은 PC 에 두므로 PC 를 장악한
  공격자에게는 방어가 되지 않는다"). 과장하지 않은 점을 높이 평가한다.

### 🟡 F8 [낮음][구조 확정] · `secret.key` 의 `mode: 0o600` 은 Windows 에서 무효

**위치:** `server/secret.js:34-37`

```javascript
fs.writeFileSync(P.keyFile, k, { mode: 0o600 });
try { fs.chmodSync(P.keyFile, 0o600); } catch (e) { }   // 주석대로 Windows 에서 무시된다
```

- Windows 에서 `mode` 는 읽기전용 비트 외에는 아무 효과가 없다. 키 파일은 **부모 폴더 ACL 을 상속**한다.
- 다행히 `%LOCALAPPDATA%` 의 기본 ACL 은 해당 사용자 + SYSTEM + Administrators 로 제한되어 있어
  **실질적으로는 충분하다.** 위저드도 `New-Item` 으로 폴더만 만들 뿐 ACL 을 넓히지 않는다
  (`wizard.ps1:160-162`) — **잘한 것이다.**
- 남는 위험: 같은 PC 의 다른 관리자 계정은 읽을 수 있다. 위협모델상 수용 가능.
- **권고(선택):** 진짜로 사용자 단위로 묶고 싶으면 Windows DPAPI 를 쓰라.
  `ProtectedData.Protect(key, null, DataProtectionScope.CurrentUser)` 로 키 파일을 한 겹 더 감싸면
  다른 계정(관리자 포함)이 파일을 복사해 가도 복호화할 수 없다. **설치 위저드의 책임 범위는 아니다.**

---
## 5. 서명 · 무결성

### 🟠 F4 [중간][구조 확정] · 무서명 exe + SHA-256 미공개

**실측 결과:**

```
Get-AuthenticodeSignature dist\OracleTunerSetup-1.0.0-beta.1-no-jre.exe
  → Status = NotSigned,  SignerCertificate = (없음)

SHA-256 = 2E8FCBFA0D0548030AC1215E964C00A3A704E9FF83B3B57C88008EF6B8C1E5BA
크기     = 43,450,368 bytes
```

`dist/` 및 리포 전체에 `.sha256` 이나 `checksum` 류 파일 **0건.**

- **SmartScreen:** 서명이 없으면 "Windows 에서 PC 를 보호했습니다" 화면이 뜨고, 평판이
  **영원히 쌓이지 않는다**(평판은 서명 인증서 단위로 축적된다). 사용자는 매 버전마다
  **"추가 정보 → 실행"을 누르도록 훈련된다.** 정확히 그 습관이 바꿔치기된 인스톨러를 통과시킨다.
- **폐쇄망 맥락에서 더 중요하다.** exe 가 USB·파일서버를 거쳐 전달되므로 전송 경로에 TLS 가 없다.
  **체크섬이 유일하게 남은 무결성 통제 수단**인데 그것조차 없다.
- IExpress 는 `CAB_ResvCodeSigning=0` 으로 설정돼 있다(`build-installer.js:194`) —
  서명용 공간을 예약하지 않는다는 뜻이다. 서명할 계획이라면 이 값을 `1` 로 두는 편이 낫다.

**조치 (우선순위 순):**

1. **즉시 (비용 0):** 릴리스마다 SHA-256 을 산출해 릴리스 노트에 병기하라.
   `buildExeWithIExpress` 성공 분기(`build-installer.js:258-262`)에 이미
   `sha256File()` 함수(`:109-112`)가 있으니 재사용하면 된다.

```javascript
if (ok) {
  const size = fs.statSync(targetExe).size;
  const sha = sha256File(targetExe);                                   // ← 추가
  fs.writeFileSync(targetExe + '.sha256',                              // ← 추가
    sha + ' *' + path.basename(targetExe) + '\n', 'utf8');
  console.log('  SHA-256: ' + sha);                                    // ← 추가
  return { ok: true, exePath: targetExe, size, sha256: sha };
}
```

   사용자 검증 안내도 릴리스 노트에 넣어라 — `Get-FileHash <exe> -Algorithm SHA256`.

2. **가능하면:** 코드 서명 인증서로 exe 와 `.ps1` 양쪽에 서명하라.
   `.ps1` 을 서명하면 `-ExecutionPolicy Bypass` 를 `AllSigned` 로 낮출 수 있어
   **F3(스크립트 변조)까지 동시에 해결된다.** 가장 값어치 있는 한 방이다.
   exe 는 `signtool sign` (SHA-256 + 타임스탬프), 스크립트는
   `Set-AuthenticodeSignature -FilePath installer\wizard.ps1 -Certificate $cert` 로 서명한다.

3. `manifest-*.json` (`build-installer.js:127-141`)은 app 파일 SHA-256 을 이미 담고 있다.
   **설치 후 무결성 자가검사**에 재활용할 수 있는 좋은 자산이다 — 지금은 패치 비교용으로만 쓰인다.

---

## 6. 포트 바인딩

### ✅ **통과. `127.0.0.1` 고정이며 외부 노출 여지 없다** (실측 확인)

| 위치 | 내용 |
|---|---|
| `installer/wizard.ps1:170` | `host = '127.0.0.1'` **하드코딩.** 위저드에 host 입력 UI 자체가 없다 |
| `installer/wizard.ps1:686` | 포트 검사용 리스너도 `IPAddress::Parse('127.0.0.1')` |
| `server/config.js:39` | 기본값 `host: '127.0.0.1'` |
| `server/index.js:5-6` | "기본 바인딩은 127.0.0.1. DB 접속정보를 다루므로 기본값으로 외부에 열지 않는다" |
| `server/index.js:203-206` | host 가 127.0.0.1 이나 localhost 가 아니면 **경고 로그** |
| `server/index.js:222` | `server.listen(port, host, ...)` — 인자 있는 바인딩(전체 인터페이스 아님) |

포트 탐색도 `127.0.0.1` 로만 수행해 **방화벽 팝업을 유발하지 않는다**
(`wizard.ps1:447`, `lang.ps1:55/118/181/244`). 판단이 옳다.

**잔여 위험 (낮음):** `settings.json` 은 사용자가 편집 가능한 평문이다. 나중에 `host` 를
전체 인터페이스로 바꾸면 접속정보를 다루는 서버가 LAN 에 열린다. `index.js:206` 이 경고하지만
**로그 파일에만 남아 아무도 읽지 않는다.**
**권고:** 비루프백 바인딩 시 서버 시작을 지연시키고 **콘솔과 브라우저 첫 화면에 눈에 띄는 배너**를 띄워라.

---
## 7. 추가 발견

### 🟠 F6 [중간][재작성 중] · Program Files 선택 시 승격도, 사전 검사도 없다

`wizard.ps1:95-104` 가 Program Files 를 **탐지**하고 `:334-341` 이 **경고 라벨**을 띄우지만,
**권한을 요청하지도, 실제로 쓸 수 있는지 확인하지도 않는다.**
리포 전체에 `-Verb RunAs` 는 **0건**이다(grep 확인).

결과: 사용자가 Program Files 를 고르고 [설치]를 누르면 `Install-AppFiles` 의
`New-Item`(`:111`) 또는 `Copy-Item`(`:119`)에서 UnauthorizedAccessException 이 터지고,
`catch`(`:615-618`)가 **빨간 라벨에 raw 예외 메시지를 뿌린다.**
**롤백이 없어 부분 복사된 반쪽 설치가 그대로 남는다.**

**조치:**

```powershell
function Test-CanWrite {
  param([string]$Path)
  try {
    $probeDir = $Path
    if (-not (Test-Path $probeDir)) { $probeDir = Split-Path $Path -Parent }
    $probe = Join-Path $probeDir ('.ot-write-probe-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType File -Path $probe -ErrorAction Stop | Out-Null
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    return $true
  } catch { return $false }
}
```

`[다음]` 또는 `[설치]` 직전에 이 검사를 돌리고, 실패하면
(a) 관리자 권한으로 재실행할지 묻거나 (b) `%LOCALAPPDATA%\Programs\OracleTuner` 로 되돌려라.

⚠ 승격 재실행을 구현할 때 **`$PSCommandPath` 는 `%TEMP%` 의 `IXP***.TMP\extracted\...` 다**(F5 참조).
사용자 쓰기 가능 위치의 스크립트를 승격 실행하는 셈이므로, F5 의 절대 경로 고정을 **먼저** 적용하고
가능하면 승격보다 `%LOCALAPPDATA%` 설치를 기본 유도하라. **가장 안전한 답은 승격을 아예 안 하는 것이다.**

---

### 🟡 F7 [낮음][재작성 중] · 포트가 검증 없이 settings.json 으로 간다

`$state.Port` 는 **[테스트] 버튼 핸들러 안에서만** 대입된다(`wizard.ps1:503`).
`[다음]` 핸들러(`:577-623`)에는 STEP 4(포트) 분기가 **없다.**
⇒ 사용자가 포트를 타이핑하고 테스트를 누르지 않은 채 다음으로 넘어가면
**입력값은 버려지고 기본값 7070 이 `settings.json` 에 기록된다**(`:213` → `:170`).

`[테스트]` 안의 범위 검증(`:491`, 1 부터 65535)은 올바르다 — **그 검증을 [다음] 경로로 옮겨라.**
보안 영향은 작지만 "사용자가 고른 값과 실제 설정이 다르다"는 것은 신뢰의 문제다.

---

### 🟡 F10 [낮음][구조 확정] · 제거 프로그램 레지스트리 미등록

`installer/` 전체에 `HKCU` `HKLM` `Registry` `New-ItemProperty` → **0건.**
Windows "앱 및 기능"에 나타나지 않아 사용자는 `uninstall.ps1` 을 직접 찾아 실행해야 한다.
⇒ 제거를 포기한 사용자의 PC 에 **사용자 쓰기 가능한 스크립트(F3)가 무기한 남는다.**

**권고:** `HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OracleTuner` 에
`DisplayName` `DisplayVersion` `InstallLocation` `UninstallString` 을 등록하라.
HKCU 이므로 관리자 권한이 필요 없다.

### 📋 스펙 대비 미이행 (보안 아님 — 재작성본 확인용)

- `SPEC-installer-v2.md:85` — 설치본에 `lang.ps1` 을 두라. 현재 `wizard.ps1:134-137` 은
  `uninstall.ps1` 만 복사한다. (`build-installer.js:82` 는 스테이징에는 이미 담고 있다.)
- `SPEC-installer-v2.md:88-89` — `settings.json` 에 `ui.locale` 기록. 현재 `wizard.ps1:168-171` 에 없다.
  (`server/config.js:66` 에 `locale: 'ko'` 스키마는 존재한다.)
- `SPEC-installer-v2.md:93` — uninstall 이 `version.json` 의 언어로 말할 것.
  현재 `uninstall.ps1:94-111` 은 한국어 하드코딩이고 `version.json` 을 읽지 않는다.
  `Write-VersionJson`(`wizard.ps1:147-153`)도 locale 을 쓰지 않는다.

---

## 8. 의존성 감사 (A06)

```
npm audit --json  →  critical 0, high 0, moderate 0, low 0, info 0
                     prod 의존성 2개
```

**결과: 취약점 0건.** 의존성 표면적이 극히 작다(`node_modules/open-grid` 만 번들 —
`build-installer.js:72-75`). 공급망 위험 관점에서 **모범적이다.**

**단, 감사 범위 밖:**

- `runtime/node.exe` — 번들되는 Node 자체의 CVE 는 npm audit 대상이 아니다.
  `checkBundledNodeVersion`(`build-installer.js:97-105`)이 메이저 버전만 확인한다.
  **릴리스 전 번들 Node 의 정확한 패치 버전을 Node 보안 릴리스 목록과 대조하라.**
- `java/lib/ojdbc11.jar`(`build-installer.js:67-71`) — Oracle JDBC 드라이버.
  버전과 알려진 CVE 를 확인하지 못했다. **미확인 항목으로 남긴다.**

---
## OWASP Top 10 적용 결과

| | 카테고리 | 판정 |
|---|---|---|
| A01 | 접근 통제 | ⚠ F1·F2 — 경로 검증 부재로 임의 위치 쓰기·삭제. F6 승격 처리 미비 |
| A02 | 암호화 실패 | ✅ AES-256-GCM 적절. F8(Windows ACL) 낮음 |
| A03 | 인젝션 | ✅ 해당 없음. `Invoke-Expression` 계열 0건. 삭제 명령 인자는 따옴표 처리됨(`uninstall.ps1:115`) |
| A04 | 안전하지 않은 설계 | ⚠ F1 — "확인 없는 재귀 삭제"는 설계 결함이다 |
| A05 | 보안 설정 오류 | ⚠ F5 — 상대 경로 바이너리 호출. ✅ `-NoProfile` 은 적용됨 |
| A06 | 취약한 구성요소 | ✅ npm audit 0건. ⚠ node.exe 와 ojdbc11.jar 미확인 |
| A07 | 인증 실패 | ✅ 해당 없음 (설치기에 인증 없음) |
| A08 | 무결성 실패 | 🔴 **F4 — 무서명 + 체크섬 미공개. 이 검토의 최대 구조적 약점** |
| A09 | 로깅 실패 | ⚠ 설치 로그가 없다. 실패 시 라벨 한 줄(`wizard.ps1:616-617`)이 전부 — 사후 추적 불가 |
| A10 | SSRF | ✅ 해당 없음. 위저드는 외부 네트워크 요청을 하지 않는다 |

---

## 조치 우선순위

| 순위 | 항목 | 기한 | 비고 |
|---|---|---|---|
| 1 | **F1** uninstall 삭제 가드 | 릴리스 차단 | 사용자 데이터 소실. 오조작만으로 발생 |
| 2 | **F2** 설치 경로 검증 | 릴리스 차단 | F1 의 방아쇠. 재작성본에 반드시 |
| 3 | **F4-1** SHA-256 산출·공개 | 릴리스 전 | 코드 5줄. 안 할 이유가 없다 |
| 4 | **F5** tar 와 powershell 절대 경로 | 릴리스 전 | 문자열 2줄 |
| 5 | **F6** 쓰기 사전검사 + 승격 안내 | 릴리스 전 | 반쪽 설치 방지 |
| 6 | **F3** lang.ps1 을 JSON 데이터로 | 1주 | 코드 실행 경로 제거가 근본책 |
| 7 | **F7·F10** 포트 검증 · 레지스트리 등록 | 1개월 | |
| 8 | **F4-2** 코드 서명 | 조달되는 대로 | F3 + F4 + Bypass 를 한 번에 해결 |

---

## 보안 체크리스트

- [x] 하드코딩된 비밀 없음 — `installer/` 스캔 0건
- [x] 설정 파일에 평문 비밀 없음 — `wizard.ps1:168-173` 확인
- [x] 데이터 분리 실재 — `%LOCALAPPDATA%\OracleTuner` (`paths.js:91-93`)
- [x] 127.0.0.1 고정 — `wizard.ps1:170`, `index.js:222`
- [x] 의존성 감사 — npm audit 0건
- [x] 인젝션 없음 — `Invoke-Expression` 계열 0건
- [ ] **입력 검증** — 설치 경로 무검증 (F2)
- [ ] **파괴적 작업 가드** — uninstall 무조건 재귀 삭제 (F1)
- [ ] **무결성 검증** — 무서명 + 체크섬 미공개 (F4)
- [ ] **실행 경로 고정** — tar 와 powershell 상대 호출 (F5)
- [ ] **권한 처리** — Program Files 승격·사전검사 없음 (F6)
- [ ] 번들 node.exe 와 ojdbc11.jar CVE — **미확인**

---

## 정직성 고지 — 확인한 것과 확인 못 한 것

**실행해서 확인한 것:**
`Get-AuthenticodeSignature` → NotSigned · `Get-FileHash` → SHA-256 실측 ·
`npm audit --json` → 0건 · `dist/` 파일 목록 → 체크섬 파일 없음 ·
`installer/` 비밀 grep → 0건 · `HKCU` 와 `HKLM` grep → 0건 · `-Verb RunAs` grep → 0건.

**코드를 읽어서 확인한 것:**
`uninstall.ps1` 전체(117행) · `build-installer.js` 전체(299행) ·
`wizard.ps1` 의 1-120, 300-380, 455-509, 577-646 구간 · `secret.js:1-80` ·
`paths.js` 와 `index.js` 와 `config.js` 의 해당 grep 결과.

**추론이며 미검증인 것 (단정하지 않는다):**

- F5 의 cwd 하이재킹은 **코드 구조상의 가능성**이다. 실제 PoC 는 시도하지 않았다.
- IExpress 가 비정상 종료 시 `%TEMP%` 잔존물을 남기는지 — **직접 확인하지 않았다.**
- Windows `tar`(bsdtar)의 상위 이동 경로 거부 동작은 문서·통념에 근거한 것이며
  **이 머신에서 시험하지 않았다.**

**전혀 확인하지 못한 것:**

- **재작성 중인 `wizard.ps1` 의 최종 형태.** F2·F6·F7 은 재작성본에서 이미 해결됐을 수 있다.
  **재작성 완료 후 재검토가 필요하다.**
- `runtime/node.exe` 의 정확한 패치 버전과 CVE 대조.
- `java/lib/ojdbc11.jar` 의 버전과 CVE.
- 실제 exe 를 실행한 동적 검증 (설치 → 제거 왕복).