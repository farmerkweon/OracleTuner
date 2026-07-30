<#
.SYNOPSIS
  OracleTuner 설치 위저드 (WinForms). FIX-SPEC-slice-H Phase 3.

.DESCRIPTION
  NSIS·Inno Setup 이 이 머신에 없어(폐쇄망이라 새로 받을 수도 없음) PowerShell +
  System.Windows.Forms 로 만든 5단계 위저드다(D-002 결정). 배포는 이 스크립트를
  IExpress 자가압축 EXE 안에 담아 낸다(tools/build-installer.js, Phase 4).

  단계: 1) 환영/라이선스  2) 설치 경로  3) Java 선택  4) 포트 지정  5) 요약/설치

  설치 레이아웃(D-002-a — 패치 설치파일 전제, 반드시 이대로):
    <설치폴더>\app\        server, web, shared, java\out, package.json  (패치가 교체하는 부분)
    <설치폴더>\runtime\    node.exe (+선택적 jre\)                      (거의 불변)
    <설치폴더>\version.json
    %LOCALAPPDATA%\OracleTuner\  config, data, logs, oracletuner.db     (패치 불가침 — 사용자 데이터)

  포트 탐색은 server/port-utils.js 를, JDK 탐색은 server/config.js 의 기존 로직(CLI 래퍼)을
  그대로 재사용한다 — 위저드가 직접 재구현하지 않는다(총괄 지시).

