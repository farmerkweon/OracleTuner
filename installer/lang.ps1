<#
.SYNOPSIS
  설치 위저드(wizard.ps1) / 제거 스크립트(uninstall.ps1) 공용 다국어 문자열 테이블.

.DESCRIPTION
  앱 본체(web/js/i18n.js)와 별개로 둔다 — 위저드는 순수 PowerShell 이라 JS 파일을 직접
  읽을 수 없다. 4로케일(ko/en/ja/zh) 모두 값이 있어야 하며, 누락 시 Get-Str 이 en 으로
  폴백한다(그래도 wizard.ps1 -SelfTest 가 누락 자체를 잡아낸다 — 조용히 넘어가지 않는다).

  키 이름 규칙: '<영역>.<의미>' (예: step3.verify). 서식이 필요한 문자열은 {0} {1} ... 을
  넣어 두고 호출부에서 -f 연산자로 채운다.

  STEP 0(언어 선택)은 위저드 v2(SPEC-installer-v2.md, 총괄 확정 2026-07-31)에서 새로 신설된
  단계다. 라이선스 화면(STEP 1)은 영문 MIT 원문만 표시한다 — 번역·요약·병기는 전부 제거했다
  (license.summary / license.authoritativeNote 키는 더 이상 존재하지 않는다). 주변 UI 문구는
  계속 선택된 언어를 따른다.
#>

