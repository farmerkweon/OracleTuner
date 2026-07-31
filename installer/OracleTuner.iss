; Oracle Tuner 설치 스크립트 (Inno Setup 6)
;
; 빌드:  node tools\build-installer.js   (스테이징 → ISCC 호출까지 자동)
; 수동:  "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer\OracleTuner.iss
;
; 선행: dist\oracle-tuner-<ver>-installer-win-x64-<tag>\ 스테이징이 있어야 한다.
;       (server, web, shared, java, node_modules, runtime, package.json, LICENSE)
;
; 관리자 권한을 요구하지 않는다(PrivilegesRequired=lowest).
;
; ★ 기본 설치 위치는 C:\APPS\Oracle Tuner 다. Program Files 가 아니다.
;   이유(2026-07-31 발주자 실사용 보고): Program Files 에 설치하면
;   **접속정보가 저장되지 않는 경우가 있었다.**
;
;   왜 그런가 — 설계상 데이터는 %LOCALAPPDATA%\OracleTuner 에 두므로 권한 문제가
;   없어야 맞다. 그러나 Program Files 에 넣으려면 설치 중 UAC 승격이 일어나고,
;   승격된 설치 세션에서는
;     ① 위저드가 쓰는 {localappdata} 가 **관리자 계정의** LOCALAPPDATA 로 잡히고
;     ② [Run] 의 postinstall 실행도 승격 상태를 물려받을 수 있어,
;        그 세션에서 저장한 접속정보가 **관리자 프로필**에 들어간다.
;   다음에 평소대로(비승격) 실행하면 그 데이터가 보이지 않는다. 증상이 정확히 이것이다.
;
;   C:\ 아래 새 폴더는 표준 사용자도 만들 수 있고(만든 사람이 소유자가 되어 쓰기 가능),
;   승격이 일어나지 않으므로 위 두 경로가 원천적으로 생기지 않는다.
;   사용자가 원하면 설치 화면에서 경로를 바꿀 수 있고, Program Files 를 고르면
;   그때만 UAC 승격을 선택할 수 있다(PrivilegesRequiredOverridesAllowed=dialog).

#define AppName        "Oracle Tuner"
#define AppVersion     "1.0.0-beta.4"
#define AppPublisher   "foxnail.kr"
#define AppURL         "https://foxnail.kr"

; ★ 런처가 .vbs 에서 트레이 앱(.exe)으로 바뀌었다 (beta.4).
;   이유(2026-07-31 발주자 실사용 보고): .vbs 는 node 를 창 숨김으로 띄우고 사라져서
;     ① 사용자가 앱이 떠 있는지 알 수 없고 ② 끌 방법이 없고
;     ③ 그래서 제거/재설치 때 node 가 파일을 잡아 삭제가 실패했다(실제 발생).
;   트레이 앱은 아이콘으로 상태를 보여주고, 시작/정지/종료 메뉴를 제공하며,
;   Job Object 로 손자(java) 프로세스까지 확실히 정리한다.
;   소스: installer\tray\OracleTunerTray.cs / 빌드: tools\build-tray.js
#define AppLauncher    "OracleTuner.exe"

; 스테이징 폴더 — build-installer.js 가 /DSrcDir 로 넘겨준다. 수동 빌드용 기본값.
#ifndef SrcDir
  #define SrcDir "..\dist\oracle-tuner-1.0.0-beta.4-installer-win-x64-no-jre"
#endif

; 결과 파일 이름에 붙는 꼬리표. Java 내장 빌드는 "-with-jre" 를 넘겨받아
; no-jre 설치판을 덮어쓰지 않게 한다(둘 다 같은 이름으로 나오던 문제).
#ifndef OutSuffix
  #define OutSuffix ""
#endif

[Setup]
AppId={{C4E2F19A-7B3D-4A86-9E51-2F8D6C0B4A73}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
VersionInfoVersion=1.0.0
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} — SQL 튜닝 워크벤치
VersionInfoCopyright=Copyright (C) 2026 foxnail.kr

