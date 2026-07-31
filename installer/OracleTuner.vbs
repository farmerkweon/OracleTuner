' OracleTuner 서버 직접 실행 (진단용 폴백).
'
' ⚠ beta.4 부터 **정상 실행 경로가 아니다.** 바로가기는 이제 OracleTuner.exe(트레이 런처)를
'   가리킨다. 이 파일은 트레이 앱이 뜨지 않는 환경(.NET Framework 가 꺼진 특수 VDI 이미지 등)에서
'   "서버만이라도 띄워 확인해 보는" 최후의 수단으로만 남겨 둔다.
'
' ★ 이 방식의 결함(2026-07-31 실사용 사고 — 이것이 트레이 런처를 만든 이유다):
'     ① 화면에 아무 표시가 없어 사용자가 앱이 떠 있는지 알 수 없다.
'     ② 끌 방법이 없다. 작업관리자에서 node.exe 를 찾아 죽이는 수밖에 없다.
'     ③ node 가 띄운 손자 프로세스(java 브리지)는 그래도 남는다.
'     ④ 그래서 제거/재설치 때 파일이 잠겨 삭제가 실패한다. 실제로 실패했다.
'   OracleTuner.exe 는 위 넷을 전부 해결한다. 진단이 끝나면 그쪽을 쓸 것.
'
' node.exe 는 콘솔 애플리케이션이라 바로 실행하면 검은 창이 뜬 채로 남는다.
' WScript.Shell.Run 의 세 번째 인자(창 스타일) 0 = 숨김으로 띄워 콘솔을 감춘다.
' 브라우저는 서버가 알아서 연다(server/config.js 의 server.openBrowser 기본값 true).
'   ★ 단, 이 SW_HIDE 는 자식에게 상속된다. 그래서 server/index.js 는 브라우저를
'     explorer.exe 로 연다(직접 start 를 쓰면 브라우저 창까지 숨겨진다).

Option Explicit

Dim sh, fso, appDir, nodeExe, entry, cmd
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appDir  = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe = fso.BuildPath(appDir, "runtime\node.exe")
entry   = fso.BuildPath(appDir, "server\index.js")

If Not fso.FileExists(nodeExe) Then
  MsgBox "Node 런타임을 찾을 수 없습니다:" & vbCrLf & nodeExe, vbCritical, "OracleTuner"
  WScript.Quit 1
End If
If Not fso.FileExists(entry) Then
  MsgBox "서버 파일을 찾을 수 없습니다:" & vbCrLf & entry, vbCritical, "OracleTuner"
  WScript.Quit 1
End If

sh.CurrentDirectory = appDir
cmd = """" & nodeExe & """ """ & entry & """"

' 0 = 창 숨김, False = 종료를 기다리지 않음(서버는 계속 떠 있어야 한다)
sh.Run cmd, 0, False