$Strings = @{
  ko = @{
    'lang.selectorLabel'                 = '언어:'
    'wizard.title'                       = 'OracleTuner 설치'
    'wizard.heading'                     = 'OracleTuner 설치 위저드'
    'common.cancel'                      = '취소'
    'common.back'                        = '< 이전'
    'common.next'                        = '다음 >'
    'common.install'                     = '설치'
    'common.close'                       = '닫기'
    'common.browseFolder'                = '찾아보기...'
    'step.progress.0'                    = '0/5 · 언어 선택'
    'step.progress.1'                    = '1/5 · 라이선스'
    'step.progress.2'                    = '2/5 · 설치 경로'
    'step.progress.3'                    = '3/5 · Java 선택'
    'step.progress.4'                    = '4/5 · 포트 지정'
    'step.progress.5'                    = '5/5 · 요약 및 설치'
    'step0.instruction'                  = '설치 위저드에서 사용할 언어를 선택하세요.'
    'step1.intro'                        = 'Oracle SQL 튜닝 워크벤치를 설치합니다. 계속하려면 아래 MIT 라이선스 원문(영문)에 동의하세요.'
    'step1.acceptLicense'                = '라이선스 조건에 동의합니다.'
    'step1.licenseRequiredWarning'       = '라이선스에 동의해야 계속할 수 있습니다.'
    'step2.pathLabel'                    = '설치 경로를 선택하세요.'
    'step2.folderDialogDescription'      = '설치할 폴더를 선택하세요'
    'step2.programFilesWarning'          = "⚠ Program Files 아래는 관리자 권한이 있어야 설치할 수 있습니다.`r`n접속정보·SQL 이력 등 데이터는 이 폴더가 아니라 항상 %LOCALAPPDATA%\OracleTuner 에 저장되므로, 이 폴더의 쓰기 권한과 무관하게 안전합니다."
    'step2.pathRequiredWarning'          = '설치 경로를 입력하세요.'
    'step2.pathNotAbsolute'              = '절대 경로를 입력하세요.'
    'step2.pathInvalidChars'             = '경로에 사용할 수 없는 문자가 있습니다.'
    'step2.pathDriveRoot'                = '드라이브 루트에는 설치할 수 없습니다. 하위 폴더를 지정하세요.'
    'step2.pathNonEmptyConfirm'          = "이 폴더에 이미 파일이 있습니다: {0}`r`n기존 파일이 덮어써질 수 있고, 나중에 제거하면 이 폴더 전체가 삭제됩니다.`r`n계속하시겠습니까?"
    'step2.writeCheckFailed'             = '이 위치에는 쓸 수 없습니다(권한 부족). 다른 경로를 선택하거나 관리자 권한으로 다시 실행하세요.'
    'step3.javaLabel'                    = 'Java 실행 방식을 선택하세요. (JDK 를 새로 구현하지 않고 기존 탐색 로직을 재사용합니다)'
    'step3.systemJava'                   = '시스템 JDK/JRE 사용'
    'step3.discover'                     = '탐색'
    'step3.browseJava'                   = '찾아보기'
    'step3.verify'                       = '검증(java -version 실행)'
    'step3.bundledJava'                  = '내장 JRE 사용 (이 배포판에 포함된 경우만 선택 가능)'
    'step3.javaFolderDialogDescription'  = 'JDK 또는 JRE 홈 디렉터리를 선택하세요 (bin\java.exe 가 있는 폴더의 상위)'
    'step3.notFound'                     = 'JDK/JRE 를 찾지 못했습니다. 찾아보기로 직접 지정하세요.'
    'step3.nodeUnavailable'              = 'node 를 실행할 수 없어 검증하지 못했습니다.'
    'step3.verified'                     = "확인됨: {0}`r`n{1}"
    'step3.failed'                       = '실패: {0}'
    'step4.portLabel'                    = '서버가 사용할 포트를 지정하세요. (127.0.0.1 로만 검사합니다 — 방화벽 팝업 방지)'
    'step4.findPort'                     = '가용 포트 찾기'
    'step4.testPort'                     = '테스트'
    'step4.nodeUnavailableFind'          = 'node 를 실행할 수 없어 탐색하지 못했습니다.'
    'step4.foundPort'                    = '사용 가능한 포트를 찾았습니다: {0}'
    'step4.allBusy'                      = '후보 포트가 모두 사용 중입니다. 포트를 직접 입력하고 테스트하세요.'
    'step4.invalidPort'                  = '1~65535 사이의 숫자를 입력하세요.'
    'step4.nodeUnavailableTest'          = 'node 를 실행할 수 없어 검사하지 못했습니다.'
    'step4.portFree'                     = '포트 {0} 는 사용 가능합니다.'
    'step4.portBusy'                     = '포트 {0} 는 이미 사용 중입니다. 다른 포트를 시도하세요.'
    'step5.startMenuShortcut'            = '시작 메뉴 바로가기 만들기'
    'step5.desktopShortcut'              = '바탕화면 바로가기 만들기'
    'step5.summary.installPath'          = '설치 경로: {0}'
    'step5.summary.javaMode'             = 'Java 모드: {0}{1}'
    'step5.summary.port'                 = '포트: {0}'
    'step5.summary.dataLocation'         = '데이터 저장 위치: {0}'
    'step5.summary.dataNote'             = '(설치 폴더가 아닌 이 위치에 접속정보·SQL 이력이 저장되므로, Program Files 에 설치해도 안전합니다)'
    'step5.installSuccess'               = '설치가 완료되었습니다: {0}'
    'step5.installError'                 = '설치 중 오류: {0}'
    'uninstall.confirmTitle'             = 'OracleTuner 제거'
    'uninstall.confirmBody'              = "OracleTuner 를 제거합니다.`r`n설치 폴더: {0}`r`n계속하시겠습니까?"
    'uninstall.dataConfirmTitle'         = 'OracleTuner 제거 — 사용자 데이터'
    'uninstall.dataConfirmBody'          = "저장된 접속정보·SQL 이력·설정도 함께 삭제할까요?`r`n위치: {0}`r`n`r`n[예] 를 누르면 데이터까지 완전히 삭제됩니다(되돌릴 수 없음).`r`n[아니오] 를 누르면 프로그램만 지우고 데이터는 남겨 둡니다(나중에 다시 설치하면 이어서 쓸 수 있음)."
    'uninstall.doneBody'                 = 'OracleTuner 프로그램 파일 제거가 완료되었습니다.'
    'uninstall.notInstalledTitle'        = 'OracleTuner 제거'
    'uninstall.notInstalledBody'         = "이 폴더는 설치본이 아닌 것 같습니다(version.json 을 찾지 못했습니다).`r`n리포지터리에서 직접 실행한 경우 소스 폴더가 삭제될 수 있어 중단합니다."
  }

  en = @{
    'lang.selectorLabel'                 = 'Language:'
    'wizard.title'                       = 'OracleTuner Setup'
    'wizard.heading'                     = 'OracleTuner Setup Wizard'
    'common.cancel'                      = 'Cancel'
    'common.back'                        = '< Back'
    'common.next'                        = 'Next >'
    'common.install'                     = 'Install'
    'common.close'                       = 'Close'
    'common.browseFolder'                = 'Browse...'
    'step.progress.0'                    = '0/5 - Language'
    'step.progress.1'                    = '1/5 - License'
    'step.progress.2'                    = '2/5 - Install Location'
    'step.progress.3'                    = '3/5 - Java Selection'
    'step.progress.4'                    = '4/5 - Port Setup'
    'step.progress.5'                    = '5/5 - Summary & Install'
    'step0.instruction'                  = 'Select the language for the setup wizard.'
    'step1.intro'                        = 'Install Oracle SQL tuning workbench. To continue, agree to the MIT license below.'
    'step1.acceptLicense'                = 'I agree to the license terms.'
    'step1.licenseRequiredWarning'       = 'You must agree to the license to continue.'
    'step2.pathLabel'                    = 'Choose an installation path.'
    'step2.folderDialogDescription'      = 'Select the destination folder.'
    'step2.programFilesWarning'          = "⚠ Installing under Program Files requires administrator rights.`r`nConnection info, SQL history, and data are stored in %LOCALAPPDATA%\OracleTuner (not this folder), so it's safe regardless of write permissions."
    'step2.pathRequiredWarning'          = 'Enter an installation path.'
    'step2.pathNotAbsolute'              = 'Enter an absolute path.'
    'step2.pathInvalidChars'             = 'The path contains characters that cannot be used.'
    'step2.pathDriveRoot'                = 'Cannot install to a drive root. Specify a subfolder.'
    'step2.pathNonEmptyConfirm'          = "This folder already has files: {0}`r`nExisting files may be overwritten, and removing the app later will delete this entire folder.`r`nContinue?"
    'step2.writeCheckFailed'             = 'Cannot write to this location (insufficient permission). Choose a different path, or re-run as administrator.'
    'step3.javaLabel'                    = 'Choose how Java will run. (reuses existing discovery logic)'
    'step3.systemJava'                   = 'Use system JDK/JRE'
    'step3.discover'                     = 'Discover'
    'step3.browseJava'                   = 'Browse'
    'step3.verify'                       = 'Verify (run java -version)'
    'step3.bundledJava'                  = 'Use bundled JRE (if available)'
    'step3.javaFolderDialogDescription'  = 'Select the JDK or JRE home directory (parent of the bin\ folder).'
    'step3.notFound'                     = 'No JDK/JRE was found. Use Browse to specify one manually.'
    'step3.nodeUnavailable'              = 'Could not verify because node could not be run.'
    'step3.verified'                     = "Verified: {0}`r`n{1}"
    'step3.failed'                       = 'Failed: {0}'
    'step4.portLabel'                    = 'Specify the port the server will use. (Checks against 127.0.0.1 only; avoids firewall dialogs.)'
    'step4.findPort'                     = 'Find available port'
    'step4.testPort'                     = 'Test'
    'step4.nodeUnavailableFind'          = 'Could not find ports because node could not be run.'
    'step4.foundPort'                    = 'Found an available port: {0}'
    'step4.allBusy'                      = 'All candidate ports are in use. Enter a port manually and test it.'
    'step4.invalidPort'                  = 'Enter a number between 1 and 65535.'
    'step4.nodeUnavailableTest'          = 'Could not test port because node could not be run.'
    'step4.portFree'                     = 'Port {0} is available.'
    'step4.portBusy'                     = 'Port {0} is already in use. Try a different port.'
    'step5.startMenuShortcut'            = 'Create Start Menu shortcut'
    'step5.desktopShortcut'              = 'Create desktop shortcut'
    'step5.summary.installPath'          = 'Install path: {0}'
    'step5.summary.javaMode'             = 'Java mode: {0}{1}'
    'step5.summary.port'                 = 'Port: {0}'
    'step5.summary.dataLocation'         = 'Data storage location: {0}'
    'step5.summary.dataNote'             = '(Stored here, not in install folder; safe for Program Files installations.)'
    'step5.installSuccess'               = 'Installation complete: {0}'
    'step5.installError'                 = 'Error during installation: {0}'
    'uninstall.confirmTitle'             = 'Uninstall OracleTuner'
    'uninstall.confirmBody'              = "This will uninstall OracleTuner.`r`nInstall folder: {0}`r`nDo you want to continue?"
    'uninstall.dataConfirmTitle'         = 'Uninstall OracleTuner - User Data'
    'uninstall.dataConfirmBody'          = "Delete saved connection info, SQL history, and settings?`r`nLocation: {0}`r`n`r`nYes: Delete all data (cannot undo).`r`nNo: Keep data (for future reinstall)."
    'uninstall.doneBody'                 = 'OracleTuner program files have been removed.'
    'uninstall.notInstalledTitle'        = 'Uninstall OracleTuner'
    'uninstall.notInstalledBody'         = "This folder doesn't look like an installed copy (version.json not found).`r`nStopping to avoid deleting a source folder if this was run directly from a repository."
  }

  ja = @{
    'lang.selectorLabel'                 = '言語:'
    'wizard.title'                       = 'OracleTuner セットアップ'
    'wizard.heading'                     = 'OracleTuner セットアップウィザード'
    'common.cancel'                      = 'キャンセル'
    'common.back'                        = '< 戻る'
    'common.next'                        = '次へ >'
    'common.install'                     = 'インストール'
    'common.close'                       = '閉じる'
    'common.browseFolder'                = '参照...'
    'step.progress.0'                    = '0/5 ・ 言語選択'
    'step.progress.1'                    = '1/5 ・ ライセンス'
    'step.progress.2'                    = '2/5 ・ インストール先'
    'step.progress.3'                    = '3/5 ・ Java の選択'
    'step.progress.4'                    = '4/5 ・ ポート設定'
    'step.progress.5'                    = '5/5 ・ 確認とインストール'
    'step0.instruction'                  = 'セットアップウィザードで使用する言語を選択してください。'
    'step1.intro'                        = 'Oracle SQL チューニングワークベンチをインストールします。続行するには、下記の MIT ライセンス原文(英語)に同意してください。'
    'step1.acceptLicense'                = 'ライセンス条項に同意します。'
    'step1.licenseRequiredWarning'       = '続行するにはライセンスに同意する必要があります。'
    'step2.pathLabel'                    = 'インストール先を選択してください。'
    'step2.folderDialogDescription'      = 'インストールするフォルダーを選択してください'
    'step2.programFilesWarning'          = "⚠ Program Files 配下にインストールするには管理者権限が必要です。`r`n接続情報や SQL 履歴などのデータはこのフォルダーではなく常に %LOCALAPPDATA%\OracleTuner に保存されるため、このフォルダーの書き込み権限に関係なく安全です。"
    'step2.pathRequiredWarning'          = 'インストール先を入力してください。'
    'step2.pathNotAbsolute'              = '絶対パスを入力してください。'
    'step2.pathInvalidChars'             = 'パスに使用できない文字が含まれています。'
    'step2.pathDriveRoot'                = 'ドライブのルートにはインストールできません。サブフォルダーを指定してください。'
    'step2.pathNonEmptyConfirm'          = "このフォルダーには既にファイルがあります: {0}`r`n既存のファイルが上書きされる可能性があり、後で削除するとこのフォルダー全体が削除されます。`r`n続行しますか?"
    'step2.writeCheckFailed'             = 'この場所には書き込めません(権限不足)。別のパスを選択するか、管理者権限で再実行してください。'
    'step3.javaLabel'                    = 'Java の実行方式を選択してください。(JDK を新規実装せず、既存の検出ロジックを再利用します)'
    'step3.systemJava'                   = 'システムの JDK/JRE を使用'
    'step3.discover'                     = '検出'
    'step3.browseJava'                   = '参照'
    'step3.verify'                       = '検証 (java -version を実行)'
    'step3.bundledJava'                  = '内蔵 JRE を使用（配布物に含まれる場合）'
    'step3.javaFolderDialogDescription'  = 'JDK または JRE のホームディレクトリを選択してください (bin\java.exe があるフォルダーの親)'
    'step3.notFound'                     = 'JDK/JRE が見つかりませんでした。「参照」で直接指定してください。'
    'step3.nodeUnavailable'              = 'node を実行できなかったため検証できませんでした。'
    'step3.verified'                     = "確認済み: {0}`r`n{1}"
    'step3.failed'                       = '失敗: {0}'
    'step4.portLabel'                    = 'サーバーが使用するポートを指定してください。(ファイアウォールの確認ダイアログを避けるため 127.0.0.1 でのみ検査します)'
    'step4.findPort'                     = '利用可能なポートを検索'
    'step4.testPort'                     = 'テスト'
    'step4.nodeUnavailableFind'          = 'node を実行できなかったため検索できませんでした。'
    'step4.foundPort'                    = '利用可能なポートが見つかりました: {0}'
    'step4.allBusy'                      = '候補ポートはすべて使用中です。ポートを直接入力してテストしてください。'
    'step4.invalidPort'                  = '1〜65535 の範囲の数値を入力してください。'
    'step4.nodeUnavailableTest'          = 'node を実行できなかったため確認できませんでした。'
    'step4.portFree'                     = 'ポート {0} は利用可能です。'
    'step4.portBusy'                     = 'ポート {0} は既に使用中です。別のポートを試してください。'
    'step5.startMenuShortcut'            = 'スタートメニューにショートカットを作成'
    'step5.desktopShortcut'              = 'デスクトップにショートカットを作成'
    'step5.summary.installPath'          = 'インストール先: {0}'
    'step5.summary.javaMode'             = 'Java モード: {0}{1}'
    'step5.summary.port'                 = 'ポート: {0}'
    'step5.summary.dataLocation'         = 'データ保存先: {0}'
    'step5.summary.dataNote'             = '(接続情報や SQL 履歴はインストールフォルダーではなくこの場所に保存されるため、Program Files にインストールしても安全です)'
    'step5.installSuccess'               = 'インストールが完了しました: {0}'
    'step5.installError'                 = 'インストール中にエラーが発生しました: {0}'
    'uninstall.confirmTitle'             = 'OracleTuner の削除'
    'uninstall.confirmBody'              = "OracleTuner を削除します。`r`nインストールフォルダー: {0}`r`n続行しますか?"
    'uninstall.dataConfirmTitle'         = 'OracleTuner の削除 — ユーザーデータ'
    'uninstall.dataConfirmBody'          = "保存されている接続情報・SQL 履歴・設定も削除しますか?`r`n場所: {0}`r`n`r`n[はい] を選ぶとデータも完全に削除されます(元に戻せません)。`r`n[いいえ] を選ぶとプログラムのみ削除し、データは残ります(後で再インストールすれば続きから使えます)。"
    'uninstall.doneBody'                 = 'OracleTuner のプログラムファイルの削除が完了しました。'
    'uninstall.notInstalledTitle'        = 'OracleTuner の削除'
    'uninstall.notInstalledBody'         = "このフォルダーはインストール済みのコピーではないようです(version.json が見つかりません)。`r`nリポジトリから直接実行した場合にソースフォルダーを削除しないよう中止します。"
  }

  zh = @{
    'lang.selectorLabel'                 = '语言:'
    'wizard.title'                       = 'OracleTuner 安装'
    'wizard.heading'                     = 'OracleTuner 安装向导'
    'common.cancel'                      = '取消'
    'common.back'                        = '< 上一步'
    'common.next'                        = '下一步 >'
    'common.install'                     = '安装'
    'common.close'                       = '关闭'
    'common.browseFolder'                = '浏览...'
    'step.progress.0'                    = '0/5 · 选择语言'
    'step.progress.1'                    = '1/5 · 许可协议'
    'step.progress.2'                    = '2/5 · 安装路径'
    'step.progress.3'                    = '3/5 · 选择 Java'
    'step.progress.4'                    = '4/5 · 端口设置'
    'step.progress.5'                    = '5/5 · 摘要与安装'
    'step0.instruction'                  = '请选择安装向导使用的语言。'
    'step1.intro'                        = '即将安装 Oracle SQL 调优工作台。请阅读并同意下方的 MIT 许可协议原文(英文)后继续。'
    'step1.acceptLicense'                = '我同意此许可协议条款。'
    'step1.licenseRequiredWarning'       = '必须同意许可协议才能继续。'
    'step2.pathLabel'                    = '请选择安装路径。'
    'step2.folderDialogDescription'      = '请选择安装文件夹'
    'step2.programFilesWarning'          = "⚠ 安装到 Program Files 下需要管理员权限。`r`n连接信息、SQL 历史等数据始终保存在 %LOCALAPPDATA%\OracleTuner，而非此文件夹，因此与此文件夹的写入权限无关，是安全的。"
    'step2.pathRequiredWarning'          = '请输入安装路径。'
    'step2.pathNotAbsolute'              = '请输入绝对路径。'
    'step2.pathInvalidChars'             = '路径中包含无法使用的字符。'
    'step2.pathDriveRoot'                = '无法安装到驱动器根目录。请指定子文件夹。'
    'step2.pathNonEmptyConfirm'          = "此文件夹中已有文件: {0}`r`n现有文件可能被覆盖，之后卸载时将删除整个文件夹。`r`n是否继续?"
    'step2.writeCheckFailed'             = '无法写入此位置(权限不足)。请选择其他路径，或以管理员身份重新运行。'
    'step3.javaLabel'                    = '请选择 Java 运行方式。(复用现有的检测逻辑，不重新实现 JDK 处理)'
    'step3.systemJava'                   = '使用系统中的 JDK/JRE'
    'step3.discover'                     = '检测'
    'step3.browseJava'                   = '浏览'
    'step3.verify'                       = '验证 (运行 java -version)'
    'step3.bundledJava'                  = '使用内置 JRE (仅在此发行版包含时可选)'
    'step3.javaFolderDialogDescription'  = '请选择 JDK 或 JRE 主目录 (即包含 bin\java.exe 的文件夹的上一级)'
    'step3.notFound'                     = '未找到 JDK/JRE。请使用"浏览"手动指定。'
    'step3.nodeUnavailable'              = '无法运行 node，因此无法验证。'
    'step3.verified'                     = "已验证: {0}`r`n{1}"
    'step3.failed'                       = '失败: {0}'
    'step4.portLabel'                    = '请指定服务器使用的端口。(仅针对 127.0.0.1 进行检测，以避免防火墙弹窗)'
    'step4.findPort'                     = '查找可用端口'
    'step4.testPort'                     = '测试'
    'step4.nodeUnavailableFind'          = '无法运行 node，因此无法查找。'
    'step4.foundPort'                    = '已找到可用端口: {0}'
    'step4.allBusy'                      = '候选端口均已被占用。请手动输入端口并测试。'
    'step4.invalidPort'                  = '请输入 1 到 65535 之间的数字。'
    'step4.nodeUnavailableTest'          = '无法运行 node，因此无法检测。'
    'step4.portFree'                     = '端口 {0} 可用。'
    'step4.portBusy'                     = '端口 {0} 已被占用，请尝试其他端口。'
    'step5.startMenuShortcut'            = '创建开始菜单快捷方式'
    'step5.desktopShortcut'              = '创建桌面快捷方式'
    'step5.summary.installPath'          = '安装路径: {0}'
    'step5.summary.javaMode'             = 'Java 模式: {0}{1}'
    'step5.summary.port'                 = '端口: {0}'
    'step5.summary.dataLocation'         = '数据存储位置: {0}'
    'step5.summary.dataNote'             = '(连接信息和 SQL 历史保存在此处，而非安装文件夹，因此即使安装到 Program Files 下也是安全的)'
    'step5.installSuccess'               = '安装完成: {0}'
    'step5.installError'                 = '安装过程中出错: {0}'
    'uninstall.confirmTitle'             = '卸载 OracleTuner'
    'uninstall.confirmBody'              = "即将卸载 OracleTuner。`r`n安装文件夹: {0}`r`n是否继续?"
    'uninstall.dataConfirmTitle'         = '卸载 OracleTuner — 用户数据'
    'uninstall.dataConfirmBody'          = "是否同时删除已保存的连接信息、SQL 历史和设置?`r`n位置: {0}`r`n`r`n选择[是]将彻底删除数据(无法恢复)。`r`n选择[否]仅删除程序，保留数据(以后重新安装可继续使用)。"
    'uninstall.doneBody'                 = 'OracleTuner 程序文件已删除完成。'
    'uninstall.notInstalledTitle'        = '卸载 OracleTuner'
    'uninstall.notInstalledBody'         = "此文件夹似乎不是安装副本(未找到 version.json)。`r`n为避免直接从代码仓库运行时删除源文件夹，已中止。"
  }
}

