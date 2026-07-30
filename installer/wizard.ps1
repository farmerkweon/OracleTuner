<#
.SYNOPSIS
  OracleTuner 설치 위저드 (WinForms). 위저드 v2 — SPEC-installer-v2.md(총괄 확정 2026-07-31)에
  따라 재작성. 발주자 지시: "installer 다시 만들어 / 라이선스는 그냥 영문 쓰고 /
  언어는 시작할 때 먼저 선택"

.DESCRIPTION
  NSIS·Inno Setup 이 이 머신에 없어(폐쇄망이라 새로 받을 수도 없음) PowerShell +
  System.Windows.Forms 로 만든 6단계 위저드다(D-002 결정 + v2 STEP0 신설). 배포는 이
  스크립트를 IExpress 자가압축 EXE 안에 담아 낸다(tools/build-installer.js, Phase 4).

  단계: 0) 언어 선택(신설)  1) 라이선스(영문 원문 고정)+동의  2) 설치 경로
        3) Java 선택  4) 포트 지정  5) 요약/설치

  다국어 문자열은 installer/lang.ps1(4로케일 ko/en/ja/zh, 이미 완성·커밋됨)을 dot-source 로
  읽는다 — 이 파일에서 문자열을 다시 만들지 않는다. 라이선스 화면은 언어와 무관하게 항상
  영문 MIT 원문만 보여준다(번역·요약·병기 없음 — 총괄 지시).

  설치 레이아웃(D-002-a — 패치 설치파일 전제, 반드시 이대로):
    <설치폴더>\app\        server, web, shared, java\out, package.json  (패치가 교체하는 부분)
    <설치폴더>\runtime\    node.exe (+선택적 jre\)                      (거의 불변)
    <설치폴더>\version.json
    <설치폴더>\uninstall.ps1, lang.ps1                                  (제거 스크립트 + 문자열 테이블)
    %LOCALAPPDATA%\OracleTuner\  config, data, logs, oracletuner.db     (패치 불가침 — 사용자 데이터)

  포트 탐색은 server/port-utils.js 를, JDK 탐색은 server/config.js 의 기존 로직(CLI 래퍼)을
  그대로 재사용한다 — 위저드가 직접 재구현하지 않는다(총괄 지시).

  ⚠ WinForms 이벤트 핸들러 함정(실제로 당한 것 — SPEC-installer-v2.md §반드시 피할 함정):
  스크립트블록을 변수에 담아 나중에 Add_Click 등에 연결하면, 그 스크립트블록이 정의된
  함수(Build-Wizard)의 지역 변수를 GUI 이벤트 시점에는 더 이상 찾지 못한다(동적 스코프가
  이벤트 디스패치 호출 스택과 끊어짐). 이 파일의 모든 스크립트블록은 바깥 스코프 변수를
  참조하는 즉시 `.GetNewClosure()` 로 바인딩한다 — 직접 Add_Click 대상이든, 그 안에서
  `& $x` 로 호출되는 헬퍼 스크립트블록이든 예외 없이 적용한다.

.PARAMETER SelfTest
  GUI 창을 띄우지 않고 폼 생성·컨트롤 배치·포트/Java 탐색 로직이 예외 없이 동작하는지 콘솔에서
  검증한다. 이 스크립트가 비대화형 세션에서 실행되면(예: CI, 에이전트 검증) ShowDialog() 가
  입력을 기다리며 멈추기 때문에 별도 경로로 뺐다. v1 의 실패 사례(SPEC-installer-v2.md 참조):
  SelfTest 가 이벤트 핸들러를 직접 호출만 해서 32/32 통과했지만 실제 GUI 조작에서는 예외가
  났다. 그래서 이 SelfTest 는 `SelectedIndex =`, `.Checked =`, `.PerformClick()` 처럼
  **실제 이벤트를 발화**시켜 검증한다 — 함수 직접 호출만으로는 통과로 치지 않는다.

.PARAMETER SourceRoot
  배포 스테이징 루트(server/, web/, java/, package.json, runtime/ 등이 있는 폴더).
  기본값은 이 스크립트가 있는 installer/ 폴더의 부모다. tools/build-installer.js 가
  이 구조로 스테이징한다.
