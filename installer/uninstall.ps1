<#
.SYNOPSIS
  OracleTuner 제거 스크립트. 설치 위저드 v2(SPEC-installer-v2.md)와 짝을 이룬다.

.DESCRIPTION
  설치 위저드(installer/wizard.ps1)가 설치 폴더 최상단(<설치폴더>\uninstall.ps1)에
  lang.ps1 과 함께 복사해 둔다(Install-AppFiles — SPEC 의 설치 레이아웃: <설치폴더>\
  uninstall.ps1, lang.ps1). 앱 파일(<설치폴더>\app, runtime, version.json,
  OracleTuner.bat, lang.ps1)과 바로가기만 지우고, **사용자 데이터(%LOCALAPPDATA%\
  OracleTuner — 접속정보·SQL 이력·설정)는 기본적으로 지우지 않는다.** 지울지는 반드시
  사용자에게 물어본다(총괄 지시 — "사용자 데이터는 지우지 말고 물어보라").

  설치 시 고른 언어를 <설치폴더>\version.json 의 `language` 필드에서 읽어 그 언어로
  메시지를 표시한다(SPEC-installer-v2.md). 필드가 없거나 못 읽으면 OS 기본 언어로
  폴백한다(lang.ps1 의 Get-DefaultLanguage).

.PARAMETER SelfTest
  실제 삭제를 하지 않고, 임시 샌드박스 폴더에서 삭제 로직(어떤 경로를 지우는지 판단하는
  부분)과 언어 판정 로직이 예외 없이 동작하는지만 검증한다. MessageBox 를 띄우지
  않는다(비대화형 세션 대응).
#>
param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

# lang.ps1 은 이 스크립트와 같은 폴더에 있다 — 설치 위저드가 그렇게 복사한다(위
# .DESCRIPTION 참조). 개발 중(리포에서 installer\uninstall.ps1 을 직접 실행)에도
# installer\lang.ps1 이 같은 폴더에 있으므로 경로가 동일하게 성립한다.
. (Join-Path $PSScriptRoot 'lang.ps1')

<#
.SYNOPSIS
  설치 시 고른 언어를 version.json 에서 읽는다. 필드가 없거나 못 읽으면(파일 손상 등)
  OS 기본 언어로 폴백한다 — 예외를 던지지 않는다(제거 스크립트가 언어 판정 실패로
  멈추면 안 되므로).
#>
function Get-InstallLanguage {
  param([string]$InstallDir)
  $versionPath = Join-Path $InstallDir 'version.json'
  if (Test-Path $versionPath) {
    try {
      $v = Get-Content $versionPath -Raw | ConvertFrom-Json
      if ($v.language -and (@('ko', 'en', 'ja', 'zh') -contains $v.language)) { return $v.language }
    } catch { }
  }
  return Get-DefaultLanguage
}