; ★ {sd} = 시스템 드라이브(보통 C:). Program Files({autopf}) 로 되돌리지 말 것 —
;   위 머리말의 승격 문제가 그대로 재발한다.
DefaultDirName={sd}\APPS\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; MIT 원문(영문)을 그대로 보여준다 — 발주자 확정 사항(번역·병기 없음).
LicenseFile={#SrcDir}\LICENSE
UninstallDisplayName={#AppName}
; ★ 아이콘 — 없으면 바로가기가 .vbs 를 가리키므로 윈도우 기본 스크립트 아이콘(두루마리)이 나온다.
;   2026-07-31 발주자 지적("바탕화면 앱아이콘도 이상하게 생겼어")의 원인이 이것이었다.
;   web/icons/icon-512.png 에서 16·24·32·48·64·128·256 7종을 담아 만든 멀티사이즈 아이콘이다.
SetupIconFile=OracleTuner.ico
UninstallDisplayIcon={app}\OracleTuner.ico
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
OutputDir=Output
OutputBaseFilename=OracleTuner-{#AppVersion}{#OutSuffix}-Setup
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; 설치 시작과 동시에 언어 선택 대화상자를 띄운다(항목이 2개 이상이면 Inno 가 자동으로 띄운다).
ShowLanguageDialog=yes

[Languages]
Name: "korean";   MessagesFile: "compiler:Languages\Korean.isl"
Name: "english";  MessagesFile: "compiler:Default.isl"
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "chinese";  MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
korean.PortPageTitle=서버 포트
korean.PortPageSubtitle=Oracle Tuner 가 사용할 포트를 정합니다.
korean.PortPrompt=웹 화면을 여는 포트 번호 (1024~65535):
korean.PortInUse=포트 %1 은(는) 이미 사용 중입니다. 다른 번호를 입력하세요.
korean.PortInvalid=포트 번호는 1024~65535 사이의 숫자여야 합니다.
korean.DesktopIcon=바탕화면에 바로가기 만들기
english.PortPageTitle=Server port
english.PortPageSubtitle=Choose the port Oracle Tuner will listen on.
english.PortPrompt=Port number for the web UI (1024-65535):
english.PortInUse=Port %1 is already in use. Please enter a different number.
english.PortInvalid=The port number must be between 1024 and 65535.
english.DesktopIcon=Create a desktop shortcut
japanese.PortPageTitle=サーバーポート
japanese.PortPageSubtitle=Oracle Tuner が使用するポートを指定します。
japanese.PortPrompt=Web 画面を開くポート番号 (1024～65535):
japanese.PortInUse=ポート %1 は既に使用されています。別の番号を入力してください。
japanese.PortInvalid=ポート番号は 1024～65535 の数値である必要があります。
japanese.DesktopIcon=デスクトップにショートカットを作成する
chinese.PortPageTitle=服务器端口
chinese.PortPageSubtitle=指定 Oracle Tuner 使用的端口。
chinese.PortPrompt=打开网页界面的端口号 (1024-65535):
chinese.PortInUse=端口 %1 已被占用。请输入其他号码。
chinese.PortInvalid=端口号必须是 1024 到 65535 之间的数字。
chinese.DesktopIcon=创建桌面快捷方式

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; \
    GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; 앱 본체 — 패치 배포 시 이 부분만 교체된다(D-002-a).
Source: "{#SrcDir}\server\*";       DestDir: "{app}\server";       Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SrcDir}\web\*";          DestDir: "{app}\web";          Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SrcDir}\shared\*";       DestDir: "{app}\shared";       Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SrcDir}\java\*";         DestDir: "{app}\java";         Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SrcDir}\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SrcDir}\package.json";   DestDir: "{app}";              Flags: ignoreversion
Source: "{#SrcDir}\LICENSE";        DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
; 런타임 — 거의 바뀌지 않는다. 내장 JRE 는 with-jre 빌드에만 들어 있다.
Source: "{#SrcDir}\runtime\*";      DestDir: "{app}\runtime";      Flags: ignoreversion recursesubdirs createallsubdirs
; ★ 트레이 런처 — 바로가기가 가리키는 실제 실행 파일.
;   tools\build-tray.js 가 csc.exe 로 컴파일해 스테이징에 넣는다(그래서 {#SrcDir} 에서 가져온다).
Source: "{#SrcDir}\OracleTuner.exe"; DestDir: "{app}";             Flags: ignoreversion

; 기존 VBS 런처 — **남긴다.** 바로가기는 더 이상 이걸 가리키지 않는다.
;   왜 남기는가: 트레이 앱이 뜨지 않는 환경(.NET Framework 가 꺼져 있는 특수 VDI 이미지 등)에서
;   "서버만이라도 띄워 보는" 최후의 수단이 필요하다. 진단할 때 실제로 쓴다.
;   ⚠ 이걸로 띄우면 끄는 수단이 없다(오늘의 사고 경로). 정상 경로는 OracleTuner.exe 다.
Source: "OracleTuner.vbs";          DestDir: "{app}";              Flags: ignoreversion
; 트레이 아이콘이 읽는 아이콘 파일. exe 안에도 같은 아이콘이 박혀 있지만(/win32icon),
; 트레이는 작은 크기 아이콘을 파일에서 직접 고르는 편이 선명하다.
Source: "OracleTuner.ico";          DestDir: "{app}";              Flags: ignoreversion

[Icons]
; IconFilename 을 지정하지 않는다 — 아이콘이 exe 자체에 박혀 있어(/win32icon) 그대로 나온다.
; (런처가 .vbs 였을 때는 지정이 필수였다. 안 하면 윈도우 기본 '두루마리' 아이콘이 나왔다.)
Name: "{group}\{#AppName}";       Filename: "{app}\{#AppLauncher}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppLauncher}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; shellexec 를 뺐다 — 진짜 exe 이므로 Inno 가 직접 실행하면 된다.
; (.vbs 였을 때는 셸을 거쳐야 wscript 로 열렸다.)
Filename: "{app}\{#AppLauncher}"; Description: "{cm:LaunchProgram,{#AppName}}"; \
    Flags: nowait postinstall skipifsilent

[Code]
{ ── 포트 선택 페이지 ──────────────────────────────────────────────────────
  위저드에서 고른 포트를 %LOCALAPPDATA%\OracleTuner\config\settings.json 에 기록한다.
  데이터를 설치 폴더가 아니라 LOCALAPPDATA 에 두는 것이 이 설계의 핵심이다 —
  패치가 사용자 데이터를 건드리지 않는다.

  ⚠ 다만 localappdata 상수는 **설치를 실행한 계정** 기준이다. UAC 승격이 일어나면
    관리자 프로필로 잡혀 정작 앱을 쓰는 계정에서는 안 보인다(2026-07-31 실사용 사고).
    그래서 기본 설치 위치를 C:\APPS 로 옮겨 승격 자체가 안 생기게 했다. }

var
  PortPage: TInputQueryWizardPage;

{ ── 실행 중인 앱 정지 ──────────────────────────────────────────────────────
  ★ 2026-07-31 실사용 사고의 직접 대응이다.

  증상: 앱을 제거하려는데 node.exe 가 설치 폴더의 파일을 잡고 있어 삭제가 실패했다.
        사용자는 앱이 떠 있다는 사실조차 몰랐다(기존 .vbs 런처는 화면에 아무 표시가 없었다).

  대응은 3단계다. 앞 단계가 실패해도 다음 단계가 받아낸다.
    ① OracleTuner.exe --quit  — 트레이에 정상 종료를 요청한다.
       트레이가 node 를 정리하고(Job Object 로 손자 java 까지) 스스로 종료한다.
    ② taskkill /F /IM OracleTuner.exe — ①이 안 먹었을 때 트레이를 강제 종료한다.
       ⚠ 이것만으로도 node·java 가 함께 죽는다. 트레이가 죽으면 Job Object 핸들이 닫히고,
         JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE 때문에 커널이 job 안 프로세스를 전부 정리한다.
    ③ 설치 폴더 아래에서 도는 node/java 를 경로로 골라 종료한다.
       ①②로 잡히지 않는 경우가 하나 있다: 사용자가 (진단용으로 남겨둔) OracleTuner.vbs 나
       OracleTuner.bat 로 서버를 직접 띄운 경우다. 그때는 트레이가 없어 job 도 없다.
       ⚠ 이름만 보고 죽이지 않는다("node.exe 전부 종료"는 남의 개발 서버를 죽인다).
         반드시 **설치 폴더 아래 경로**인 것만 고른다.

  ③은 PowerShell 에 의존한다. PowerShell 이 막힌 환경에서는 조용히 실패하는데,
  그래도 ①②가 정상 경로를 이미 덮으므로 치명적이지 않다. 실패해도 설치/제거는 계속한다. }
{ 파일 잠금이 실제로 풀렸는지 확인한다.

  ★ 2026-07-31 실측으로 밝혀진 함정이다. 프로세스를 죽여도 그 실행 이미지 파일의 핸들은
    곧바로 풀리지 않는다(커널의 섹션 오브젝트가 남고, 백신 실시간 검사가 한 번 더 물기도 한다).
    그 상태에서 지우면 DeleteFile 은 **성공을 반환하지만** 파일은 '삭제 대기' 로 남아 있어
    디렉터리에서 아직 보인다. 그래서 이어지는 RemoveDirectory 가 "비어 있지 않음"으로 실패한다.
    결과: 파일은 다 사라졌는데 **빈 폴더만 남는다.** 첫 제거 시험에서 정확히 이 증상이 났다
    (C:\APPS\Oracle Tuner\runtime 만 빈 채로 남음).

  이름 바꾸기가 성공하면 잠금이 풀린 것이다(잠긴 실행 파일은 이름을 바꿀 수 없다).
  확인만 하고 원래 이름으로 되돌린다 — 지우는 일은 Inno 가 자기 목록대로 한다. }
function WaitFileUnlocked(FileName: string; TimeoutMs: Integer): Boolean;
var
  Tmp: string;
  Waited: Integer;
begin
  Result := True;
  if not FileExists(FileName) then
    exit;
  Tmp := FileName + '.unlocktest';
  Waited := 0;
  while Waited < TimeoutMs do
  begin
    if RenameFile(FileName, Tmp) then
    begin
      RenameFile(Tmp, FileName);
      exit;
    end;
    Sleep(300);
    Waited := Waited + 300;
  end;
  Result := False;
end;

procedure StopRunningApp(AppPath: string);
var
  ResultCode: Integer;
  Exe, PsArgs: string;
begin
  Exe := AddBackslash(AppPath) + 'OracleTuner.exe';

  { ① 정상 종료 요청 — 트레이가 스스로 정리할 기회를 준다. }
  if FileExists(Exe) then
    Exec(Exe, '--quit', AppPath, SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { ② 강제 종료(트레이 이름은 우리 것이므로 이름으로 죽여도 안전하다). }
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM OracleTuner.exe', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { ③ 설치 폴더 아래에서 도는 node/java 잔재 정리(.vbs/.bat 로 띄운 경우). }
  PsArgs := '-NoProfile -ExecutionPolicy Bypass -Command "' +
            'Get-Process node,java -ErrorAction SilentlyContinue | ' +
            'Where-Object { $_.Path -ne $null -and $_.Path -like ''' + AddBackslash(AppPath) + '*'' } | ' +
            'Stop-Process -Force -ErrorAction SilentlyContinue"';
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), PsArgs, '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { ★ 핵심 — 그냥 Sleep 으로 때우지 않는다. 실행 이미지가 정말 풀렸는지 확인될 때까지 기다린다.
    처음에는 Sleep(1500) 만 뒀는데, 그것으로는 부족해 빈 runtime 폴더가 남았다(위 주석 참조).
    node.exe 와 트레이 exe 둘 다 확인한다. 시간이 다 되면 그냥 진행한다 —
    여기서 제거를 중단시키면 사용자는 지울 방법이 아예 없어진다. 남은 것은 아래
    UninstallDelete 섹션의 filesandordirs 가 한 번 더 받아낸다.
    ⚠ 주석 줄을 대괄호로 시작하지 말 것 — Inno 는 줄 첫 글자가 '[' 이면 Pascal 주석
      안이라도 섹션 태그로 읽어 "Invalid section tag" 로 컴파일이 깨진다(실제로 겪었다). }
  if not WaitFileUnlocked(AddBackslash(AppPath) + 'runtime\node.exe', 15000) then
    Log('WARN: runtime\node.exe 잠금이 15초 안에 풀리지 않았습니다.');
  if not WaitFileUnlocked(Exe, 10000) then
    Log('WARN: OracleTuner.exe 잠금이 10초 안에 풀리지 않았습니다.');
end;

{ 재설치(덮어쓰기) 대응 — 파일을 복사하기 직전에 실행 중인 것을 정지시킨다.
  이걸 안 하면 "사용 중인 파일" 오류가 나거나, 재부팅 후 교체로 미뤄져
  사용자는 새 버전을 설치했는데 옛 버전이 도는 상태를 만난다. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  NeedsRestart := False;
  StopRunningApp(ExpandConstant('{app}'));
  Result := '';
end;

{ 제거 대응 — ★ 오늘 실패했던 바로 그 시나리오다.
  파일을 지우기 전에 반드시 정지시킨다. }
function InitializeUninstall(): Boolean;
begin
  StopRunningApp(ExpandConstant('{app}'));
  Result := True;
end;

procedure InitializeWizard;
begin
  PortPage := CreateInputQueryPage(wpSelectTasks,
    ExpandConstant('{cm:PortPageTitle}'),
    ExpandConstant('{cm:PortPageSubtitle}'),
    '');
  PortPage.Add(ExpandConstant('{cm:PortPrompt}'), False);
  PortPage.Values[0] := '7070';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  P: Integer;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    P := StrToIntDef(Trim(PortPage.Values[0]), -1);
    if (P < 1024) or (P > 65535) then
    begin
      MsgBox(ExpandConstant('{cm:PortInvalid}'), mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ 선택한 포트와 언어를 앱 설정으로 남긴다. 앱은 server/config.js 의 기존
  스키마를 그대로 읽으므로 새 형식을 만들지 않는다. }
procedure WriteSettings;
var
  DataDir, CfgDir, Json, Loc: string;
begin
  DataDir := ExpandConstant('{localappdata}\OracleTuner');
  CfgDir  := DataDir + '\config';
  ForceDirectories(CfgDir);
  ForceDirectories(DataDir + '\data');
  ForceDirectories(DataDir + '\logs');

  case ActiveLanguage of
    'korean':   Loc := 'ko';
    'japanese': Loc := 'ja';
    'chinese':  Loc := 'zh';
  else
    Loc := 'en';
  end;

  Json :=
    '{' + #13#10 +
    '  "server": { "port": ' + Trim(PortPage.Values[0]) + ', "host": "127.0.0.1", "openBrowser": true },' + #13#10 +
    '  "ui": { "locale": "' + Loc + '" }' + #13#10 +
    '}' + #13#10;
  SaveStringToFile(CfgDir + '\settings.json', Json, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteSettings;
end;

[UninstallDelete]
; 사용자 데이터(%LOCALAPPDATA%\OracleTuner)는 지우지 않는다.
; 접속정보·튜닝이력·SQLite DB 가 들어 있어 지우면 되돌릴 수 없다.
; 재설치하면 그대로 이어서 쓸 수 있다.
Type: files; Name: "{app}\version.json"

; ★ 설치 폴더 자체를 통째로 정리한다(보험).
;   왜 필요한가: Inno 는 자기가 설치한 파일만 지우고, 디렉터리는 **비어 있을 때만** 지운다.
;   위 WaitFileUnlocked 로 잠금 문제는 막았지만, 그것만으로 부족한 경우가 남는다:
;     · 앱이 실행 중에 만든 파일(로그·캐시 등)이 설치 폴더에 있으면 폴더가 안 지워진다
;     · 백신이 파일을 격리/복원하는 중이면 타이밍이 어긋난다
;   발주자 합격 기준이 "폴더가 남지 않음" 이므로 확실한 쪽을 택한다.
;   ⚠ 사용자 데이터는 여기 없다({localappdata}\OracleTuner 에 있다). 그래서 안전하다.
Type: filesandordirs; Name: "{app}"
