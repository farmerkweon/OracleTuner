<#
.SYNOPSIS
  OracleTuner 제거 스크립트. FIX-SPEC-slice-H Phase 3.

.DESCRIPTION
  설치 위저드(installer/wizard.ps1)가 설치 폴더 최상단(<설치폴더>\uninstall.ps1)에 복사해 둔다.
  앱 파일(<설치폴더>\app, runtime, version.json, OracleTuner.bat)과 바로가기만 지우고,
  **사용자 데이터(%LOCALAPPDATA%\OracleTuner — 접속정보·SQL 이력·설정)는 기본적으로 지우지
  않는다.** 지울지는 반드시 사용자에게 물어본다(총괄 지시 — "사용자 데이터는 지우지 말고 물어보라").

.PARAMETER SelfTest
  실제 삭제를 하지 않고, 임시 샌드박스 폴더에서 삭제 로직(어떤 경로를 지우는지 판단하는 부분)이
  예외 없이 동작하는지만 검증한다. MessageBox 를 띄우지 않는다(비대화형 세션 대응).
#>
param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

function Remove-InstallTree {
  param([string]$InstallDir)
  foreach ($item in @('app', 'runtime', 'version.json', 'OracleTuner.bat')) {
    $p = Join-Path $InstallDir $item
    if (Test-Path $p) { Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Remove-UserData {
  param([string]$DataRoot)
  if (Test-Path $DataRoot) { Remove-Item -Path $DataRoot -Recurse -Force -ErrorAction SilentlyContinue }
}

function Remove-AppShortcuts {
  $startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'OracleTuner.lnk'
  $desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'OracleTuner.lnk'
  foreach ($lnk in @($startMenu, $desktop)) {
    if (Test-Path $lnk) { Remove-Item -Path $lnk -Force -ErrorAction SilentlyContinue }
  }
}

if ($SelfTest) {
  Write-Host '== uninstall.ps1 SelfTest =='
  $pass = 0; $fail = 0
  function ST-Assert {
    param([string]$Name, [bool]$Cond)
    if ($Cond) { $script:pass++; Write-Host "  OK $Name" }
    else { $script:fail++; Write-Host "  FAIL $Name" }
  }

  $sandbox = Join-Path $env:TEMP ("ot-uninstall-selftest-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path (Join-Path $sandbox 'app') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $sandbox 'runtime') | Out-Null
  Set-Content -Path (Join-Path $sandbox 'version.json') -Value '{}'
  Set-Content -Path (Join-Path $sandbox 'OracleTuner.bat') -Value '@echo off'

  try {
    Remove-InstallTree -InstallDir $sandbox
    ST-Assert 'app 폴더가 제거된다' (-not (Test-Path (Join-Path $sandbox 'app')))
    ST-Assert 'runtime 폴더가 제거된다' (-not (Test-Path (Join-Path $sandbox 'runtime')))
    ST-Assert 'version.json 이 제거된다' (-not (Test-Path (Join-Path $sandbox 'version.json')))
  } catch {
    $fail++
    Write-Host "  FAIL Remove-InstallTree 중 예외: $($_.Exception.Message)"
  }

  $dataSandbox = Join-Path $env:TEMP ("ot-data-selftest-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path (Join-Path $dataSandbox 'config') | Out-Null
  Set-Content -Path (Join-Path $dataSandbox 'config\connections.json') -Value '{}'
  try {
    Remove-UserData -DataRoot $dataSandbox
    ST-Assert '데이터 루트가 제거된다(사용자가 동의했다고 가정한 경로만 시험)' (-not (Test-Path $dataSandbox))
  } catch {
    $fail++
    Write-Host "  FAIL Remove-UserData 중 예외: $($_.Exception.Message)"
  }

  Remove-Item -Path $sandbox -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $dataSandbox -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host ''
  Write-Host "통과 $pass / 실패 $fail"
  Write-Host '(주의: 실제 설치 폴더/바로가기 삭제, MessageBox 확인창은 이 SelfTest 로 검증하지 않았습니다.)'
  if ($fail -gt 0) { exit 1 } else { exit 0 }
}

# ── 실제 제거 ────────────────────────────────────────────────────────────

Add-Type -AssemblyName System.Windows.Forms

$InstallDir = $PSScriptRoot
$DataRoot = Join-Path $env:LOCALAPPDATA 'OracleTuner'

$confirm = [System.Windows.Forms.MessageBox]::Show(
  "OracleTuner 를 제거합니다.`r`n설치 폴더: $InstallDir`r`n계속하시겠습니까?",
  'OracleTuner 제거', 'YesNo', 'Question')
if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }

$dataConfirm = [System.Windows.Forms.MessageBox]::Show(
  "저장된 접속정보·SQL 이력·설정도 함께 삭제할까요?`r`n위치: $DataRoot`r`n`r`n" +
  "[예] 를 누르면 데이터까지 완전히 삭제됩니다(되돌릴 수 없음).`r`n" +
  "[아니오] 를 누르면 프로그램만 지우고 데이터는 남겨 둡니다(나중에 다시 설치하면 이어서 쓸 수 있음).",
  'OracleTuner 제거 — 사용자 데이터', 'YesNo', 'Warning')

Remove-AppShortcuts
Remove-InstallTree -InstallDir $InstallDir
if ($dataConfirm -eq [System.Windows.Forms.DialogResult]::Yes) {
  Remove-UserData -DataRoot $DataRoot
}

[System.Windows.Forms.MessageBox]::Show('OracleTuner 프로그램 파일 제거가 완료되었습니다.', 'OracleTuner 제거', 'OK', 'Information') | Out-Null

# 설치 폴더 자체(과 이 스크립트)는 지금 실행 중이라 바로 못 지운다.
# 프로세스가 끝난 뒤 뒤늦게 지우도록 예약한다(흔한 자기삭제 인스톨러 패턴).
$cmdLine = "/c ping 127.0.0.1 -n 3 >nul & rmdir /s /q `"$InstallDir`""
Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdLine -WindowStyle Hidden