# ── 언어 판정·조회 유틸 ──────────────────────────────────────────────────────

<#
.SYNOPSIS
  OS 표시 언어로 기본 언어를 추정한다. ko/ja/zh 중 하나면 그것, 그 외에는 en.
#>
function Get-DefaultLanguage {
  try {
    $code = (Get-Culture).TwoLetterISOLanguageName
  } catch {
    return 'en'
  }
  if (@('ko', 'ja', 'zh') -contains $code) { return $code }
  return 'en'
}

<#
.SYNOPSIS
  $Lang 로케일의 $Key 문자열을 돌려준다. 없으면 en 으로 폴백, en 에도 없으면 "!Key!" 를
  돌려준다(화면에서 바로 눈에 띄어 누락을 알아차릴 수 있게 — 조용히 빈 문자열을 주지 않는다).
#>
function Get-Str {
  param(
    [Parameter(Mandatory = $true)][string]$Lang,
    [Parameter(Mandatory = $true)][string]$Key
  )
  if ($Strings.ContainsKey($Lang) -and $Strings[$Lang].ContainsKey($Key)) {
    return $Strings[$Lang][$Key]
  }
  if ($Strings['en'].ContainsKey($Key)) {
    return $Strings['en'][$Key]
  }
  return "!$Key!"
}