#>
param(
  [switch]$SelfTest,
  [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

# powershell.exe 는 기본적으로 DPI-unaware 프로세스다(스크립트라 매니페스트로 PerMonitorV2 를
# 선언할 수 없다). 분수 DPI(예: 150%) 모니터에서 실측 확인: DPI-unaware 상태로 두면 Windows 가
# 창 전체를 저해상도로 그린 뒤 비트맵을 확대해서 보여준다 — 큰 글자(제목·라디오 라벨)는 눈에
# 안 띄지만, 작은 컨트롤(언어 콤보·라벨, 9pt)은 확대 시 흐려져 사실상 안 보이는 수준까지 간다.
# SetProcessDPIAware() 로 시스템 DPI 인식을 켜면 Windows 가 비트맵 확대 없이 실제 해상도로
# 그려서 이 문제가 사라진다(Windows 10/11 전 버전에서 쓸 수 있는 구버전 API 를 쓴다 — 최신
# PerMonitorV2 API 는 매니페스트가 있어야 온전히 동작해 스크립트에는 맞지 않는다).
try {
  Add-Type -Name NativeDpi -Namespace OracleTuner -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetProcessDPIAware();
'@
  [void][OracleTuner.NativeDpi]::SetProcessDPIAware()
} catch {
  # DPI 인식 실패는 치명적이지 않다 — 화면이 흐리게 보일 뿐 기능은 그대로 동작한다.
}

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
} catch {
  Write-Error "WinForms 로드 실패 — 이 환경에서는 GUI 위저드를 쓸 수 없습니다: $($_.Exception.Message)"
  exit 1
}

# lang.ps1 은 이 스크립트와 같은 폴더에 있다(installer/). 4로케일 문자열 테이블,
# Get-Str/Get-DefaultLanguage/Get-UiFontName/Test-StringTableCompleteness/
# Build-LicenseDisplayText 를 그대로 가져다 쓴다 — 여기서 다시 만들지 않는다.
. (Join-Path $PSScriptRoot 'lang.ps1')

# ── 언어 선택 UI 전용 상수 ───────────────────────────────────────────────────
# STEP0 라디오 버튼과 제목줄 콤보박스가 공유하는 순서. 각 언어는 항상 "자기 자신의
# 언어"로 표기한다(번역하지 않음 — 한국어를 모르는 사용자도 "한국어"라는 표기 자체는
# 알아볼 수 있어야 하므로). UI-SPEC-installer-i18n.md §3.5 실측값과 동일한 문자열이라
# 폭 계산도 그대로 재사용할 수 있다.
$script:LangCodes = @('ko', 'en', 'ja', 'zh')
$script:LangNativeNames = @{
  ko = '한국어'
  en = 'English'
  ja = '日本語'
  zh = '中文'
}

<#
.SYNOPSIS
  $state.Lang 을 바꾼다. SPEC-installer-v2.md 함정 #3 대응 — "$script: 대입은 클로저
  안에서 하지 말고 함수로 감싸라"(v1 의 Set-CurrentLang 패턴). 여기서는 $state 가
  해시테이블(참조 타입)이라 프로퍼티 대입 자체는 클로저 안에서도 안전하지만, 발주자가
  명시적으로 지시한 이 이름의 래퍼 함수를 그대로 둔다 — "언어를 바꾸는 지점"을 코드
  전체에서 하나로 모아 두는 효과도 있다.
#>
function Set-CurrentLang {
  param(
    [Parameter(Mandatory = $true)][hashtable]$State,
    [Parameter(Mandatory = $true)][string]$Lang
  )
  $State.Lang = $Lang
}

<#
.SYNOPSIS
  로케일에 맞는 폰트를 컨트롤에 적용한다(UI-SPEC-installer-i18n.md §4 폰트 전략).
  licenseBox(영문 MIT 원문 전용, Consolas 고정)는 이 함수로 건드리지 않는다.
#>
function Set-ControlFont {
  param(
    [Parameter(Mandatory = $true)]$Control,
    [Parameter(Mandatory = $true)][string]$Lang,
    [double]$Size = 9,
    [bool]$Bold = $false
  )
  $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  $Control.Font = New-Object System.Drawing.Font((Get-UiFontName $Lang), $Size, $style)
}

# ── 공용 유틸 — 위저드와 서버가 같은 로직을 쓰도록 node CLI 를 감싼다 ──────────
# (port-utils.js / config.js 는 server/ 소유 에이전트(H)가 만든 것을 그대로 호출만 한다)

function Resolve-NodeExe {
  $bundled = Join-Path $SourceRoot 'runtime\node.exe'
  if (Test-Path $bundled) { return $bundled }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

$script:NodeExe = Resolve-NodeExe

function Invoke-NodeJson {
  param([string[]]$ArgList)
  if (-not $script:NodeExe) { return $null }
  $out = & $script:NodeExe @ArgList 2>$null
  if (-not $out) { return $null }
  try { return ($out | ConvertFrom-Json) } catch { return $null }
}

function Find-AvailablePort {
  param([int[]]$Candidates = @(7070, 7071, 7080, 8070, 8080, 9070))
  $script = Join-Path $SourceRoot 'server\port-utils.js'
  $csv = ($Candidates -join ',')
  return Invoke-NodeJson -ArgList @($script, '--find', $csv)
}

function Test-PortFree {
  param([int]$Port)
  $script = Join-Path $SourceRoot 'server\port-utils.js'
  return Invoke-NodeJson -ArgList @($script, '--check', "$Port")
}

function Get-JavaCandidates {
  $script = Join-Path $SourceRoot 'server\config.js'
  $r = Invoke-NodeJson -ArgList @($script, '--discover-java')
  if ($null -eq $r) { return @() }
  return @($r)
}

function Test-JavaHome {
  param([string]$HomePath)
  $script = Join-Path $SourceRoot 'server\config.js'
  return Invoke-NodeJson -ArgList @($script, '--check-java', $HomePath)
}

function Test-IsUnderProgramFiles {
  param([string]$Path)
  if (-not $Path) { return $false }
  $pf = $env:ProgramFiles
  $pfx86 = ${env:ProgramFiles(x86)}
  $full = $Path.TrimEnd('\')
  if ($pf -and $full.StartsWith($pf, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  if ($pfx86 -and $full.StartsWith($pfx86, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $false
}

<#
.SYNOPSIS
  설치 경로 입력을 검증한다(SEC-REVIEW-installer.md F2 — "설치 경로 입력이 사실상
  무검증"). 절대 경로만 허용하고, 드라이브 루트를 거부하고, 이미 파일이 있는 폴더면
  호출부가 사용자에게 덮어쓰기 확인을 받도록 warnNonEmpty 를 돌려준다.

.OUTPUTS
  [hashtable] ok / path / warnNonEmpty / msgKey(ok=$false 일 때만 — Get-Str 로 조회할 키)
#>
function Resolve-InstallPath {
  param([string]$Raw)
  if ([string]::IsNullOrWhiteSpace($Raw)) { return @{ ok = $false; msgKey = 'step2.pathRequiredWarning' } }
  $t = $Raw.Trim().Trim('"')
  if (-not [IO.Path]::IsPathRooted($t)) { return @{ ok = $false; msgKey = 'step2.pathNotAbsolute' } }
  try { $full = [IO.Path]::GetFullPath($t).TrimEnd('\') }
  catch { return @{ ok = $false; msgKey = 'step2.pathInvalidChars' } }
  if ($full -match '^[A-Za-z]:$') { return @{ ok = $false; msgKey = 'step2.pathDriveRoot' } }
  $nonEmpty = (Test-Path $full) -and (Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
  return @{ ok = $true; path = $full; warnNonEmpty = [bool]$nonEmpty }
}

<#
.SYNOPSIS
  실제로 그 경로에 쓸 수 있는지 파일을 하나 만들어 시험한다(SEC-REVIEW-installer.md F6 —
  "Program Files 선택 시 승격도 사전 검사도 없음"). 대상 폴더가 없으면 만드는 것까지가
  시험의 일부다(설치 시점에 Install-AppFiles 가 어차피 만든다). 실패하면 예외를 삼키고
  $false 만 돌려준다 — 호출부가 사용자에게 안내 문구를 보여줄 책임을 진다.
#>
function Test-CanWrite {
  param([string]$Path)
  try {
    New-Item -ItemType Directory -Force -Path $Path -ErrorAction Stop | Out-Null
    $probe = Join-Path $Path ('.ot-write-probe-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType File -Path $probe -ErrorAction Stop | Out-Null
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    return $true
  } catch { return $false }
}

# ── 설치 동작(실제 파일 복사·설정 기록·바로가기) — 마지막 단계 "설치" 버튼에서만 실행 ──

function Install-AppFiles {
  param([string]$InstallPath)
  $appDst = Join-Path $InstallPath 'app'
  New-Item -ItemType Directory -Force -Path $appDst | Out-Null

  $appItems = @('server', 'web', 'shared', 'java\out', 'java\lib', 'package.json', 'LICENSE')
  foreach ($item in $appItems) {
    $src = Join-Path $SourceRoot $item
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $appDst $item
    New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
    Copy-Item -Path $src -Destination $dst -Recurse -Force
  }
  $ogSrc = Join-Path $SourceRoot 'node_modules\open-grid'
  if (Test-Path $ogSrc) {
    $ogDst = Join-Path $appDst 'node_modules\open-grid'
    New-Item -ItemType Directory -Force -Path (Split-Path $ogDst -Parent) | Out-Null
    Copy-Item -Path $ogSrc -Destination $ogDst -Recurse -Force
  }

  $runtimeSrc = Join-Path $SourceRoot 'runtime'
  if (Test-Path $runtimeSrc) {
    Copy-Item -Path $runtimeSrc -Destination (Join-Path $InstallPath 'runtime') -Recurse -Force
  }

  # 제거 스크립트 + 다국어 문자열 테이블도 설치 폴더 최상단에 둔다(SPEC 의 설치 레이아웃:
  # <설치폴더>\uninstall.ps1, lang.ps1). uninstall.ps1 이 실행 시점에 lang.ps1 을
  # dot-source 로 읽어 설치 시 고른 언어로 메시지를 낸다 — 설치 폴더엔 installer\ 하위
  # 구조가 없으므로 uninstall.ps1 과 같은 폴더에 나란히 둬야 한다.
  foreach ($f in @('uninstall.ps1', 'lang.ps1')) {
    $src = Join-Path $PSScriptRoot $f
    if (Test-Path $src) { Copy-Item -Path $src -Destination (Join-Path $InstallPath $f) -Force }
  }
}

function Write-VersionJson {
  param([string]$InstallPath, [hashtable]$State)
  $pkgPath = Join-Path $SourceRoot 'package.json'
  $version = '0.0.0'
  if (Test-Path $pkgPath) {
    try { $version = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version } catch { }
  }
  $obj = [ordered]@{
    version     = $version
    installedAt = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    port        = [int]$State.Port
    javaMode    = $State.JavaMode
    javaHome    = $State.JavaHome
    language    = $State.Lang
  }
  ($obj | ConvertTo-Json) | Set-Content -Path (Join-Path $InstallPath 'version.json') -Encoding utf8
}

function Write-LocalAppDataSettings {
  param([hashtable]$State, [string]$InstallPath)
  $dataRoot = Join-Path $env:LOCALAPPDATA 'OracleTuner'
  New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot 'config') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot 'data') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot 'logs') | Out-Null

  $javaHome = $State.JavaHome
  if ($State.JavaMode -eq 'bundled') {
    $javaHome = Join-Path $InstallPath 'runtime\jre'
  }
  $settings = [ordered]@{
    java   = [ordered]@{ home = $javaHome }
    server = [ordered]@{ port = [int]$State.Port; host = '127.0.0.1'; openBrowser = $true }
    ui     = [ordered]@{ locale = $State.Lang }
  }
  $settingsPath = Join-Path $dataRoot 'config\settings.json'
  ($settings | ConvertTo-Json -Depth 5) | Set-Content -Path $settingsPath -Encoding utf8
  return $settingsPath
}

function New-AppShortcut {
  param([string]$TargetPath, [string]$ShortcutPath, [string]$WorkingDirectory)
  $wsh = New-Object -ComObject WScript.Shell
  $sc = $wsh.CreateShortcut($ShortcutPath)
  $sc.TargetPath = $TargetPath
  $sc.WorkingDirectory = $WorkingDirectory
  $sc.Save()
}

function Write-Launcher {
  param([string]$InstallPath)
  $bat = @(
    '@echo off'
    'setlocal'
    'cd /d "%~dp0"'
    'if exist "%~dp0runtime\node.exe" ('
    '  "%~dp0runtime\node.exe" "%~dp0app\server\index.js"'
    ') else ('
    '  node "%~dp0app\server\index.js"'
    ')'
    'if errorlevel 1 pause'
    'endlocal'
  ) -join "`r`n"
  $batPath = Join-Path $InstallPath 'OracleTuner.bat'
  Set-Content -Path $batPath -Value $bat -Encoding ASCII
  return $batPath
}

# ── GetNewClosure() 의 숨은 함정 — 함수 조회 경로도 끊긴다 ───────────────────
# `.GetNewClosure()` 는 "변수"만 캡처한다. 스크립트블록이 정의 시점의 스코프 체인
# (지역 함수 스코프 → 이 파일의 Script 스코프)에서는 떨어져 나가고 Global 스코프만
# 계속 닿는다. 이 파일과 lang.ps1 의 함수는 전부 Script 스코프에 있으므로, 폼 안의
# 클로저(언어 전환·경로 검사·포트/Java 탐색·설치 실행 등)가 이 함수들을 직접 호출하면
# "용어가 cmdlet... 이름으로 인식되지 않습니다" 로 즉시 죽는다(실측 확인 — Build-Wizard
# 안에서 `& $applyLanguage` 를 최초로 호출한 순간 Get-Str 호출 첫 줄에서 발생했다).
# 클로저 본문이 직접 호출하는 함수만 골라 Global 스코프에도 등록해 둔다(전이적으로
# 호출되는 함수 — 예: Find-AvailablePort 안에서 부르는 Invoke-NodeJson — 는 그 함수
# 자신의 정상 함수 스코프 안에서 실행되므로 승격이 필요 없다).
foreach ($fn in @(
    'Get-DefaultLanguage', 'Get-Str', 'Get-UiFontName',
    'Test-StringTableCompleteness', 'Build-LicenseDisplayText',
    'Set-CurrentLang', 'Set-ControlFont',
    'Find-AvailablePort', 'Test-PortFree', 'Get-JavaCandidates', 'Test-JavaHome',
    'Test-IsUnderProgramFiles', 'Resolve-InstallPath', 'Test-CanWrite',
    'Install-AppFiles', 'Write-VersionJson', 'Write-LocalAppDataSettings',
    'New-AppShortcut', 'Write-Launcher'
  )) {
  $sb = (Get-Item "function:$fn").ScriptBlock
  Set-Item -Path "function:global:$fn" -Value $sb
}

# ── 위저드 폼 구성 ───────────────────────────────────────────────────────────

function Build-Wizard {
  $state = @{
    InstallPath             = Join-Path $env:LOCALAPPDATA 'Programs\OracleTuner'
    LicenseAccepted         = $false
    JavaMode                = 'system'
    JavaHome                = ''
    Port                    = 7070
    CreateStartMenuShortcut = $true
    CreateDesktopShortcut   = $false
    Installed               = $false
    Lang                    = (Get-DefaultLanguage)
    CurrentStep             = 0
    SyncingLang             = $false
  }

  # $script:LangCodes/$LangNativeNames 를 지역 변수로 복사해 둔다. SPEC-installer-v2.md
  # 함정 #3 의 확장판 — GetNewClosure() 로 만든 스크립트블록은 "$script:" 스코프 자체가
  # 정의 시점의 최상위 스크립트 스코프와 분리된 자기만의 격리 스코프를 가리킨다(대입뿐
  # 아니라 조회도 끊긴다 — 실측: 클로저 안에서 $script:LangCodes 를 읽으면 $null 이 되어
  # "null 배열에 대한 인덱스" 예외가 났다). 평범한 지역 변수는 GetNewClosure() 가 정상적으로
  # 캡처하므로, 클로저들은 전부 이 지역 변수를 참조한다.
  $langCodes = $script:LangCodes
  $langNativeNames = $script:LangNativeNames

  $form = New-Object System.Windows.Forms.Form
  # WinForms 의 폰트 기반 자동 DPI 스케일링(AutoScaleMode=Font 가 기본값)을 끈다.
  # 분수 DPI(예: 150%) 모니터에서 실측: 켜져 있으면 컨트롤마다 스케일이 어긋나
  # (특히 $form.Controls 에 바로 얹은 langLabel/langCombo 가) 화살표만 남고 글자가
  # 안 보이는 현상이 났다. 끄면 Windows 자체 DPI 가상화(비트맵 확대)가 전체 창을
  # 통째로 일관되게 키워 주므로 이런 어긋남이 없다 — 매니페스트 없는 순수 스크립트
  # 인스톨러라 어차피 PerMonitorV2 를 선언할 수도 없다.
  $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
  $form.Size = New-Object System.Drawing.Size(620, 480)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false

  $titleLabel = New-Object System.Windows.Forms.Label
  $titleLabel.Location = New-Object System.Drawing.Point(20, 15)
  $titleLabel.Size = New-Object System.Drawing.Size(560, 30)
  $form.Controls.Add($titleLabel)

  # 제목줄 옆 언어 콤보 — 5단계 전체에서 항상 보이는 고정 위치(UI-SPEC §1).
  # STEP0 라디오와 양방향 동기화된다. 폭 실측 조치: langLabel 60→78px(§1 조치 지시).
  $langLabel = New-Object System.Windows.Forms.Label
  $langLabel.Location = New-Object System.Drawing.Point(415, 21)
  $langLabel.Size = New-Object System.Drawing.Size(78, 20)
  $langLabel.TextAlign = 'MiddleRight'
  $form.Controls.Add($langLabel)

  $langCombo = New-Object System.Windows.Forms.ComboBox
  $langCombo.DropDownStyle = 'DropDownList'
  $langCombo.Location = New-Object System.Drawing.Point(498, 18)
  $langCombo.Size = New-Object System.Drawing.Size(95, 24)
  foreach ($code in $langCodes) { [void]$langCombo.Items.Add($langNativeNames[$code]) }
  $langCombo.SelectedIndex = [Array]::IndexOf($langCodes, $state.Lang)
  $form.Controls.Add($langCombo)

  $stepLabel = New-Object System.Windows.Forms.Label
  $stepLabel.Location = New-Object System.Drawing.Point(20, 45)
  $stepLabel.Size = New-Object System.Drawing.Size(560, 20)
  $stepLabel.ForeColor = [System.Drawing.Color]::DimGray
  $form.Controls.Add($stepLabel)

  $bodyPanel = New-Object System.Windows.Forms.Panel
  $bodyPanel.Location = New-Object System.Drawing.Point(20, 70)
  $bodyPanel.Size = New-Object System.Drawing.Size(565, 320)
  $form.Controls.Add($bodyPanel)

  $navPanel = New-Object System.Windows.Forms.Panel
  $navPanel.Location = New-Object System.Drawing.Point(20, 400)
  $navPanel.Size = New-Object System.Drawing.Size(565, 40)
  $form.Controls.Add($navPanel)

  $btnCancel = New-Object System.Windows.Forms.Button
  $btnCancel.Location = New-Object System.Drawing.Point(0, 5)
  $btnCancel.Size = New-Object System.Drawing.Size(90, 28)
  $navPanel.Controls.Add($btnCancel)

  $btnBack = New-Object System.Windows.Forms.Button
  $btnBack.Location = New-Object System.Drawing.Point(365, 5)
  $btnBack.Size = New-Object System.Drawing.Size(90, 28)
  $navPanel.Controls.Add($btnBack)

  $btnNext = New-Object System.Windows.Forms.Button
  $btnNext.Location = New-Object System.Drawing.Point(465, 5)
  $btnNext.Size = New-Object System.Drawing.Size(100, 28)
  $navPanel.Controls.Add($btnNext)

  # ── STEP 0: 언어 선택 (신설 — SPEC-installer-v2.md) ───────────────────
  $panel0 = New-Object System.Windows.Forms.Panel
  $panel0.Size = $bodyPanel.Size
  $panel0.Location = New-Object System.Drawing.Point(0, 0)

  $instrLabel0 = New-Object System.Windows.Forms.Label
  $instrLabel0.Location = New-Object System.Drawing.Point(0, 0)
  $instrLabel0.Size = New-Object System.Drawing.Size(560, 30)
  $panel0.Controls.Add($instrLabel0)

  $langRadios = @()
  for ($i = 0; $i -lt $langCodes.Count; $i++) {
    $code = $langCodes[$i]
    $rb = New-Object System.Windows.Forms.RadioButton
    $rb.Text = $langNativeNames[$code]
    $rb.Location = New-Object System.Drawing.Point(0, (40 + $i * 40))
    $rb.Size = New-Object System.Drawing.Size(400, 30)
    $rb.Font = New-Object System.Drawing.Font((Get-UiFontName $code), 11)
    $panel0.Controls.Add($rb)
    $langRadios += $rb
  }
  $langRadios[[Array]::IndexOf($langCodes, $state.Lang)].Checked = $true

  # ── STEP 1: 라이선스(영문 원문 고정) + 동의 ────────────────────────────
  $panel1 = New-Object System.Windows.Forms.Panel
  $panel1.Size = $bodyPanel.Size
  $panel1.Location = New-Object System.Drawing.Point(0, 0)

  $introLabel = New-Object System.Windows.Forms.Label
  $introLabel.Location = New-Object System.Drawing.Point(0, 0)
  $introLabel.Size = New-Object System.Drawing.Size(560, 40)
  $panel1.Controls.Add($introLabel)

  # 라이선스 본문은 언어와 무관하게 항상 영문 MIT 원문이다(총괄 지시 — "그냥 영문 쓰고").
  # Build-LicenseDisplayText(lang.ps1)가 리포 루트 LICENSE 를 읽고, 없으면 내장 폴백을
  # 쓴다. 이 텍스트박스만 CJK 글리프가 필요 없는 고정폭 영문 폰트(Consolas)로 둔다 —
  # 로케일 폰트로 바꾸지 않는다(UI-SPEC §2 최소 조치와 달리, v2 는 요약/고지문을 아예
  # 없앴으므로 이 박스 내용 전체가 영문뿐이라 Consolas 를 그대로 써도 문제가 없다).
  $licenseBox = New-Object System.Windows.Forms.TextBox
  $licenseBox.Multiline = $true
  $licenseBox.ReadOnly = $true
  $licenseBox.ScrollBars = 'Vertical'
  $licenseBox.Font = New-Object System.Drawing.Font('Consolas', 9)
  $licenseBox.Location = New-Object System.Drawing.Point(0, 45)
  $licenseBox.Size = New-Object System.Drawing.Size(560, 220)
  $licenseBox.Text = Build-LicenseDisplayText -SourceRoot $SourceRoot
  $panel1.Controls.Add($licenseBox)

  $chkAccept = New-Object System.Windows.Forms.CheckBox
  $chkAccept.Location = New-Object System.Drawing.Point(0, 275)
  $chkAccept.Size = New-Object System.Drawing.Size(400, 24)
  $panel1.Controls.Add($chkAccept)

  # ── STEP 2: 설치 경로 ──────────────────────────────────────────────────
  $panel2 = New-Object System.Windows.Forms.Panel
  $panel2.Size = $bodyPanel.Size
  $panel2.Location = New-Object System.Drawing.Point(0, 0)

  $pathLabel = New-Object System.Windows.Forms.Label
  $pathLabel.Location = New-Object System.Drawing.Point(0, 0)
  $pathLabel.Size = New-Object System.Drawing.Size(560, 20)
  $panel2.Controls.Add($pathLabel)

  $pathBox = New-Object System.Windows.Forms.TextBox
  $pathBox.Location = New-Object System.Drawing.Point(0, 25)
  $pathBox.Size = New-Object System.Drawing.Size(440, 24)
  $pathBox.Text = $state.InstallPath
  $panel2.Controls.Add($pathBox)

  $btnBrowsePath = New-Object System.Windows.Forms.Button
  $btnBrowsePath.Location = New-Object System.Drawing.Point(450, 24)
  $btnBrowsePath.Size = New-Object System.Drawing.Size(110, 26)
  $panel2.Controls.Add($btnBrowsePath)

  $pathWarnLabel = New-Object System.Windows.Forms.Label
  $pathWarnLabel.Location = New-Object System.Drawing.Point(0, 60)
  $pathWarnLabel.Size = New-Object System.Drawing.Size(560, 80)
  $pathWarnLabel.ForeColor = [System.Drawing.Color]::DarkOrange
  $pathWarnLabel.Visible = $false
  $panel2.Controls.Add($pathWarnLabel)

  # ── STEP 3: Java 선택 ──────────────────────────────────────────────────
  $panel3 = New-Object System.Windows.Forms.Panel
  $panel3.Size = $bodyPanel.Size
  $panel3.Location = New-Object System.Drawing.Point(0, 0)

  $javaLabel = New-Object System.Windows.Forms.Label
  $javaLabel.Location = New-Object System.Drawing.Point(0, 0)
  $javaLabel.Size = New-Object System.Drawing.Size(560, 20)
  $panel3.Controls.Add($javaLabel)

  $radioSystemJava = New-Object System.Windows.Forms.RadioButton
  $radioSystemJava.Location = New-Object System.Drawing.Point(0, 30)
  $radioSystemJava.Size = New-Object System.Drawing.Size(250, 24)
  $radioSystemJava.Checked = $true
  $panel3.Controls.Add($radioSystemJava)

  $javaCombo = New-Object System.Windows.Forms.ComboBox
  $javaCombo.Location = New-Object System.Drawing.Point(20, 58)
  $javaCombo.Size = New-Object System.Drawing.Size(380, 24)
  $javaCombo.DropDownStyle = 'DropDown'
  $panel3.Controls.Add($javaCombo)

  $btnDiscoverJava = New-Object System.Windows.Forms.Button
  $btnDiscoverJava.Location = New-Object System.Drawing.Point(410, 57)
  $btnDiscoverJava.Size = New-Object System.Drawing.Size(70, 26)
  $panel3.Controls.Add($btnDiscoverJava)

  $btnBrowseJava = New-Object System.Windows.Forms.Button
  $btnBrowseJava.Location = New-Object System.Drawing.Point(485, 57)
  $btnBrowseJava.Size = New-Object System.Drawing.Size(75, 26)
  $panel3.Controls.Add($btnBrowseJava)

  $btnVerifyJava = New-Object System.Windows.Forms.Button
  $btnVerifyJava.Location = New-Object System.Drawing.Point(20, 90)
  $btnVerifyJava.Size = New-Object System.Drawing.Size(200, 26)
  $panel3.Controls.Add($btnVerifyJava)

  $javaResultLabel = New-Object System.Windows.Forms.Label
  $javaResultLabel.Location = New-Object System.Drawing.Point(20, 122)
  $javaResultLabel.Size = New-Object System.Drawing.Size(540, 50)
  $panel3.Controls.Add($javaResultLabel)

  $radioBundledJava = New-Object System.Windows.Forms.RadioButton
  $radioBundledJava.Location = New-Object System.Drawing.Point(0, 180)
  $radioBundledJava.Size = New-Object System.Drawing.Size(420, 24)
  $bundledJreExists = Test-Path (Join-Path $SourceRoot 'runtime\jre\bin\java.exe')
  $radioBundledJava.Enabled = $bundledJreExists
  $panel3.Controls.Add($radioBundledJava)

  $javaCandidates = @(Get-JavaCandidates)
  foreach ($c in $javaCandidates) { [void]$javaCombo.Items.Add($c.home) }
  if ($javaCombo.Items.Count -gt 0) { $javaCombo.SelectedIndex = 0 }

  # ── STEP 4: 포트 지정 ──────────────────────────────────────────────────
  $panel4 = New-Object System.Windows.Forms.Panel
  $panel4.Size = $bodyPanel.Size
  $panel4.Location = New-Object System.Drawing.Point(0, 0)

  $portLabel = New-Object System.Windows.Forms.Label
  $portLabel.Location = New-Object System.Drawing.Point(0, 0)
  $portLabel.Size = New-Object System.Drawing.Size(560, 20)
  $panel4.Controls.Add($portLabel)

  $portBox = New-Object System.Windows.Forms.TextBox
  $portBox.Location = New-Object System.Drawing.Point(0, 30)
  $portBox.Size = New-Object System.Drawing.Size(100, 24)
  $portBox.Text = '7070'
  $panel4.Controls.Add($portBox)

  # btnFindPort 폭 클리핑 실측 조치(UI-SPEC §3.3): 120→140px. btnTestPort 위치도
  # 그만큼(115+140+10=265) 오른쪽으로 민다.
  $btnFindPort = New-Object System.Windows.Forms.Button
  $btnFindPort.Location = New-Object System.Drawing.Point(115, 29)
  $btnFindPort.Size = New-Object System.Drawing.Size(140, 26)
  $panel4.Controls.Add($btnFindPort)

  $btnTestPort = New-Object System.Windows.Forms.Button
  $btnTestPort.Location = New-Object System.Drawing.Point(265, 29)
  $btnTestPort.Size = New-Object System.Drawing.Size(80, 26)
  $panel4.Controls.Add($btnTestPort)

  $portResultLabel = New-Object System.Windows.Forms.Label
  $portResultLabel.Location = New-Object System.Drawing.Point(0, 65)
  $portResultLabel.Size = New-Object System.Drawing.Size(540, 60)
  $panel4.Controls.Add($portResultLabel)

  # ── STEP 5: 요약 + 설치 ────────────────────────────────────────────────
  $panel5 = New-Object System.Windows.Forms.Panel
  $panel5.Size = $bodyPanel.Size
  $panel5.Location = New-Object System.Drawing.Point(0, 0)

  $summaryBox = New-Object System.Windows.Forms.TextBox
  $summaryBox.Multiline = $true
  $summaryBox.ReadOnly = $true
  $summaryBox.ScrollBars = 'Vertical'
  $summaryBox.Location = New-Object System.Drawing.Point(0, 0)
  $summaryBox.Size = New-Object System.Drawing.Size(560, 190)
  $panel5.Controls.Add($summaryBox)

  $chkStartMenu = New-Object System.Windows.Forms.CheckBox
  $chkStartMenu.Checked = $true
  $chkStartMenu.Location = New-Object System.Drawing.Point(0, 200)
  $chkStartMenu.Size = New-Object System.Drawing.Size(300, 24)
  $panel5.Controls.Add($chkStartMenu)

  $chkDesktop = New-Object System.Windows.Forms.CheckBox
  $chkDesktop.Checked = $false
  $chkDesktop.Location = New-Object System.Drawing.Point(0, 228)
  $chkDesktop.Size = New-Object System.Drawing.Size(300, 24)
  $panel5.Controls.Add($chkDesktop)

  $installResultLabel = New-Object System.Windows.Forms.Label
  $installResultLabel.Location = New-Object System.Drawing.Point(0, 260)
  $installResultLabel.Size = New-Object System.Drawing.Size(560, 60)
  $panel5.Controls.Add($installResultLabel)

  # ── 단계 배열 ──────────────────────────────────────────────────────────
  $panels = @($panel0, $panel1, $panel2, $panel3, $panel4, $panel5)
  $stepTextKeys = @(
    'step.progress.0', 'step.progress.1', 'step.progress.2',
    'step.progress.3', 'step.progress.4', 'step.progress.5'
  )
  foreach ($p in $panels) { $bodyPanel.Controls.Add($p); $p.Visible = $false }

  # ── 헬퍼 스크립트블록 — 전부 바깥 스코프(위 컨트롤들·$state)를 참조하므로
  #    정의 시점에 .GetNewClosure() 로 바인딩한다. 이후 이벤트 핸들러 안에서
  #    `& $x` 로 호출돼도(호출부가 아니라 정의부에서 바인딩했으므로) 안전하다. ─

  $updatePathWarning = {
    $state.InstallPath = $pathBox.Text
    if (Test-IsUnderProgramFiles -Path $pathBox.Text) {
      $pathWarnLabel.Text = Get-Str $state.Lang 'step2.programFilesWarning'
      $pathWarnLabel.Visible = $true
    } else {
      $pathWarnLabel.Visible = $false
    }
  }.GetNewClosure()

  $buildSummary = {
    $lang = $state.Lang
    $state.JavaMode = if ($radioBundledJava.Checked) { 'bundled' } else { 'system' }
    $javaModeExtra = if ($state.JavaMode -eq 'system') { " ($($state.JavaHome))" } else { '' }
    $dataRoot = Join-Path $env:LOCALAPPDATA 'OracleTuner'
    $summaryBox.Text = (
      ((Get-Str $lang 'step5.summary.installPath') -f $state.InstallPath) + "`r`n" +
      ((Get-Str $lang 'step5.summary.javaMode') -f $state.JavaMode, $javaModeExtra) + "`r`n" +
      ((Get-Str $lang 'step5.summary.port') -f $state.Port) + "`r`n`r`n" +
      ((Get-Str $lang 'step5.summary.dataLocation') -f $dataRoot) + "`r`n" +
      (Get-Str $lang 'step5.summary.dataNote')
    )
  }.GetNewClosure()

  $updateNextEnabled = {
    if ($state.CurrentStep -eq 1) { $btnNext.Enabled = $chkAccept.Checked }
    else { $btnNext.Enabled = $true }
  }.GetNewClosure()

  # 언어를 바꿀 때 화면에 그려진 모든 컨트롤의 .Text/.Font 를 즉시 재대입한다(리렌더 없이
  # in-place 갱신 — UI-SPEC §1). licenseBox 와 STEP0 라디오의 자기 언어 표기는 건드리지
  # 않는다(각각 "항상 영문", "항상 자기 자신의 언어"이므로 UI 언어 전환과 무관하다).
  $applyLanguage = {
    $lang = $state.Lang

    $form.Text = Get-Str $lang 'wizard.title'
    Set-ControlFont -Control $form -Lang $lang -Size 9

    $titleLabel.Text = Get-Str $lang 'wizard.heading'
    Set-ControlFont -Control $titleLabel -Lang $lang -Size 13 -Bold $true

    $langLabel.Text = Get-Str $lang 'lang.selectorLabel'
    Set-ControlFont -Control $langLabel -Lang $lang -Size 9
    Set-ControlFont -Control $langCombo -Lang $lang -Size 9

    $stepLabel.Text = Get-Str $lang $stepTextKeys[$state.CurrentStep]
    Set-ControlFont -Control $stepLabel -Lang $lang -Size 9

    $btnCancel.Text = Get-Str $lang 'common.cancel'
    $btnBack.Text = Get-Str $lang 'common.back'
    if ($state.CurrentStep -eq 5) {
      $btnNext.Text = if ($state.Installed) { Get-Str $lang 'common.close' } else { Get-Str $lang 'common.install' }
    } else {
      $btnNext.Text = Get-Str $lang 'common.next'
    }
    foreach ($b in @($btnCancel, $btnBack, $btnNext)) { Set-ControlFont -Control $b -Lang $lang -Size 9 }

    # STEP0
    $instrLabel0.Text = Get-Str $lang 'step0.instruction'
    Set-ControlFont -Control $instrLabel0 -Lang $lang -Size 9

    # STEP1 (licenseBox 제외 — 항상 영문 고정)
    $introLabel.Text = Get-Str $lang 'step1.intro'
    $chkAccept.Text = Get-Str $lang 'step1.acceptLicense'
    foreach ($c in @($introLabel, $chkAccept)) { Set-ControlFont -Control $c -Lang $lang -Size 9 }

    # STEP2
    $pathLabel.Text = Get-Str $lang 'step2.pathLabel'
    $btnBrowsePath.Text = Get-Str $lang 'common.browseFolder'
    foreach ($c in @($pathLabel, $pathBox, $btnBrowsePath, $pathWarnLabel)) { Set-ControlFont -Control $c -Lang $lang -Size 9 }
    if ($pathWarnLabel.Visible) { $pathWarnLabel.Text = Get-Str $lang 'step2.programFilesWarning' }

    # STEP3
    $javaLabel.Text = Get-Str $lang 'step3.javaLabel'
    $radioSystemJava.Text = Get-Str $lang 'step3.systemJava'
    $btnDiscoverJava.Text = Get-Str $lang 'step3.discover'
    $btnBrowseJava.Text = Get-Str $lang 'step3.browseJava'
    $btnVerifyJava.Text = Get-Str $lang 'step3.verify'
    $radioBundledJava.Text = Get-Str $lang 'step3.bundledJava'
    foreach ($c in @($javaLabel, $radioSystemJava, $javaCombo, $btnDiscoverJava, $btnBrowseJava, $btnVerifyJava, $javaResultLabel, $radioBundledJava)) {
      Set-ControlFont -Control $c -Lang $lang -Size 9
    }

    # STEP4
    $portLabel.Text = Get-Str $lang 'step4.portLabel'
    $btnFindPort.Text = Get-Str $lang 'step4.findPort'
    $btnTestPort.Text = Get-Str $lang 'step4.testPort'
    foreach ($c in @($portLabel, $portBox, $btnFindPort, $btnTestPort, $portResultLabel)) { Set-ControlFont -Control $c -Lang $lang -Size 9 }

    # STEP5
    $chkStartMenu.Text = Get-Str $lang 'step5.startMenuShortcut'
    $chkDesktop.Text = Get-Str $lang 'step5.desktopShortcut'
    foreach ($c in @($chkStartMenu, $chkDesktop, $summaryBox, $installResultLabel)) { Set-ControlFont -Control $c -Lang $lang -Size 9 }
    if ($state.CurrentStep -eq 5) { & $buildSummary }
  }.GetNewClosure()

  $showStep = {
    param([int]$idx)
    foreach ($p in $panels) { $p.Visible = $false }
    $panels[$idx].Visible = $true
    $state.CurrentStep = $idx
    $stepLabel.Text = Get-Str $state.Lang $stepTextKeys[$idx]
    $btnBack.Enabled = ($idx -gt 0)
    if ($idx -eq 5) {
      & $buildSummary
      $btnNext.Text = if ($state.Installed) { Get-Str $state.Lang 'common.close' } else { Get-Str $state.Lang 'common.install' }
    } else {
      $btnNext.Text = Get-Str $state.Lang 'common.next'
    }
    & $updateNextEnabled
  }.GetNewClosure()

  # STEP0 라디오 4개가 공유하는 핸들러 본문 — $this(발화시킨 라디오)로 인덱스를 찾는다.
  # for 루프에서 $i 를 캡처하는 대신 이렇게 하면 "루프 변수 캡처" 함정도 같이 피한다.
  $langRadioHandler = {
    if (-not $this.Checked) { return }
    if ($state.SyncingLang) { return }
    $state.SyncingLang = $true
    $idx = [Array]::IndexOf($langRadios, $this)
    if ($idx -ge 0) {
      $newLang = $langCodes[$idx]
      Set-CurrentLang -State $state -Lang $newLang
      & $applyLanguage
      if ($langCombo.SelectedIndex -ne $idx) { $langCombo.SelectedIndex = $idx }
    }
    $state.SyncingLang = $false
  }.GetNewClosure()

  # ── 이벤트 핸들러 연결 — 전부 .GetNewClosure() (SPEC 함정 #1) ──────────

  $btnCancel.Add_Click({ $form.Close() }.GetNewClosure())
  $btnBack.Add_Click({ & $showStep ($state.CurrentStep - 1) }.GetNewClosure())

  $btnNext.Add_Click({
    if ($state.CurrentStep -eq 1) {
      if (-not $chkAccept.Checked) {
        [System.Windows.Forms.MessageBox]::Show(
          (Get-Str $state.Lang 'step1.licenseRequiredWarning'),
          (Get-Str $state.Lang 'wizard.title'), 'OK', 'Warning') | Out-Null
        return
      }
    } elseif ($state.CurrentStep -eq 2) {
      # SEC-REVIEW-installer.md F2/F6 — 절대경로·드라이브 루트 거부, 비어있지 않은 폴더는
      # 확인 후에만 진행, 실제 쓰기 가능 여부까지 시험한다(승격은 하지 않는다 — 가장 안전한
      # 답은 승격을 아예 안 하는 것이라는 보안 검토 권고를 따른다).
      $resolved = Resolve-InstallPath -Raw $pathBox.Text
      if (-not $resolved.ok) {
        [System.Windows.Forms.MessageBox]::Show(
          (Get-Str $state.Lang $resolved.msgKey),
          (Get-Str $state.Lang 'wizard.title'), 'OK', 'Warning') | Out-Null
        return
      }
      if ($resolved.warnNonEmpty) {
        $overwriteConfirm = [System.Windows.Forms.MessageBox]::Show(
          ((Get-Str $state.Lang 'step2.pathNonEmptyConfirm') -f $resolved.path),
          (Get-Str $state.Lang 'wizard.title'), 'YesNo', 'Warning')
        if ($overwriteConfirm -ne [System.Windows.Forms.DialogResult]::Yes) { return }
      }
      if (-not (Test-CanWrite -Path $resolved.path)) {
        [System.Windows.Forms.MessageBox]::Show(
          (Get-Str $state.Lang 'step2.writeCheckFailed'),
          (Get-Str $state.Lang 'wizard.title'), 'OK', 'Warning') | Out-Null
        return
      }
      $state.InstallPath = $resolved.path
      $pathBox.Text = $resolved.path
    } elseif ($state.CurrentStep -eq 4) {
      # SEC-REVIEW-installer.md F7 — 포트 값이 [테스트] 를 눌러야만 커밋됐다. [다음] 경로에도
      # 같은 범위 검증을 넣어, 테스트를 건너뛰어도 사용자가 입력한 값이 그대로 반영되게 한다.
      $portVal = 0
      if (-not [int]::TryParse($portBox.Text, [ref]$portVal) -or $portVal -le 0 -or $portVal -gt 65535) {
        [System.Windows.Forms.MessageBox]::Show(
          (Get-Str $state.Lang 'step4.invalidPort'),
          (Get-Str $state.Lang 'wizard.title'), 'OK', 'Warning') | Out-Null
        return
      }
      $state.Port = $portVal
    } elseif ($state.CurrentStep -eq 5) {
      # 마지막 단계 — 처음 누르면 "설치", 설치가 끝난 뒤 다시 누르면(버튼이 "닫기"로
      # 바뀜) 창을 닫는다.
      if ($state.Installed) {
        $form.Close()
        return
      }
      $state.JavaMode = if ($radioBundledJava.Checked) { 'bundled' } else { 'system' }
      $state.CreateStartMenuShortcut = $chkStartMenu.Checked
      $state.CreateDesktopShortcut = $chkDesktop.Checked
      try {
        Install-AppFiles -InstallPath $state.InstallPath
        Write-VersionJson -InstallPath $state.InstallPath -State $state
        Write-LocalAppDataSettings -State $state -InstallPath $state.InstallPath
        $batPath = Write-Launcher -InstallPath $state.InstallPath
        if ($state.CreateStartMenuShortcut) {
          $startMenu = [Environment]::GetFolderPath('StartMenu')
          New-AppShortcut -TargetPath $batPath -ShortcutPath (Join-Path $startMenu 'OracleTuner.lnk') -WorkingDirectory $state.InstallPath
        }
        if ($state.CreateDesktopShortcut) {
          $desktop = [Environment]::GetFolderPath('Desktop')
          New-AppShortcut -TargetPath $batPath -ShortcutPath (Join-Path $desktop 'OracleTuner.lnk') -WorkingDirectory $state.InstallPath
        }
        $installResultLabel.ForeColor = [System.Drawing.Color]::Green
        $installResultLabel.Text = (Get-Str $state.Lang 'step5.installSuccess') -f $state.InstallPath
        $state.Installed = $true
        $btnNext.Text = Get-Str $state.Lang 'common.close'
      } catch {
        $installResultLabel.ForeColor = [System.Drawing.Color]::Red
        $installResultLabel.Text = (Get-Str $state.Lang 'step5.installError') -f $_.Exception.Message
      }
      return
    }
    if ($state.CurrentStep -lt 5) { & $showStep ($state.CurrentStep + 1) }
    else { $form.Close() }
  }.GetNewClosure())

  $pathBox.Add_TextChanged($updatePathWarning)
  $btnBrowsePath.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = Get-Str $state.Lang 'step2.folderDialogDescription'
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $pathBox.Text = Join-Path $dlg.SelectedPath 'OracleTuner'
    }
  }.GetNewClosure())

  $btnDiscoverJava.Add_Click({
    $javaCombo.Items.Clear()
    $found = @(Get-JavaCandidates)
    foreach ($c in $found) { [void]$javaCombo.Items.Add($c.home) }
    if ($javaCombo.Items.Count -gt 0) { $javaCombo.SelectedIndex = 0 }
    else {
      $javaResultLabel.ForeColor = [System.Drawing.Color]::DarkOrange
      $javaResultLabel.Text = Get-Str $state.Lang 'step3.notFound'
    }
  }.GetNewClosure())

  $btnBrowseJava.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = Get-Str $state.Lang 'step3.javaFolderDialogDescription'
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $javaCombo.Text = $dlg.SelectedPath
    }
  }.GetNewClosure())

  $btnVerifyJava.Add_Click({
    $home = $javaCombo.Text
    $r = Test-JavaHome -HomePath $home
    if ($null -eq $r) {
      $javaResultLabel.ForeColor = [System.Drawing.Color]::Red
      $javaResultLabel.Text = Get-Str $state.Lang 'step3.nodeUnavailable'
    } elseif ($r.java) {
      $javaResultLabel.ForeColor = [System.Drawing.Color]::Green
      $javaResultLabel.Text = (Get-Str $state.Lang 'step3.verified') -f $r.version, $r.java
      $state.JavaHome = $home
    } else {
      $javaResultLabel.ForeColor = [System.Drawing.Color]::Red
      $javaResultLabel.Text = (Get-Str $state.Lang 'step3.failed') -f $r.error
    }
  }.GetNewClosure())

  $btnFindPort.Add_Click({
    $r = Find-AvailablePort
    if ($null -eq $r) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = Get-Str $state.Lang 'step4.nodeUnavailableFind'
    } elseif ($r.port) {
      $portBox.Text = "$($r.port)"
      $portResultLabel.ForeColor = [System.Drawing.Color]::Green
      $portResultLabel.Text = (Get-Str $state.Lang 'step4.foundPort') -f $r.port
    } else {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = Get-Str $state.Lang 'step4.allBusy'
    }
  }.GetNewClosure())

  $btnTestPort.Add_Click({
    $p = 0
    if (-not [int]::TryParse($portBox.Text, [ref]$p) -or $p -le 0 -or $p -gt 65535) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = Get-Str $state.Lang 'step4.invalidPort'
      return
    }
    $r = Test-PortFree -Port $p
    if ($null -eq $r) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = Get-Str $state.Lang 'step4.nodeUnavailableTest'
    } elseif ($r.free) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Green
      $portResultLabel.Text = (Get-Str $state.Lang 'step4.portFree') -f $p
      $state.Port = $p
    } else {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = (Get-Str $state.Lang 'step4.portBusy') -f $p
    }
  }.GetNewClosure())

  $chkAccept.Add_CheckedChanged({
    $state.LicenseAccepted = $chkAccept.Checked
    & $updateNextEnabled
  }.GetNewClosure())

  $langCombo.Add_SelectedIndexChanged({
    if ($state.SyncingLang) { return }
    $idx = $langCombo.SelectedIndex
    if ($idx -lt 0) { return }
    $state.SyncingLang = $true
    $newLang = $langCodes[$idx]
    Set-CurrentLang -State $state -Lang $newLang
    & $applyLanguage
    if (-not $langRadios[$idx].Checked) { $langRadios[$idx].Checked = $true }
    $state.SyncingLang = $false
  }.GetNewClosure())

  foreach ($rb in $langRadios) { $rb.Add_CheckedChanged($langRadioHandler.GetNewClosure()) }

  # ── 초기 렌더 ───────────────────────────────────────────────────────────
  & $applyLanguage
  & $showStep 0

  return @{
    Form     = $form
    State    = $state
    Panels   = $panels
    Controls = @{
      ChkAccept        = $chkAccept
      PathBox          = $pathBox
      PathWarnLabel    = $pathWarnLabel
      JavaCombo        = $javaCombo
      RadioBundledJava = $radioBundledJava
      JavaResultLabel  = $javaResultLabel
      PortBox          = $portBox
      PortResultLabel  = $portResultLabel
      SummaryBox       = $summaryBox
      BtnNext          = $btnNext
      BtnBack          = $btnBack
      BtnCancel        = $btnCancel
      LangCombo        = $langCombo
      LangRadios       = $langRadios
    }
  }
}