function Remove-InstallTree {
  param([string]$InstallDir)
  foreach ($item in @('app', 'runtime', 'version.json', 'OracleTuner.bat', 'lang.ps1')) {
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

<#
.SYNOPSIS
  이 폴더를 통째로 재귀 삭제해도 되는지 판정한다(SEC-REVIEW-installer.md F1 — "검증 없이
  설치 폴더 트리를 통째로 재귀 삭제". 원격 공격이 필요 없다 — 설치 경로에 드라이브 루트나
  시스템 폴더를 직접 타이핑하기만 해도(위저드 쪽 F2 로 이제 막혀 있지만, 이 스크립트는
  그 가드와 무관하게 독립적으로도 안전해야 한다) 그 폴더 전체가 날아간다.

.OUTPUTS
  [bool] 드라이브 루트/시스템·사용자 최상위 폴더가 아니고, version.json 이 있어(우리
  설치본이라는 증거) 삭제해도 안전하면 $true.
#>
function Test-SafeToRemove {
  param([string]$Dir)
  if ([string]::IsNullOrWhiteSpace($Dir)) { return $false }
  try { $full = [IO.Path]::GetFullPath($Dir).TrimEnd('\') } catch { return $false }

  # 1) 드라이브 루트 거부 (예: "C:")
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
  Set-Content -Path (Join-Path $sandbox 'version.json') -Value '{"language":"ja"}'
  Set-Content -Path (Join-Path $sandbox 'OracleTuner.bat') -Value '@echo off'
  Set-Content -Path (Join-Path $sandbox 'lang.ps1') -Value '# stub'

  try {
    Remove-InstallTree -InstallDir $sandbox
    ST-Assert 'app 폴더가 제거된다' (-not (Test-Path (Join-Path $sandbox 'app')))
    ST-Assert 'runtime 폴더가 제거된다' (-not (Test-Path (Join-Path $sandbox 'runtime')))
    ST-Assert 'version.json 이 제거된다' (-not (Test-Path (Join-Path $sandbox 'version.json')))
    ST-Assert 'lang.ps1 이 제거된다' (-not (Test-Path (Join-Path $sandbox 'lang.ps1')))
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

  # ── 언어 판정 (SPEC-installer-v2.md — version.json 의 language 필드) ──
  try {
    $langSandbox = Join-Path $env:TEMP ("ot-lang-selftest-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $langSandbox | Out-Null

    Set-Content -Path (Join-Path $langSandbox 'version.json') -Value '{"language":"zh"}'
    $lang1 = Get-InstallLanguage -InstallDir $langSandbox
    ST-Assert "version.json 의 language:zh 를 읽는다 (실제: $lang1)" ($lang1 -eq 'zh')

    Set-Content -Path (Join-Path $langSandbox 'version.json') -Value '{}'
    $lang2 = Get-InstallLanguage -InstallDir $langSandbox
    ST-Assert "language 필드가 없으면 OS 기본 언어로 폴백한다 (실제: $lang2)" (@('ko', 'en', 'ja', 'zh') -contains $lang2)

    Set-Content -Path (Join-Path $langSandbox 'version.json') -Value 'not-json-{{{'
    $lang3 = Get-InstallLanguage -InstallDir $langSandbox
    ST-Assert "version.json 파싱 실패해도 예외 없이 폴백한다 (실제: $lang3)" (@('ko', 'en', 'ja', 'zh') -contains $lang3)

    Remove-Item -Path $langSandbox -Recurse -Force -ErrorAction SilentlyContinue

    $missingSandbox = Join-Path $env:TEMP ("ot-lang-missing-" + [Guid]::NewGuid().ToString('N'))
    $lang4 = Get-InstallLanguage -InstallDir $missingSandbox
    ST-Assert "version.json 자체가 없어도 예외 없이 폴백한다 (실제: $lang4)" (@('ko', 'en', 'ja', 'zh') -contains $lang4)
  } catch {
    $fail++
    Write-Host "  FAIL 언어 판정 중 예외: $($_.Exception.Message)"
  }

  # ── 삭제 가드 (SEC-REVIEW-installer.md F1) ──
  try {
    $safeSandbox = Join-Path $env:TEMP ("ot-safe-selftest-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $safeSandbox | Out-Null
    Set-Content -Path (Join-Path $safeSandbox 'version.json') -Value '{}'
    ST-Assert 'Test-SafeToRemove — version.json 있는 정상 설치 폴더는 허용' (Test-SafeToRemove -Dir $safeSandbox)
    Remove-Item -Path $safeSandbox -Recurse -Force -ErrorAction SilentlyContinue

    $noEvidenceSandbox = Join-Path $env:TEMP ("ot-noevidence-selftest-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $noEvidenceSandbox | Out-Null
    ST-Assert 'Test-SafeToRemove — version.json 없는 폴더는 거부(우리 설치본이라는 증거 없음)' (-not (Test-SafeToRemove -Dir $noEvidenceSandbox))
    Remove-Item -Path $noEvidenceSandbox -Recurse -Force -ErrorAction SilentlyContinue

    ST-Assert 'Test-SafeToRemove — 드라이브 루트(C:\) 거부' (-not (Test-SafeToRemove -Dir 'C:\'))
    ST-Assert 'Test-SafeToRemove — %TEMP% 자체는 거부(알려진 시스템 폴더)' (-not (Test-SafeToRemove -Dir $env:TEMP))
    ST-Assert 'Test-SafeToRemove — %USERPROFILE% 자체는 거부' (-not (Test-SafeToRemove -Dir $env:USERPROFILE))
    ST-Assert 'Test-SafeToRemove — 빈 값 거부' (-not (Test-SafeToRemove -Dir ''))
  } catch {
    $fail++
    Write-Host "  FAIL 삭제 가드 검증 중 예외: $($_.Exception.Message)"
  }

  # ── 4로케일 문자열 완전성(lang.ps1 공용 검사 — wizard.ps1 과 동일 테이블을 공유하므로
  #    여기서도 확인해 둔다) ──
  try {
    $completeness = Test-StringTableCompleteness
    foreach ($lang in @('ko', 'en', 'ja', 'zh')) {
      ST-Assert "$lang 로케일 누락 키 없음" ($completeness[$lang].Missing.Count -eq 0)
    }
  } catch {
    $fail++
    Write-Host "  FAIL 문자열 테이블 완전성 검사 중 예외: $($_.Exception.Message)"
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
$Lang = Get-InstallLanguage -InstallDir $InstallDir

# SEC-REVIEW-installer.md F1 — 자기 삭제 명령이 이 폴더를 지워도 되는지 판정한 결과를
# 미리 계산해 둔다. Remove-InstallTree 가 실행되고 나면 version.json 이 이미 지워지므로,
# "우리 설치본이 맞는지"의 증거는 삭제 이전 시점에서만 확인할 수 있다 — 나중에 다시
# 확인하면 항상 거짓이 되어 스스로 모순에 빠진다.
$safeToRemove = Test-SafeToRemove -Dir $InstallDir
if (-not $safeToRemove) {
  [System.Windows.Forms.MessageBox]::Show(
    (Get-Str $Lang 'uninstall.notInstalledBody'),
    (Get-Str $Lang 'uninstall.notInstalledTitle'), 'OK', 'Warning') | Out-Null
  exit 1
}

$confirm = [System.Windows.Forms.MessageBox]::Show(
  ((Get-Str $Lang 'uninstall.confirmBody') -f $InstallDir),
  (Get-Str $Lang 'uninstall.confirmTitle'), 'YesNo', 'Question')
if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }

$dataConfirm = [System.Windows.Forms.MessageBox]::Show(
  ((Get-Str $Lang 'uninstall.dataConfirmBody') -f $DataRoot),
  (Get-Str $Lang 'uninstall.dataConfirmTitle'), 'YesNo', 'Warning')

Remove-AppShortcuts
Remove-InstallTree -InstallDir $InstallDir
if ($dataConfirm -eq [System.Windows.Forms.DialogResult]::Yes) {
  Remove-UserData -DataRoot $DataRoot
}

[System.Windows.Forms.MessageBox]::Show(
  (Get-Str $Lang 'uninstall.doneBody'),
  (Get-Str $Lang 'uninstall.confirmTitle'), 'OK', 'Information') | Out-Null

# 설치 폴더 자체(과 이 스크립트)는 지금 실행 중이라 바로 못 지운다.
# 프로세스가 끝난 뒤 뒤늦게 지우도록 예약한다(흔한 자기삭제 인스톨러 패턴). 위에서 이미
# $safeToRemove 로 검증했을 때만 이 지점에 도달한다. cmd.exe 는 절대 경로로 고정한다
# (SEC-REVIEW F5 와 같은 이유 — cwd 하이재킹 방지).
$cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
$cmdLine = "/c ping 127.0.0.1 -n 3 >nul & rmdir /s /q `"$InstallDir`""
Start-Process -FilePath $cmdExe -ArgumentList $cmdLine -WindowStyle Hidden