<#
.SYNOPSIS
  로케일별 UI 폰트 이름. 맑은 고딕은 한글·라틴 기준이라 일본어/중국어 화면에서는
  각 로케일에 흔한 시스템 폰트를 쓰는 편이 자연스럽다.
#>
function Get-UiFontName {
  param([string]$Lang)
  switch ($Lang) {
    'ja' { return 'Yu Gothic UI' }
    'zh' { return 'Microsoft YaHei UI' }
    default { return '맑은 고딕' }
  }
}

<#
.SYNOPSIS
  4로케일 문자열 테이블에 키 누락이 있는지 검사한다. en 을 기준 키 집합으로 삼아
  ko/ja/zh 와 차집합을 비교한다. 빠진 키가 하나도 없어야 통과.

.OUTPUTS
  [hashtable] 로케일별 누락 키 배열 — 모두 비어 있으면 정상.
#>
function Test-StringTableCompleteness {
  $baseKeys = @($Strings['en'].Keys)
  $missing = @{}
  foreach ($lang in @('ko', 'en', 'ja', 'zh')) {
    $langKeys = @($Strings[$lang].Keys)
    $miss = @($baseKeys | Where-Object { $langKeys -notcontains $_ })
    $extra = @($langKeys | Where-Object { $baseKeys -notcontains $_ })
    $missing[$lang] = @{ Missing = $miss; Extra = $extra }
  }
  return $missing
}