# ── 실행 ─────────────────────────────────────────────────────────────────

if ($SelfTest) {
  $pass = 0
  $fail = 0
  function ST-Assert {
    param([string]$Name, [bool]$Cond, [string]$Detail = '')
    if ($Cond) { $script:pass++; Write-Host "  OK $Name" }
    else { $script:fail++; Write-Host "  FAIL $Name $Detail" -ForegroundColor Red }
  }

  Write-Host "== SelfTest: SourceRoot = $SourceRoot =="
  Write-Host "== SelfTest: node = $script:NodeExe =="

  try {
    $completeness = Test-StringTableCompleteness
    foreach ($lang in @('ko', 'en', 'ja', 'zh')) {
      ST-Assert "lang.ps1 — $lang 로케일 누락 키 없음" ($completeness[$lang].Missing.Count -eq 0) ("누락: " + ($completeness[$lang].Missing -join ', '))
    }
  } catch {
    $fail++
    Write-Host "  FAIL 문자열 테이블 완전성 검사 중 예외: $($_.Exception.Message)" -ForegroundColor Red
  }

  try {
    $built = Build-Wizard
    ST-Assert '폼 생성' ($null -ne $built.Form)
    ST-Assert '6단계 패널 생성(STEP0 언어선택 포함)' ($built.Panels.Count -eq 6)
    ST-Assert '언어 라디오 4개 생성' ($built.Controls.LangRadios.Count -eq 4)
    ST-Assert '라이선스 동의 체크박스 존재' ($null -ne $built.Controls.ChkAccept)
    ST-Assert '설치 경로 입력란 기본값 채워짐' ([string]::IsNullOrEmpty($built.Controls.PathBox.Text) -eq $false)
    ST-Assert 'Java 콤보박스 존재' ($null -ne $built.Controls.JavaCombo)
    ST-Assert '포트 입력란 기본값 7070' ($built.Controls.PortBox.Text -eq '7070')
    ST-Assert '요약 박스 존재' ($null -ne $built.Controls.SummaryBox)
    ST-Assert '시작 단계는 STEP0(언어 선택)' ($built.State.CurrentStep -eq 0)

    # Button.PerformClick() 은 내부적으로 CanSelect(= Visible && Enabled, 조상 체인
    # 포함)를 확인하고 false 면 아무 것도 안 한다(예외도 없이 조용히 무시 — 실측 확인).
    # Form 을 한 번도 Show() 하지 않으면 조상 체인의 Visible 이 false 라 PerformClick() 이
    # 전부 무효화된다. 여기서는 .Show() 만 하고 Application.Run()/ShowDialog() 는 호출하지
    # 않으므로 메시지 루프를 펌프하지 않는다 — 블로킹 없이(비대화형 세션 안전) 그냥 컨트롤
    # 트리를 "보이는" 상태로 만들어 PerformClick() 이 실제 Click 이벤트를 발화하게 한다.
    $built.Form.Show()

    # ── 이벤트 발화 테스트 (직접 함수 호출이 아니라 실제 GUI 경로) ──────
    # v1 의 실패 원인(SPEC-installer-v2.md): $applyLanguage 를 직접 호출해서만 검증해
    # 32/32 통과했지만 실제 콤보 조작에서 예외가 났다. 여기서는 SelectedIndex 대입/
    # Checked 대입/PerformClick() 으로 실제 이벤트를 발화시킨다.
    foreach ($i in 0..3) {
      $built.Controls.LangCombo.SelectedIndex = $i
      $expected = $script:LangCodes[$i]
      ST-Assert "langCombo.SelectedIndex=$i 이벤트 발화 → 예외 없이 State.Lang=$expected" ($built.State.Lang -eq $expected)
      ST-Assert "  ↳ 창 제목이 $expected 문자열로 갱신됨" ($built.Form.Text -eq (Get-Str $expected 'wizard.title'))
      ST-Assert "  ↳ STEP0 라디오[$i] 가 동기화되어 체크됨" ($built.Controls.LangRadios[$i].Checked)
    }
    foreach ($i in 0..3) {
      $built.Controls.LangRadios[$i].Checked = $true
      $expected = $script:LangCodes[$i]
      ST-Assert "STEP0 라디오[$i].Checked=true 이벤트 발화 → State.Lang=$expected" ($built.State.Lang -eq $expected)
      ST-Assert "  ↳ langCombo 가 동기화됨(SelectedIndex=$i)" ($built.Controls.LangCombo.SelectedIndex -eq $i)
    }

    # STEP0 → STEP1: PerformClick 으로 실제 Next 버튼 클릭 경로 발화
    $built.Controls.BtnNext.PerformClick()
    ST-Assert 'Next.PerformClick() → STEP0→1 전환' ($built.State.CurrentStep -eq 1)
    ST-Assert '라이선스 미동의 상태에서 다음 버튼 비활성' (-not $built.Controls.BtnNext.Enabled)

    $built.Controls.ChkAccept.Checked = $true
    ST-Assert 'chkAccept.Checked=true 이벤트 발화 → 다음 버튼 활성화' ($built.Controls.BtnNext.Enabled)

    $built.Controls.BtnNext.PerformClick()
    ST-Assert 'STEP1→2 전환' ($built.State.CurrentStep -eq 2)

    # F2/F6 (SEC-REVIEW-installer.md) — 잘못된 경로(상대경로·드라이브 루트)는 MessageBox 를
    # 띄우고 그 자리에 머무른다. 비대화형 세션에서 실제로 그 MessageBox 를 발화시키면 아무도
    # 눌러줄 사람이 없어 영원히 멈춘다 — 그래서 거부 케이스는 Resolve-InstallPath 를 순수
    # 함수로 직접 단위 테스트한다(이벤트 핸들러가 아니라 일반 로직 함수이므로 직접 호출이
    # 정당하다 — SPEC 이 금지한 건 "이벤트 핸들러를 우회해 GUI 배선을 검증한 셈 치는 것"이지,
    # 순수 함수를 단위 테스트하는 것이 아니다). [다음] 클릭 이벤트 자체는 유효한 경로로만
    # 발화시켜 정상 경로를 실제 GUI 경로로 검증한다.
    $rEmpty = Resolve-InstallPath -Raw ''
    ST-Assert 'Resolve-InstallPath — 빈 값 거부' (-not $rEmpty.ok)
    $rRelative = Resolve-InstallPath -Raw 'relative\path'
    ST-Assert 'Resolve-InstallPath — 상대경로 거부' (-not $rRelative.ok)
    $rDriveRoot = Resolve-InstallPath -Raw 'C:\'
    ST-Assert 'Resolve-InstallPath — 드라이브 루트 거부' (-not $rDriveRoot.ok)
    # [IO.Path]::GetFullPath() 는 8.3 짧은 이름(예: FARMER~1)을 실제 긴 이름(farmerkweon)으로
    # 정규화한다(이 환경에서 실측 확인) — Resolve-InstallPath 가 정상 동작이라 그런 것이지
    # 버그가 아니다. 여기서도 같은 정규화를 미리 거쳐야 이후 비교가 어긋나지 않는다.
    $sandboxInstallPath = [IO.Path]::GetFullPath((Join-Path $env:TEMP ("ot-wizard-selftest-" + [Guid]::NewGuid().ToString('N')))).TrimEnd('\')
    $rValid = Resolve-InstallPath -Raw $sandboxInstallPath
    ST-Assert 'Resolve-InstallPath — 유효한 절대경로 통과' ($rValid.ok -and $rValid.path -eq $sandboxInstallPath)
    ST-Assert 'Test-CanWrite — TEMP 하위 샌드박스 폴더는 쓰기 가능' (Test-CanWrite -Path $sandboxInstallPath)

    $built.Controls.PathBox.Text = $sandboxInstallPath
    $built.Controls.BtnNext.PerformClick()
    ST-Assert 'STEP2→3 전환(유효 경로 이벤트 발화)' ($built.State.CurrentStep -eq 3)
    ST-Assert 'F2/F6 — InstallPath 가 검증된 경로로 반영됨' ($built.State.InstallPath -eq $sandboxInstallPath)

    $built.Controls.BtnNext.PerformClick()
    ST-Assert 'STEP3→4 전환' ($built.State.CurrentStep -eq 4)

    # F7 (SEC-REVIEW-installer.md) — [테스트] 를 누르지 않아도 [다음] 이 입력값을 그대로
    # 커밋해야 한다(이전에는 기본값 7070 이 조용히 저장됐다). 기본값과 다른 값을 넣어
    # 실제로 반영되는지 이벤트 발화로 확인한다.
    $built.Controls.PortBox.Text = '18080'
    $built.Controls.BtnNext.PerformClick()
    ST-Assert 'STEP4→5 전환(요약 화면)' ($built.State.CurrentStep -eq 5)
    ST-Assert 'F7 — [테스트] 없이도 포트 입력값이 State.Port 에 반영됨' ($built.State.Port -eq 18080)
    ST-Assert '요약 화면에서 다음 버튼 문구가 설치로 바뀜' ($built.Controls.BtnNext.Text -eq (Get-Str $built.State.Lang 'common.install'))

    $built.Controls.BtnBack.PerformClick()
    ST-Assert 'Back.PerformClick() 이벤트 발화 정상 동작(STEP5→4)' ($built.State.CurrentStep -eq 4)

    $built.Form.Hide()
    $built.Form.Dispose()
  } catch {
    $fail++
    Write-Host "  FAIL 폼 생성/이벤트 발화 중 예외: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "       $($_.ScriptStackTrace)" -ForegroundColor Red
  } finally {
    # Test-CanWrite/F6 검증이 실제로 폴더를 만든다(설치와 동일한 실제 쓰기 시험이어야
    # 의미가 있으므로) — TEMP 밑 샌드박스이니 SelfTest 종료 시 치운다.
    if ($sandboxInstallPath -and (Test-Path $sandboxInstallPath)) {
      Remove-Item -Path $sandboxInstallPath -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  try {
    $r = Find-AvailablePort -Candidates @(7070, 7071, 7080, 8070, 8080, 9070)
    ST-Assert 'Find-AvailablePort 가 결과를 돌려준다' ($null -ne $r)
    if ($null -ne $r) { ST-Assert 'Find-AvailablePort 결과에 tried 배열이 있다' ($null -ne $r.tried) }
  } catch {
    $fail++
    Write-Host "  FAIL 포트 탐색 중 예외: $($_.Exception.Message)" -ForegroundColor Red
  }

  try {
    $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Parse('127.0.0.1'), 0)
    $listener.Start()
    $occupiedPort = $listener.LocalEndpoint.Port
    $r1 = Test-PortFree -Port $occupiedPort
    ST-Assert "점유된 포트($occupiedPort) 는 free:false" ($null -ne $r1 -and $r1.free -eq $false)
    $listener.Stop()
    Start-Sleep -Milliseconds 200
    $r2 = Test-PortFree -Port $occupiedPort
    ST-Assert "해제된 포트($occupiedPort) 는 free:true" ($null -ne $r2 -and $r2.free -eq $true)
  } catch {
    $fail++
    Write-Host "  FAIL 포트 점유/해제 검증 중 예외: $($_.Exception.Message)" -ForegroundColor Red
  }

  try {
    $candidates = @(Get-JavaCandidates)
    ST-Assert 'Get-JavaCandidates 가 예외 없이 배열을 돌려준다(비어 있어도 됨)' ($true)
    # 주의: 존재하지 않는 home 을 넘겨도 시스템 PATH 에 java 가 있으면 config.js 의 기존
    # 해석 순서(설정값 → JAVA_HOME → PATH)에 따라 PATH 로 폴백해 성공을 돌려줄 수 있다
    # (이 리포 개발 머신이 그렇다). 그건 재사용 중인 기존 로직의 정상 동작이므로, 여기서는
    # "성공/실패 여부"가 아니라 "CLI 가 예외 없이 파싱 가능한 형태를 돌려주는지"만 검증한다.
    $bogus = Test-JavaHome -HomePath 'C:\this-path-does-not-exist-oracletuner-selftest'
    ST-Assert 'Test-JavaHome — 파싱 가능한 결과를 돌려준다(java/error 필드 존재)' (
      $null -ne $bogus -and ($bogus.PSObject.Properties.Name -contains 'java') -and ($bogus.PSObject.Properties.Name -contains 'error')
    )
  } catch {
    $fail++
    Write-Host "  FAIL Java 탐색 검증 중 예외: $($_.Exception.Message)" -ForegroundColor Red
  }

  Write-Host ''
  Write-Host "통과 $pass / 실패 $fail"
  Write-Host '(주의: SelfTest 는 폼 생성·컨트롤 배치·언어 전환 이벤트 발화·포트/Java 탐색' +
    ' 로직을 검증합니다. 실제 화면 렌더링(글자 잘림·깨짐 여부)은 캡처로 별도 확인이 필요합니다.)'
  if ($fail -gt 0) { exit 1 } else { exit 0 }
} else {
  $built = Build-Wizard
  [System.Windows.Forms.Application]::EnableVisualStyles()
  [void]$built.Form.ShowDialog()
}