.PARAMETER SelfTest
  GUI 창을 띄우지 않고 폼 생성·컨트롤 배치·포트 탐색 로직이 예외 없이 동작하는지 콘솔에서
  검증한다. 이 스크립트가 비대화형 세션에서 실행되면(예: CI, 에이전트 검증) ShowDialog() 가
  입력을 기다리며 멈추기 때문에 별도 경로로 뺐다. ⚠ 이 모드는 폼/로직만 검증하며, 사람이
  버튼을 실제로 눌러보는 조작 자체는 검증하지 않는다.

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

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
} catch {
  Write-Error "WinForms 로드 실패 — 이 환경에서는 GUI 위저드를 쓸 수 없습니다: $($_.Exception.Message)"
  exit 1
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
  $portUtils = Join-Path $SourceRoot 'server\port-utils.js'
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

# ── 설치 동작(실제 파일 복사·설정 기록·바로가기) — 5단계 "설치" 버튼에서만 실행 ────

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

  # 제거 스크립트도 설치 폴더 최상단에 둔다(사용자가 직접 실행하기 쉽게)
  $uninstSrc = Join-Path $PSScriptRoot 'uninstall.ps1'
  if (Test-Path $uninstSrc) {
    Copy-Item -Path $uninstSrc -Destination (Join-Path $InstallPath 'uninstall.ps1') -Force
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

# ── 위저드 폼 구성 ───────────────────────────────────────────────────────────

function Build-Wizard {
  $state = @{
    InstallPath = Join-Path $env:LOCALAPPDATA 'Programs\OracleTuner'
    LicenseAccepted = $false
    JavaMode = 'system'
    JavaHome = ''
    Port = 7070
    CreateStartMenuShortcut = $true
    CreateDesktopShortcut = $false
    Installed = $false
  }

  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'OracleTuner 설치'
  $form.Size = New-Object System.Drawing.Size(620, 480)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.Font = New-Object System.Drawing.Font('맑은 고딕', 9)

  $titleLabel = New-Object System.Windows.Forms.Label
  $titleLabel.Text = 'OracleTuner 설치 위저드'
  $titleLabel.Font = New-Object System.Drawing.Font('맑은 고딕', 13, [System.Drawing.FontStyle]::Bold)
  $titleLabel.Location = New-Object System.Drawing.Point(20, 15)
  $titleLabel.Size = New-Object System.Drawing.Size(560, 30)
  $form.Controls.Add($titleLabel)

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
  $btnCancel.Text = '취소'
  $btnCancel.Location = New-Object System.Drawing.Point(0, 5)
  $btnCancel.Size = New-Object System.Drawing.Size(90, 28)
  $btnCancel.Add_Click({ $form.Close() })
  $navPanel.Controls.Add($btnCancel)

  $btnBack = New-Object System.Windows.Forms.Button
  $btnBack.Text = '< 이전'
  $btnBack.Location = New-Object System.Drawing.Point(365, 5)
  $btnBack.Size = New-Object System.Drawing.Size(90, 28)
  $navPanel.Controls.Add($btnBack)

  $btnNext = New-Object System.Windows.Forms.Button
  $btnNext.Text = '다음 >'
  $btnNext.Location = New-Object System.Drawing.Point(465, 5)
  $btnNext.Size = New-Object System.Drawing.Size(100, 28)
  $navPanel.Controls.Add($btnNext)

  # ── STEP 1: 환영 + 라이선스 ────────────────────────────────────────────
  $panel1 = New-Object System.Windows.Forms.Panel
  $panel1.Size = $bodyPanel.Size
  $panel1.Location = New-Object System.Drawing.Point(0, 0)

  $introLabel = New-Object System.Windows.Forms.Label
  $introLabel.Text = 'Oracle SQL 튜닝 워크벤치를 설치합니다. 계속하려면 아래 라이선스(MIT)에 동의하세요.'
  $introLabel.Location = New-Object System.Drawing.Point(0, 0)
  $introLabel.Size = New-Object System.Drawing.Size(560, 40)
  $panel1.Controls.Add($introLabel)

  $licenseBox = New-Object System.Windows.Forms.TextBox
  $licenseBox.Multiline = $true
  $licenseBox.ReadOnly = $true
  $licenseBox.ScrollBars = 'Vertical'
  $licenseBox.Font = New-Object System.Drawing.Font('Consolas', 9)
  $licenseBox.Location = New-Object System.Drawing.Point(0, 45)
  $licenseBox.Size = New-Object System.Drawing.Size(560, 220)
  $licensePath = Join-Path $SourceRoot 'LICENSE'
  if (Test-Path $licensePath) {
    $licenseBox.Text = Get-Content $licensePath -Raw
  } else {
    $licenseBox.Text = "LICENSE 파일을 찾지 못했습니다 ($licensePath). MIT 라이선스로 배포됩니다."
  }
  $panel1.Controls.Add($licenseBox)

  $chkAccept = New-Object System.Windows.Forms.CheckBox
  $chkAccept.Text = '라이선스 조건에 동의합니다.'
  $chkAccept.Location = New-Object System.Drawing.Point(0, 275)
  $chkAccept.Size = New-Object System.Drawing.Size(400, 24)
  $chkAccept.Add_CheckedChanged({ $state.LicenseAccepted = $chkAccept.Checked })
  $panel1.Controls.Add($chkAccept)

  # ── STEP 2: 설치 경로 ──────────────────────────────────────────────────
  $panel2 = New-Object System.Windows.Forms.Panel
  $panel2.Size = $bodyPanel.Size
  $panel2.Location = New-Object System.Drawing.Point(0, 0)

  $pathLabel = New-Object System.Windows.Forms.Label
  $pathLabel.Text = '설치 경로를 선택하세요.'
  $pathLabel.Location = New-Object System.Drawing.Point(0, 0)
  $pathLabel.Size = New-Object System.Drawing.Size(560, 20)
  $panel2.Controls.Add($pathLabel)

  $pathBox = New-Object System.Windows.Forms.TextBox
  $pathBox.Location = New-Object System.Drawing.Point(0, 25)
  $pathBox.Size = New-Object System.Drawing.Size(440, 24)
  $pathBox.Text = $state.InstallPath
  $panel2.Controls.Add($pathBox)

  $btnBrowsePath = New-Object System.Windows.Forms.Button
  $btnBrowsePath.Text = '찾아보기...'
  $btnBrowsePath.Location = New-Object System.Drawing.Point(450, 24)
  $btnBrowsePath.Size = New-Object System.Drawing.Size(110, 26)
  $panel2.Controls.Add($btnBrowsePath)

  $pathWarnLabel = New-Object System.Windows.Forms.Label
  $pathWarnLabel.Location = New-Object System.Drawing.Point(0, 60)
  $pathWarnLabel.Size = New-Object System.Drawing.Size(560, 80)
  $pathWarnLabel.ForeColor = [System.Drawing.Color]::DarkOrange
  $pathWarnLabel.Visible = $false
  $panel2.Controls.Add($pathWarnLabel)

  $updatePathWarning = {
    $state.InstallPath = $pathBox.Text
    if (Test-IsUnderProgramFiles -Path $pathBox.Text) {
      $pathWarnLabel.Text = "⚠ Program Files 아래는 관리자 권한이 있어야 설치할 수 있습니다.`r`n" +
        "접속정보·SQL 이력 등 데이터는 이 폴더가 아니라 항상 %LOCALAPPDATA%\OracleTuner 에 저장되므로, " +
        "이 폴더의 쓰기 권한과 무관하게 안전합니다."
      $pathWarnLabel.Visible = $true
    } else {
      $pathWarnLabel.Visible = $false
    }
  }
  $pathBox.Add_TextChanged($updatePathWarning)
  $btnBrowsePath.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = '설치할 폴더를 선택하세요'
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $pathBox.Text = Join-Path $dlg.SelectedPath 'OracleTuner'
    }
  })

  # ── STEP 3: Java 선택 ──────────────────────────────────────────────────
  $panel3 = New-Object System.Windows.Forms.Panel
  $panel3.Size = $bodyPanel.Size
  $panel3.Location = New-Object System.Drawing.Point(0, 0)

  $javaLabel = New-Object System.Windows.Forms.Label
  $javaLabel.Text = 'Java 실행 방식을 선택하세요. (JDK 를 새로 구현하지 않고 기존 탐색 로직을 재사용합니다)'
  $javaLabel.Location = New-Object System.Drawing.Point(0, 0)
  $javaLabel.Size = New-Object System.Drawing.Size(560, 20)
  $panel3.Controls.Add($javaLabel)

  $radioSystemJava = New-Object System.Windows.Forms.RadioButton
  $radioSystemJava.Text = '시스템 JDK/JRE 사용'
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
  $btnDiscoverJava.Text = '탐색'
  $btnDiscoverJava.Location = New-Object System.Drawing.Point(410, 57)
  $btnDiscoverJava.Size = New-Object System.Drawing.Size(70, 26)
  $panel3.Controls.Add($btnDiscoverJava)

  $btnBrowseJava = New-Object System.Windows.Forms.Button
  $btnBrowseJava.Text = '찾아보기'
  $btnBrowseJava.Location = New-Object System.Drawing.Point(485, 57)
  $btnBrowseJava.Size = New-Object System.Drawing.Size(75, 26)
  $panel3.Controls.Add($btnBrowseJava)

  $btnVerifyJava = New-Object System.Windows.Forms.Button
  $btnVerifyJava.Text = '검증(java -version 실행)'
  $btnVerifyJava.Location = New-Object System.Drawing.Point(20, 90)
  $btnVerifyJava.Size = New-Object System.Drawing.Size(200, 26)
  $panel3.Controls.Add($btnVerifyJava)

  $javaResultLabel = New-Object System.Windows.Forms.Label
  $javaResultLabel.Location = New-Object System.Drawing.Point(20, 122)
  $javaResultLabel.Size = New-Object System.Drawing.Size(540, 50)
  $panel3.Controls.Add($javaResultLabel)

  $radioBundledJava = New-Object System.Windows.Forms.RadioButton
  $radioBundledJava.Text = '내장 JRE 사용 (이 배포판에 포함된 경우만 선택 가능)'
  $radioBundledJava.Location = New-Object System.Drawing.Point(0, 180)
  $radioBundledJava.Size = New-Object System.Drawing.Size(420, 24)
  $bundledJreExists = Test-Path (Join-Path $SourceRoot 'runtime\jre\bin\java.exe')
  $radioBundledJava.Enabled = $bundledJreExists
  $panel3.Controls.Add($radioBundledJava)

  $javaCandidates = @(Get-JavaCandidates)
  foreach ($c in $javaCandidates) { [void]$javaCombo.Items.Add($c.home) }
  if ($javaCombo.Items.Count -gt 0) { $javaCombo.SelectedIndex = 0 }

  $btnDiscoverJava.Add_Click({
    $javaCombo.Items.Clear()
    $found = @(Get-JavaCandidates)
    foreach ($c in $found) { [void]$javaCombo.Items.Add($c.home) }
    if ($javaCombo.Items.Count -gt 0) { $javaCombo.SelectedIndex = 0 }
    else { $javaResultLabel.ForeColor = [System.Drawing.Color]::DarkOrange; $javaResultLabel.Text = 'JDK/JRE 를 찾지 못했습니다. 찾아보기로 직접 지정하세요.' }
  })
  $btnBrowseJava.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'JDK 또는 JRE 홈 디렉터리를 선택하세요 (bin\java.exe 가 있는 폴더의 상위)'
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $javaCombo.Text = $dlg.SelectedPath
    }
  })
  $btnVerifyJava.Add_Click({
    $home = $javaCombo.Text
    $r = Test-JavaHome -HomePath $home
    if ($null -eq $r) {
      $javaResultLabel.ForeColor = [System.Drawing.Color]::Red
      $javaResultLabel.Text = 'node 를 실행할 수 없어 검증하지 못했습니다.'
    } elseif ($r.java) {
      $javaResultLabel.ForeColor = [System.Drawing.Color]::Green
      $javaResultLabel.Text = "확인됨: $($r.version)`r`n$($r.java)"
      $state.JavaHome = $home
    } else {
      $javaResultLabel.ForeColor = [System.Drawing.Color]::Red
      $javaResultLabel.Text = "실패: $($r.error)"
    }
  })

  # ── STEP 4: 포트 지정 ──────────────────────────────────────────────────
  $panel4 = New-Object System.Windows.Forms.Panel
  $panel4.Size = $bodyPanel.Size
  $panel4.Location = New-Object System.Drawing.Point(0, 0)

  $portLabel = New-Object System.Windows.Forms.Label
  $portLabel.Text = '서버가 사용할 포트를 지정하세요. (127.0.0.1 로만 검사합니다 — 방화벽 팝업 방지)'
  $portLabel.Location = New-Object System.Drawing.Point(0, 0)
  $portLabel.Size = New-Object System.Drawing.Size(560, 20)
  $panel4.Controls.Add($portLabel)

  $portBox = New-Object System.Windows.Forms.TextBox
  $portBox.Location = New-Object System.Drawing.Point(0, 30)
  $portBox.Size = New-Object System.Drawing.Size(100, 24)
  $portBox.Text = '7070'
  $panel4.Controls.Add($portBox)

  $btnFindPort = New-Object System.Windows.Forms.Button
  $btnFindPort.Text = '가용 포트 찾기'
  $btnFindPort.Location = New-Object System.Drawing.Point(115, 29)
  $btnFindPort.Size = New-Object System.Drawing.Size(120, 26)
  $panel4.Controls.Add($btnFindPort)

  $btnTestPort = New-Object System.Windows.Forms.Button
  $btnTestPort.Text = '테스트'
  $btnTestPort.Location = New-Object System.Drawing.Point(245, 29)
  $btnTestPort.Size = New-Object System.Drawing.Size(80, 26)
  $panel4.Controls.Add($btnTestPort)

  $portResultLabel = New-Object System.Windows.Forms.Label
  $portResultLabel.Location = New-Object System.Drawing.Point(0, 65)
  $portResultLabel.Size = New-Object System.Drawing.Size(540, 60)
  $panel4.Controls.Add($portResultLabel)

  $btnFindPort.Add_Click({
    $r = Find-AvailablePort
    if ($null -eq $r) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = 'node 를 실행할 수 없어 탐색하지 못했습니다.'
    } elseif ($r.port) {
      $portBox.Text = "$($r.port)"
      $portResultLabel.ForeColor = [System.Drawing.Color]::Green
      $portResultLabel.Text = "사용 가능한 포트를 찾았습니다: $($r.port)"
    } else {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = '후보 포트가 모두 사용 중입니다. 포트를 직접 입력하고 테스트하세요.'
    }
  })
  $btnTestPort.Add_Click({
    $p = 0
    if (-not [int]::TryParse($portBox.Text, [ref]$p) -or $p -le 0 -or $p -gt 65535) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = '1~65535 사이의 숫자를 입력하세요.'
      return
    }
    $r = Test-PortFree -Port $p
    if ($null -eq $r) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = 'node 를 실행할 수 없어 검사하지 못했습니다.'
    } elseif ($r.free) {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Green
      $portResultLabel.Text = "포트 $p 는 사용 가능합니다."
      $state.Port = $p
    } else {
      $portResultLabel.ForeColor = [System.Drawing.Color]::Red
      $portResultLabel.Text = "포트 $p 는 이미 사용 중입니다. 다른 포트를 시도하세요."
    }
  })

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
  $chkStartMenu.Text = '시작 메뉴 바로가기 만들기'
  $chkStartMenu.Checked = $true
  $chkStartMenu.Location = New-Object System.Drawing.Point(0, 200)
  $chkStartMenu.Size = New-Object System.Drawing.Size(300, 24)
  $panel5.Controls.Add($chkStartMenu)

  $chkDesktop = New-Object System.Windows.Forms.CheckBox
  $chkDesktop.Text = '바탕화면 바로가기 만들기'
  $chkDesktop.Checked = $false
  $chkDesktop.Location = New-Object System.Drawing.Point(0, 228)
  $chkDesktop.Size = New-Object System.Drawing.Size(300, 24)
  $panel5.Controls.Add($chkDesktop)

  $installResultLabel = New-Object System.Windows.Forms.Label
  $installResultLabel.Location = New-Object System.Drawing.Point(0, 260)
  $installResultLabel.Size = New-Object System.Drawing.Size(560, 60)
  $panel5.Controls.Add($installResultLabel)

  # ── 단계 전환 ──────────────────────────────────────────────────────────
  $panels = @($panel1, $panel2, $panel3, $panel4, $panel5)
  $stepTexts = @(
    '1/5 · 환영 및 라이선스',
    '2/5 · 설치 경로',
    '3/5 · Java 선택',
    '4/5 · 포트 지정',
    '5/5 · 요약 및 설치'
  )
  foreach ($p in $panels) { $bodyPanel.Controls.Add($p); $p.Visible = $false }
  $script:currentStep = 0

  $showStep = {
    param([int]$idx)
    foreach ($p in $panels) { $p.Visible = $false }
    $panels[$idx].Visible = $true
    $stepLabel.Text = $stepTexts[$idx]
    $btnBack.Enabled = ($idx -gt 0)
    if ($idx -eq 4) {
      $state.JavaMode = if ($radioBundledJava.Checked) { 'bundled' } else { 'system' }
      $summaryBox.Text = (
        "설치 경로: $($state.InstallPath)`r`n" +
        "Java 모드: $($state.JavaMode)$(if ($state.JavaMode -eq 'system') { ' (' + $state.JavaHome + ')' } else { '' })`r`n" +
        "포트: $($state.Port)`r`n`r`n" +
        "데이터 저장 위치: $(Join-Path $env:LOCALAPPDATA 'OracleTuner')`r`n" +
        "(설치 폴더가 아닌 이 위치에 접속정보·SQL 이력이 저장되므로, Program Files 에 설치해도 안전합니다)"
      )
      $btnNext.Text = '설치'
    } else {
      $btnNext.Text = '다음 >'
    }
    $script:currentStep = $idx
  }

  $btnBack.Add_Click({ & $showStep ($script:currentStep - 1) })
  $btnNext.Add_Click({
    if ($script:currentStep -eq 0) {
      if (-not $chkAccept.Checked) {
        [System.Windows.Forms.MessageBox]::Show('라이선스에 동의해야 계속할 수 있습니다.', 'OracleTuner', 'OK', 'Warning') | Out-Null
        return
      }
    } elseif ($script:currentStep -eq 1) {
      $state.InstallPath = $pathBox.Text
      if (-not $state.InstallPath) {
        [System.Windows.Forms.MessageBox]::Show('설치 경로를 입력하세요.', 'OracleTuner', 'OK', 'Warning') | Out-Null
        return
      }
    } elseif ($script:currentStep -eq 4) {
      # 마지막 단계 — 처음 누르면 "설치", 설치가 끝난 뒤 다시 누르면(버튼이 "닫기"로 바뀜) 창을 닫는다
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
        $installResultLabel.Text = "설치가 완료되었습니다: $($state.InstallPath)"
        $state.Installed = $true
        $btnNext.Text = '닫기'
      } catch {
        $installResultLabel.ForeColor = [System.Drawing.Color]::Red
        $installResultLabel.Text = "설치 중 오류: $($_.Exception.Message)"
      }
      return
    }
    if ($script:currentStep -lt 4) { & $showStep ($script:currentStep + 1) }
    else { $form.Close() }
  })

  & $showStep 0

  return @{
    Form = $form
    State = $state
    Panels = $panels
    Controls = @{
      ChkAccept = $chkAccept
      PathBox = $pathBox
      PathWarnLabel = $pathWarnLabel
      JavaCombo = $javaCombo
      RadioBundledJava = $radioBundledJava
      JavaResultLabel = $javaResultLabel
      PortBox = $portBox
      PortResultLabel = $portResultLabel
      SummaryBox = $summaryBox
      BtnNext = $btnNext
      BtnBack = $btnBack
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
    $built = Build-Wizard
    ST-Assert '폼 생성' ($null -ne $built.Form)
    ST-Assert '5단계 패널 생성' ($built.Panels.Count -eq 5)
    ST-Assert '라이선스 동의 체크박스 존재' ($null -ne $built.Controls.ChkAccept)
    ST-Assert '설치 경로 입력란 기본값 채워짐' ([string]::IsNullOrEmpty($built.Controls.PathBox.Text) -eq $false)
    ST-Assert 'Java 콤보박스 존재' ($null -ne $built.Controls.JavaCombo)
    ST-Assert '포트 입력란 기본값 7070' ($built.Controls.PortBox.Text -eq '7070')
    ST-Assert '요약 박스 존재' ($null -ne $built.Controls.SummaryBox)
    $built.Form.Dispose()
  } catch {
    $fail++
    Write-Host "  FAIL 폼 생성 중 예외: $($_.Exception.Message)" -ForegroundColor Red
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
  Write-Host '(주의: SelfTest 는 폼 생성·컨트롤 배치·포트/Java 탐색 로직만 검증합니다. 버튼을 실제로' +
    ' 눌러보는 GUI 수동 조작은 검증하지 않았습니다 — 발주자 확인 필요.)'
  if ($fail -gt 0) { exit 1 } else { exit 0 }
} else {
  $built = Build-Wizard
  [System.Windows.Forms.Application]::EnableVisualStyles()
  [void]$built.Form.ShowDialog()
}