# ── 라이선스 본문 폴백(LICENSE 파일을 못 찾을 때만 사용, 항상 영문 원문) ──────────
# 리포 루트 LICENSE 파일과 동일한 내용을 담는다. 라이선스 화면은 언어와 무관하게 항상
# 이 영문 원문만 표시한다(총괄 지시 — "라이선스는 그냥 영문 쓰고". 번역·요약·병기 없음).

$MitLicenseFallback = @'
MIT License

Copyright (c) 2026 foxnail

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Third-party components

- Open Grid (data grid & charts) - MIT License
  https://github.com/farmerkweon/OpenGrid
- Oracle JDBC Driver (ojdbc) - Oracle Free Use Terms and Conditions (FUTC)
  Not bundled in this repository. The driver is downloaded separately by the
  user (see `npm run fetch-driver`) and remains subject to Oracle's own license.
'@

<#
.SYNOPSIS
  라이선스 화면에 표시할 영문 원문 텍스트를 만든다. SourceRoot\LICENSE 파일에서 읽고,
  없으면 $MitLicenseFallback 을 쓴다. 언어 매개변수를 받지 않는다 — 이 텍스트는 선택된
  언어와 무관하게 항상 영문이다.

.NOTES
  LICENSE 원본이 LF 개행만 쓸 수 있다(실측: 리포 루트 LICENSE 는 LF 전용). WinForms
  멀티라인 TextBox 는 LF 를 CRLF 로 자동 정규화하지 않으므로(실측), 여기서 명시적으로
  CRLF 로 맞춘다 — 안 하면 라이선스 본문이 한 줄로 뭉쳐 보인다.
#>
function Build-LicenseDisplayText {
  param(
    [Parameter(Mandatory = $true)][string]$SourceRoot
  )
  $licensePath = Join-Path $SourceRoot 'LICENSE'
  if (Test-Path $licensePath) {
    $body = Get-Content $licensePath -Raw
  } else {
    $body = $MitLicenseFallback
  }
  return ($body -replace "`r`n", "`n") -replace "`n", "`r`n"
}
