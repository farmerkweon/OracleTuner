' OracleTuner 실행 런처.
'
' node.exe 는 콘솔 애플리케이션이라 바로 실행하면 검은 창이 뜬 채로 남는다.
' WScript.Shell.Run 의 세 번째 인자(창 스타일) 0 = 숨김으로 띄워 콘솔을 감춘다.
' 브라우저는 서버가 알아서 연다(server/config.js 의 server.openBrowser 기본값 true).
'
' 바로가기(시작 메뉴·바탕화면)가 이 파일을 가리킨다.

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
