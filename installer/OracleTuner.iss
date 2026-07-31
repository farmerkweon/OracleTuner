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
#define AppVersion     "1.0.0-beta.2"
#define AppPublisher   "foxnail.kr"
#define AppURL         "https://foxnail.kr"
#define AppLauncher    "OracleTuner.vbs"

; 스테이징 폴더 — build-installer.js 가 /DSrcDir 로 넘겨준다. 수동 빌드용 기본값.
#ifndef SrcDir
  #define SrcDir "..\dist\oracle-tuner-1.0.0-beta.1-installer-win-x64-no-jre"
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
; 실행 런처(콘솔 창을 숨기고 node 를 띄운다)
Source: "OracleTuner.vbs";          DestDir: "{app}";              Flags: ignoreversion
; 바로가기가 쓸 아이콘. 런처가 .vbs 라서 이 파일이 없으면 기본 스크립트 아이콘이 나온다.
Source: "OracleTuner.ico";          DestDir: "{app}";              Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}";       Filename: "{app}\{#AppLauncher}"; WorkingDir: "{app}"; IconFilename: "{app}\OracleTuner.ico"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppLauncher}"; WorkingDir: "{app}"; IconFilename: "{app}\OracleTuner.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppLauncher}"; Description: "{cm:LaunchProgram,{#AppName}}"; \
    Flags: nowait postinstall skipifsilent shellexec

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
