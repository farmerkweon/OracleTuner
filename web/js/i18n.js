/**
 * 다국어(i18n) — 한국어 / English / 日本語 / 中文.
 *
 * <p>설계
 * <ul>
 *   <li>정적 UI 텍스트: HTML 요소에 <code>data-i18n="key"</code>(본문), <code>data-i18n-ph</code>(placeholder),
 *       <code>data-i18n-title</code>(툴팁) 를 달아 두면 {@link applyDom} 이 한 번에 채운다.</li>
 *   <li>동적 텍스트: 화면 코드에서 {@link t}(key, params) 로 가져온다.</li>
 *   <li>Open Grid 로케일: 언어를 바꾸면 그리드의 필터/정렬 UI 문구도 함께 바뀐다(ko·en 내장, ja·zh 는 근사).</li>
 * </ul>
 *
 * <p>키가 현재 언어에 없으면 <b>한국어 → 키 자체</b> 순으로 폴백한다(빈 화면을 만들지 않는다).
 */

export const LANGS = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' }
];

/** {key: {ko, en, ja, zh}} — 한 줄에 4개 언어를 모아 관리한다(누락을 눈으로 잡기 쉽게). */
const M = {
  // ── 앱 공통 ──
  'app.title': { ko: 'Oracle Tuner — SQL 튜닝 워크벤치', en: 'Oracle Tuner — SQL Tuning Workbench', ja: 'Oracle Tuner — SQL チューニング ワークベンチ', zh: 'Oracle Tuner — SQL 调优工作台' },
  'app.subtitle': { ko: 'SQL 튜닝 워크벤치', en: 'SQL Tuning Workbench', ja: 'SQL チューニング ワークベンチ', zh: 'SQL 调优工作台' },

  // ── 상단바 ──
  'top.connect': { ko: '접속', en: 'Connect', ja: '接続', zh: '连接' },
  'top.disconnect': { ko: '접속 해제', en: 'Disconnect', ja: '接続解除', zh: '断开' },
  'top.notConnected': { ko: '미접속', en: 'Not connected', ja: '未接続', zh: '未连接' },
  'top.connectTip': { ko: 'DB 접속 (Ctrl+Shift+C)', en: 'Connect to DB (Ctrl+Shift+C)', ja: 'DB 接続 (Ctrl+Shift+C)', zh: '连接数据库 (Ctrl+Shift+C)' },
  'top.theme': { ko: '테마', en: 'Theme', ja: 'テーマ', zh: '主题' },
  'top.language': { ko: '언어', en: 'Language', ja: '言語', zh: '语言' },
  'top.help': { ko: '도움말', en: 'Help', ja: 'ヘルプ', zh: '帮助' },
  'top.helpTip': { ko: '도움말 (F1)', en: 'Help (F1)', ja: 'ヘルプ (F1)', zh: '帮助 (F1)' },

  // ── 상단 탭 ──
  'nav.sqls': { ko: 'SQL 목록', en: 'SQL List', ja: 'SQL 一覧', zh: 'SQL 列表' },
  'nav.workbench': { ko: '워크벤치', en: 'Workbench', ja: 'ワークベンチ', zh: '工作台' },
  'nav.schema': { ko: '스키마', en: 'Schema', ja: 'スキーマ', zh: '模式' },
  'nav.history': { ko: '튜닝 이력', en: 'History', ja: 'チューニング履歴', zh: '调优历史' },
  'nav.settings': { ko: '설정', en: 'Settings', ja: '設定', zh: '设置' },

  // ── 편집기 ──
  'wb.beforeTitle': { ko: '튜닝 전 SQL', en: 'Original SQL', ja: 'チューニング前 SQL', zh: '调优前 SQL' },
  'wb.afterTitle': { ko: '튜닝 후 SQL', en: 'Tuned SQL', ja: 'チューニング後 SQL', zh: '调优后 SQL' },
  'wb.run': { ko: '실행', en: 'Run', ja: '実行', zh: '执行' },
  'wb.runTip': { ko: '현재 문장 실행 (Ctrl+Enter)', en: 'Run current statement (Ctrl+Enter)', ja: '現在の文を実行 (Ctrl+Enter)', zh: '执行当前语句 (Ctrl+Enter)' },
  'wb.explain': { ko: '실행계획', en: 'Explain', ja: '実行計画', zh: '执行计划' },
  'wb.explainTip': { ko: '실행계획 조회 (Ctrl+E)', en: 'Explain plan (Ctrl+E)', ja: '実行計画 (Ctrl+E)', zh: '执行计划 (Ctrl+E)' },
  'wb.analyze': { ko: '진단', en: 'Diagnose', ja: '診断', zh: '诊断' },
  'wb.analyzeTip': { ko: 'SQL 진단 (Ctrl+D)', en: 'Diagnose SQL (Ctrl+D)', ja: 'SQL 診断 (Ctrl+D)', zh: '诊断 SQL (Ctrl+D)' },
  'wb.format': { ko: '정렬', en: 'Format', ja: '整形', zh: '格式化' },
  'wb.formatTip': { ko: 'SQL 정렬 (Ctrl+Shift+F)', en: 'Format SQL (Ctrl+Shift+F)', ja: 'SQL 整形 (Ctrl+Shift+F)', zh: '格式化 SQL (Ctrl+Shift+F)' },
  'wb.copy': { ko: '복사', en: 'Copy', ja: 'コピー', zh: '复制' },
  'wb.copyTip': { ko: '이 SQL 을 클립보드로 복사', en: 'Copy this SQL to clipboard', ja: 'この SQL をクリップボードにコピー', zh: '复制此 SQL 到剪贴板' },
  'wb.expandStar': { ko: '*펼치기', en: 'Expand *', ja: '* 展開', zh: '展开 *' },
  'wb.expandStarTip': { ko: 'SELECT * 를 컬럼 목록으로', en: 'Expand SELECT * to columns', ja: 'SELECT * を列名に展開', zh: '将 SELECT * 展开为列名' },
  'wb.copyToAfter': { ko: '튜닝 후로 복사', en: 'Copy to Tuned', ja: 'チューニング後へコピー', zh: '复制到调优后' },
  'wb.copyToAfterTip': { ko: '튜닝 후 편집기로 복사', en: 'Copy to Tuned editor', ja: 'チューニング後エディタへコピー', zh: '复制到调优后编辑器' },
  'wb.hint': { ko: '힌트', en: 'Hint', ja: 'ヒント', zh: '提示' },
  'wb.hintTip': { ko: '힌트 위저드 — 고르기만 하면 됩니다', en: 'Hint wizard — just pick one', ja: 'ヒントウィザード — 選ぶだけ', zh: '提示向导 — 只需选择' },

  // ── 힌트 위저드 ──
  'hw.title': { ko: '힌트 위저드', en: 'Hint Wizard', ja: 'ヒントウィザード', zh: '提示向导' },
  'hw.intro': { ko: '힌트를 직접 몰라도 됩니다. 상황에 맞는 것을 고르면 표·인덱스 이름은 자동으로 채워집니다.', en: 'You don\'t need to know hints. Pick what fits; table and index names are filled in for you.', ja: 'ヒントを知らなくても大丈夫。状況に合うものを選べば、表やインデックス名は自動で入ります。', zh: '无需了解提示。选择合适的项，表名与索引名会自动填入。' },
  'hw.target': { ko: '대상 편집기', en: 'Target editor', ja: '対象エディタ', zh: '目标编辑器' },
  'hw.noTables': { ko: '이 SQL 에서 테이블을 찾지 못해 일부 힌트는 직접 입력이 필요합니다.', en: 'No tables found in this SQL; some hints need manual input.', ja: 'この SQL に表が見つからず、一部のヒントは手入力が必要です。', zh: '此 SQL 中未找到表，部分提示需手动输入。' },
  'hw.table': { ko: '테이블', en: 'Table', ja: '表', zh: '表' },
  'hw.index': { ko: '인덱스', en: 'Index', ja: 'インデックス', zh: '索引' },
  'hw.indexPlaceholder': { ko: '인덱스명 (접속 시 목록에서 선택)', en: 'Index name (pick from list when connected)', ja: 'インデックス名(接続時に選択)', zh: '索引名（连接后从列表选择）' },
  'hw.value': { ko: '값', en: 'Value', ja: '値', zh: '值' },
  'hw.preview': { ko: '생성될 힌트', en: 'Hint to insert', ja: '挿入されるヒント', zh: '将插入的提示' },
  'hw.apply': { ko: '이 힌트 넣기', en: 'Insert hint', ja: 'ヒントを挿入', zh: '插入提示' },
  'hw.applied': { ko: '힌트를 넣었습니다.', en: 'Hint inserted.', ja: 'ヒントを挿入しました。', zh: '已插入提示。' },
  'hw.needTable': { ko: '테이블을 먼저 선택하세요.', en: 'Select a table first.', ja: 'まず表を選択してください。', zh: '请先选择表。' },
  'hw.emptySql': { ko: '힌트를 넣을 SQL 이 비어 있습니다.', en: 'The SQL to add a hint to is empty.', ja: 'ヒントを追加する SQL が空です。', zh: '要添加提示的 SQL 为空。' },
  'hw.catAccess': { ko: '접근 경로 — 테이블을 어떻게 읽을까', en: 'Access path — how to read a table', ja: 'アクセスパス — 表の読み方', zh: '访问路径 — 如何读表' },
  'hw.catJoin': { ko: '조인 — 여러 테이블을 어떻게 합칠까', en: 'Join — how to combine tables', ja: '結合 — 表の組み合わせ方', zh: '连接 — 如何合并表' },
  'hw.catOpt': { ko: '옵티마이저 목표', en: 'Optimizer goal', ja: 'オプティマイザ目標', zh: '优化器目标' },
  'hw.catSub': { ko: '서브쿼리 / 뷰 / WITH', en: 'Subquery / view / WITH', ja: 'サブクエリ / ビュー / WITH', zh: '子查询 / 视图 / WITH' },
  'hw.catEtc': { ko: '기타', en: 'Other', ja: 'その他', zh: '其他' },
  'wb.compare': { ko: '비교 검증', en: 'Compare', ja: '比較検証', zh: '对比验证' },
  'wb.compareTip': { ko: '전/후 비교 검증 (Ctrl+Shift+K)', en: 'Compare before/after (Ctrl+Shift+K)', ja: '前後の比較検証 (Ctrl+Shift+K)', zh: '前后对比验证 (Ctrl+Shift+K)' },
  'wb.library': { ko: 'SQL함', en: 'Library', ja: 'SQL 集', zh: 'SQL 库' },
  'wb.libraryTip': { ko: 'SQL 저장 / 불러오기 (Ctrl+S)', en: 'Save / load SQL (Ctrl+S)', ja: 'SQL 保存 / 読込 (Ctrl+S)', zh: '保存 / 载入 SQL (Ctrl+S)' },

  // ── SQL 라이브러리 ──
  'lib.title': { ko: 'SQL 라이브러리', en: 'SQL Library', ja: 'SQL ライブラリ', zh: 'SQL 库' },
  'lib.saveCurrent': { ko: '현재 SQL 저장', en: 'Save current SQL', ja: '現在の SQL を保存', zh: '保存当前 SQL' },
  'lib.name': { ko: '이름', en: 'Name', ja: '名前', zh: '名称' },
  'lib.tags': { ko: '추가 태그 (쉼표 구분)', en: 'More tags (comma-separated)', ja: '追加タグ (カンマ区切り)', zh: '附加标签(逗号分隔)' },
  'lib.folder': { ko: '폴더', en: 'Folder', ja: 'フォルダ', zh: '文件夹' },
  'lib.folderPh': { ko: '폴더명 — 기존 폴더를 고르거나 새로 입력', en: 'Folder — pick an existing one or type a new name', ja: 'フォルダ名 — 既存を選ぶか新規入力', zh: '文件夹 — 选择已有或输入新名称' },
  'lib.desc': { ko: '설명', en: 'Description', ja: '説明', zh: '说明' },
  'lib.save': { ko: '저장', en: 'Save', ja: '保存', zh: '保存' },
  'lib.saved': { ko: '라이브러리에 저장했습니다.', en: 'Saved to library.', ja: 'ライブラリに保存しました。', zh: '已保存到库。' },
  'lib.search': { ko: '이름·SQL·태그 검색…', en: 'Search name, SQL, tags…', ja: '名前・SQL・タグ検索…', zh: '搜索名称、SQL、标签…' },
  'lib.list': { ko: '저장된 SQL', en: 'Saved SQL', ja: '保存済み SQL', zh: '已保存 SQL' },
  'lib.empty': { ko: '저장된 SQL 이 없습니다. 위에서 이름을 붙여 저장해 보세요.', en: 'No saved SQL yet. Name and save one above.', ja: '保存済み SQL がありません。上で名前を付けて保存してください。', zh: '暂无已保存 SQL。请在上方命名并保存。' },
  'lib.loadBefore': { ko: '튜닝 전으로', en: 'To Original', ja: 'チューニング前へ', zh: '载入调优前' },
  'lib.loadAfter': { ko: '튜닝 후로', en: 'To Tuned', ja: 'チューニング後へ', zh: '载入调优后' },
  'lib.loaded': { ko: '편집기에 불러왔습니다.', en: 'Loaded into the editor.', ja: 'エディタに読み込みました。', zh: '已载入编辑器。' },
  'lib.delete': { ko: '삭제', en: 'Delete', ja: '削除', zh: '删除' },
  'lib.deleteConfirm': { ko: '"{name}" 을(를) 삭제할까요? 삭제하면 되돌릴 수 없습니다.', en: 'Delete "{name}"? This cannot be undone.', ja: '"{name}" を削除しますか? 元に戻せません。', zh: '删除"{name}"？此操作无法撤销。' },
  'lib.needName': { ko: '이름을 입력하세요.', en: 'Enter a name.', ja: '名前を入力してください。', zh: '请输入名称。' },
  'lib.needSql': { ko: '저장할 SQL 이 비어 있습니다.', en: 'The SQL to save is empty.', ja: '保存する SQL が空です。', zh: '要保存的 SQL 为空。' },
  'lib.updated': { ko: '수정', en: 'Updated', ja: '更新', zh: '更新' },
  'lib.scopeShared': { ko: '공용 (미접속)', en: 'Shared (offline)', ja: '共用 (未接続)', zh: '公用(未连接)' },
  'lib.scopeNote': { ko: 'SQL 은 접속별로 따로 저장됩니다', en: 'SQL is stored per connection', ja: 'SQL は接続ごとに保存されます', zh: 'SQL 按连接分别保存' },

  // ── SQL 목록 페이지 ──
  'sqls.new': { ko: '+ 신규 SQL', en: '+ New SQL', ja: '+ 新規 SQL', zh: '+ 新建 SQL' },
  'sqls.newTip': { ko: '빈 워크벤치에서 새 SQL 작성', en: 'Start a fresh SQL in the workbench', ja: '空のワークベンチで新規作成', zh: '在空工作台新建 SQL' },
  'sqls.saveCurrent': { ko: '현재 SQL 저장', en: 'Save current SQL', ja: '現在の SQL を保存', zh: '保存当前 SQL' },
  'sqls.uncategorized': { ko: '(태그 없음)', en: '(untagged)', ja: '(タグなし)', zh: '(无标签)' },
  'sqls.selectHint': { ko: '왼쪽 목록에서 SQL 을 선택하세요. 더블클릭하면 워크벤치로 바로 열립니다.', en: 'Select a SQL on the left. Double-click to open it in the workbench.', ja: '左で SQL を選択してください。ダブルクリックでワークベンチに開きます。', zh: '在左侧选择 SQL。双击可直接在工作台打开。' },
  'sqls.openBefore': { ko: '워크벤치로 열기 (튜닝 전)', en: 'Open in workbench (Original)', ja: 'ワークベンチで開く (前)', zh: '在工作台打开(调优前)' },
  'sqls.openAfter': { ko: '튜닝 후로 열기', en: 'Open as Tuned', ja: 'チューニング後で開く', zh: '作为调优后打开' },
  'sqls.emptyTitle': { ko: '저장된 SQL 이 없습니다', en: 'No saved SQL yet', ja: '保存済み SQL がありません', zh: '暂无已保存 SQL' },
  'sqls.emptyDesc': { ko: '[+ 신규 SQL] 로 워크벤치에서 작성한 뒤, 편집기의 [SQL함] 버튼으로 이름을 붙여 저장하면 여기 목록에 쌓입니다.', en: 'Click [+ New SQL] to compose in the workbench, then save it with the editor\'s [Library] button — it will appear here.', ja: '[+ 新規 SQL] でワークベンチに作成し、エディタの [SQL 集] ボタンで名前を付けて保存するとここに並びます。', zh: '点击[+ 新建 SQL]在工作台编写，再用编辑器的[SQL 库]按钮命名保存，即会出现在此。' },
  'sqls.tuningHistory': { ko: '이 SQL 의 튜닝 이력', en: 'Tuning history of this SQL', ja: 'この SQL のチューニング履歴', zh: '此 SQL 的调优历史' },
  'sqls.noTuning': { ko: '아직 이 SQL 의 튜닝 이력이 없습니다. 워크벤치에서 열어 튜닝하고 저장하면 여기 쌓입니다.', en: 'No tuning history for this SQL yet. Open it in the workbench, tune, and save.', ja: 'この SQL のチューニング履歴はまだありません。ワークベンチで開いて保存してください。', zh: '此 SQL 尚无调优历史。在工作台打开、调优并保存后将出现在此。' },
  'sqls.openTuning': { ko: '이력 열기', en: 'Open', ja: '履歴を開く', zh: '打开' },
  'wb.runScript': { ko: '전체 실행', en: 'Run script', ja: '全文実行', zh: '执行全部' },
  'wb.runScriptTip': { ko: '편집기의 모든 문장을 순서대로 실행합니다 (스크립트용)', en: 'Run every statement in the editor, in order', ja: 'エディタの全文を順に実行します', zh: '按顺序执行编辑器中的所有语句' },
  'wb.runScriptConfirm': { ko: '{n}개 문장을 순서대로 실행합니다.\n\n[확인] 실제로 반영(커밋)  ·  [취소] 중단\n\n※ 데이터를 바꾸는 문장이 있으면 실제로 반영됩니다.', en: 'Run {n} statements in order.\n\n[OK] apply for real (commit) · [Cancel] abort\n\nNote: statements that change data will be applied.', ja: '{n} 文を順に実行します。\n\n[OK] 実際に反映(コミット) · [キャンセル] 中止\n\n※ データを変更する文は実際に反映されます。', zh: '将按顺序执行 {n} 条语句。\n\n[确定] 实际提交 · [取消] 中止\n\n注意：修改数据的语句会真实生效。' },
  'wb.runScriptDone': { ko: '스크립트 완료 — 성공 {ok} / 실패 {failed}', en: 'Script done — {ok} ok / {failed} failed', ja: 'スクリプト完了 — 成功 {ok} / 失敗 {failed}', zh: '脚本完成 — 成功 {ok} / 失败 {failed}' },

  'cd.measureNote': { ko: '측정은 결과를 <b>끝까지 인출</b>해서 잽니다(잘라 읽으면 전체 스캔 비용이 감춰져 차이가 안 납니다).', en: 'Timing runs <b>fetch every row</b> — truncated reads would hide the cost of a full scan.', ja: '計測は結果を <b>最後まで取得</b> して測ります(途中で打ち切ると全表走査のコストが隠れます)。', zh: '计时会 <b>取回全部行</b> —— 截断读取会掩盖全表扫描的成本。' },
  'sqls.demoSetup': { ko: '데모 데이터 생성', en: 'Create demo data', ja: 'デモデータ作成', zh: '创建演示数据' },
  'sqls.demoSetupTip': { ko: '표·30만 건·인덱스·통계를 한 번에 만듭니다 (버튼 하나로 끝)', en: 'Creates tables, 300k rows, indexes and stats in one click', ja: '表・30万件・インデックス・統計を一括作成', zh: '一键创建表、30 万行、索引与统计' },
  'sqls.demoSetupConfirm': { ko: '데모용 표와 데이터를 만듭니다.\n\n· 기존 데모 표(OT_ORDERS, OT_BAD_CUST)가 있으면 지우고 새로 만듭니다\n· 주문 30만 건 + 인덱스 4개 + 통계\n· 1~2분 걸립니다\n\n진행할까요?', en: 'Create demo tables and data.\n\n· Existing demo tables (OT_ORDERS, OT_BAD_CUST) will be dropped and recreated\n· 300,000 orders + 4 indexes + statistics\n· Takes 1–2 minutes\n\nProceed?', ja: 'デモ用の表とデータを作成します。\n\n· 既存のデモ表(OT_ORDERS, OT_BAD_CUST)は削除して作り直します\n· 注文 30 万件 + インデックス 4 + 統計\n· 1〜2 分かかります\n\n進めますか?', zh: '创建演示表与数据。\n\n· 已存在的演示表(OT_ORDERS, OT_BAD_CUST)将被删除并重建\n· 30 万条订单 + 4 个索引 + 统计\n· 需要 1–2 分钟\n\n是否继续？' },
  'sqls.demoSetupDone': { ko: '데모 데이터 생성 완료 — 주문 {n}건. 이제 예제를 열고 [튜닝 후보] 를 눌러보세요.', en: 'Demo data ready — {n} orders. Now open an example and hit [Candidates].', ja: 'デモデータ作成完了 — 注文 {n} 件。例題を開いて [チューニング候補] へ。', zh: '演示数据已就绪 — {n} 条订单。现在打开示例并点击[调优候选]。' },
  'sqls.demoSetupRunning': { ko: '데모 데이터를 만들고 있습니다… (30만 건이라 1~2분 걸립니다)', en: 'Creating demo data… (300k rows, 1–2 minutes)', ja: 'デモデータを作成中… (30 万件、1〜2 分)', zh: '正在创建演示数据…（30 万行，1–2 分钟）' },
  'sqls.loadDemo': { ko: '샘플 예제', en: 'Samples', ja: 'サンプル', zh: '示例' },
  'sqls.loadDemoTip': { ko: '튜닝 효과를 확인할 수 있는 예제 SQL 을 목록에 넣습니다', en: 'Add example SQLs that demonstrate real tuning gains', ja: 'チューニング効果を確認できる例題 SQL を追加します', zh: '添加可验证调优效果的示例 SQL' },
  // 데모 예제가 담기는 폴더 이름. 설치할 때 이 이름이 태그로 저장된다(server/demo-install.js DEMO_FOLDER 와 같은 값이어야 한다).
  'sqls.demoFolder': { ko: '데모', en: 'Demo', ja: 'デモ', zh: '演示' },
  'sqls.demoInstalled': { ko: '샘플 예제 {n}건을 넣었습니다. "{folder}" 폴더를 확인하세요.', en: 'Added {n} sample SQLs. See the "{folder}" folder.', ja: 'サンプル {n} 件を追加しました。「{folder}」フォルダをご確認ください。', zh: '已添加 {n} 个示例。请查看"{folder}"文件夹。' },
  'sqls.demoConfirm': { ko: '튜닝 효과를 확인할 수 있는 샘플 예제를 목록에 넣습니다.\n\n먼저 "데모 1) 데이터 한번에 만들기" 를 실행해 시험용 표(30만 건)를 만들어야 효과를 볼 수 있습니다.\n진행할까요?', en: 'Add sample SQLs that demonstrate tuning gains.\n\nRun "Demo 1) Create all data at once" first to create the 300k-row test tables.\nProceed?', ja: 'チューニング効果を確認できるサンプルを追加します。\n\nまず「デモ 1) データを一括作成」を実行して 30 万件の試験表を作成してください。\n進めますか?', zh: '添加可验证调优效果的示例 SQL。\n\n请先执行"演示 1) 一次性创建数据"创建 30 万行测试表。\n是否继续？' },
  'sqls.shared': { ko: '공용', en: 'Shared', ja: '共用', zh: '公用' },
  'sqls.sharedTip': { ko: '공용 SQL — 모든 접속에서 보입니다', en: 'Shared SQL — visible in every connection', ja: '共用 SQL — すべての接続で表示', zh: '公用 SQL — 所有连接均可见' },
  'wb.emptyAfter': { ko: '(비어 있음 — 튜닝안을 여기에 작성하세요)', en: '(empty — write your tuned SQL here)', ja: '(空 — チューニング案をここに)', zh: '(空 — 在此编写调优方案)' },
  'wb.docNew': { ko: '신규 SQL', en: 'New SQL', ja: '新規 SQL', zh: '新建 SQL' },
  'wb.docModified': { ko: '수정됨', en: 'modified', ja: '変更あり', zh: '已修改' },
  'wb.docFrom': { ko: '불러옴', en: 'loaded', ja: '読込', zh: '已载入' },
  'wb.dockHide': { ko: 'SQL 목록 감추기', en: 'Hide SQL list', ja: 'SQL 一覧を隠す', zh: '隐藏 SQL 列表' },
  'wb.dockShow': { ko: 'SQL 목록 보기', en: 'Show SQL list', ja: 'SQL 一覧を表示', zh: '显示 SQL 列表' },
  'wb.confirmSaveNew': { ko: '작성 중인 SQL 이 있습니다. 목록에 저장한 뒤 새로 시작할까요?\n\n[확인] 저장하고 새로 · [취소] 저장 없이 새로', en: 'You have SQL in progress. Save it to the list before starting new?\n\n[OK] Save and start new · [Cancel] Discard and start new', ja: '作成中の SQL があります。一覧に保存してから新規に始めますか?\n\n[OK] 保存して新規 · [キャンセル] 破棄して新規', zh: '有正在编辑的 SQL。是否保存到列表后再新建？\n\n[确定] 保存并新建 · [取消] 放弃并新建' },

  // ── 결과 탭 ──
  'tab.result': { ko: '결과', en: 'Result', ja: '結果', zh: '结果' },
  'tab.plan': { ko: '실행계획', en: 'Plan', ja: '実行計画', zh: '执行计划' },
  'tab.diag': { ko: '진단', en: 'Diagnosis', ja: '診断', zh: '诊断' },
  'tab.cands': { ko: '튜닝 후보', en: 'Candidates', ja: 'チューニング候補', zh: '调优候选' },
  'tab.verify': { ko: '비교·검증', en: 'Verify', ja: '比較・検証', zh: '对比·验证' },
  'tab.stats': { ko: '계측', en: 'Metrics', ja: '計測', zh: '度量' },
  'tab.log': { ko: '메시지', en: 'Log', ja: 'メッセージ', zh: '消息' },

  'res.saveTuning': { ko: '튜닝 저장', en: 'Save tuning', ja: 'チューニング保存', zh: '保存调优' },
  'res.saveTuningTip': { ko: '이 튜닝 작업을 이력에 기록합니다', en: 'Record this tuning to history', ja: 'このチューニングを履歴に記録します', zh: '将本次调优记录到历史' },
  'res.cancel': { ko: '실행 취소', en: 'Cancel', ja: '実行取消', zh: '取消执行' },
  'res.empty': { ko: 'SQL 을 실행하면 결과가 여기에 표시됩니다.', en: 'Run a SQL to see results here.', ja: 'SQL を実行すると結果がここに表示されます。', zh: '执行 SQL 后结果显示在此。' },
  'res.copy': { ko: '결과 복사(TSV)', en: 'Copy (TSV)', ja: 'コピー(TSV)', zh: '复制(TSV)' },
  'res.exportCsv': { ko: 'CSV', en: 'CSV', ja: 'CSV', zh: 'CSV' },
  'res.exportXlsx': { ko: 'Excel', en: 'Excel', ja: 'Excel', zh: 'Excel' },

  'plan.empty': { ko: '실행계획을 조회하면 여기에 표시됩니다.', en: 'Explain a plan to see it here.', ja: '実行計画を取得するとここに表示されます。', zh: '获取执行计划后显示在此。' },
  'plan.target': { ko: '대상', en: 'Target', ja: '対象', zh: '目标' },
  'plan.before': { ko: '튜닝 전', en: 'Original', ja: 'チューニング前', zh: '调优前' },
  'plan.after': { ko: '튜닝 후', en: 'Tuned', ja: 'チューニング後', zh: '调优后' },
  'plan.actual': { ko: '실제계획', en: 'Actual plan', ja: '実際の計画', zh: '实际计划' },
  'plan.actualTip': { ko: '실제 실행된 계획 (V$ 권한 필요)', en: 'Actually executed plan (needs V$ access)', ja: '実際に実行された計画 (V$ 権限が必要)', zh: '实际执行的计划(需 V$ 权限)' },
  'plan.copyText': { ko: '계획 복사', en: 'Copy plan', ja: '計画をコピー', zh: '复制计划' },

  'diag.empty': { ko: '진단을 실행하면 지적사항이 표시됩니다. 행을 펼치면 상세 설명과 조치 방법이 나옵니다.', en: 'Run diagnosis to see findings. Expand a row for details and fixes.', ja: '診断を実行すると指摘が表示されます。行を展開すると詳細と対処が出ます。', zh: '运行诊断以查看问题。展开行可见详情与修复方法。' },

  'stats.empty': { ko: '실행 시 수집된 세션 통계 증분입니다. V$MYSTAT 권한이 없으면 시간만 표시됩니다.', en: 'Session statistics delta collected on execution. Without V$MYSTAT access, only timings are shown.', ja: '実行時に収集したセッション統計の増分です。V$MYSTAT 権限がなければ時間のみ表示。', zh: '执行时采集的会话统计增量。无 V$MYSTAT 权限时仅显示时间。' },

  'verify.intro': { ko: '튜닝 전·후 SQL 을 모두 입력하고 <b>비교 검증</b>을 누르면, 두 SQL 을 번갈아 실행해 <b>성능 차이</b>와 <b>결과 동일성</b>을 함께 판정합니다.', en: 'Enter both original and tuned SQL, then click <b>Compare</b> to run them alternately and judge <b>performance</b> and <b>result equivalence</b> together.', ja: 'チューニング前後の SQL を両方入力し <b>比較検証</b> を押すと、両者を交互に実行して <b>性能差</b> と <b>結果の同一性</b> を判定します。', zh: '输入调优前后的 SQL，点击 <b>对比验证</b>，交替执行两者并同时判定 <b>性能差异</b> 与 <b>结果一致性</b>。' },

  // ── 튜닝 후보 탭 ──
  'cd.gen': { ko: '후보 생성', en: 'Generate', ja: '候補生成', zh: '生成候选' },
  'cd.genTip': { ko: 'SQL 을 분석해 시도해 볼 튜닝안을 자동으로 만듭니다', en: 'Analyze the SQL and auto-generate tuning candidates', ja: 'SQL を分析してチューニング案を自動生成', zh: '分析 SQL 并自动生成调优方案' },
  'cd.run': { ko: '토너먼트 실행', en: 'Run tournament', ja: 'トーナメント実行', zh: '运行竞赛' },
  'cd.runTip': { ko: '원본과 후보들을 번갈아 실행해 속도·부하를 재고 순위를 매깁니다', en: 'Run original and candidates alternately, measure speed/load, and rank them', ja: '原本と候補を交互に実行し、速度・負荷を測って順位付け', zh: '交替执行原语句与候选，测量速度/负载并排名' },
  'cd.runs': { ko: '회전', en: 'Rounds', ja: '回転', zh: '轮次' },
  'cd.warmup': { ko: '워밍업', en: 'Warmup', ja: 'ウォームアップ', zh: '预热' },
  'cd.max': { ko: '최대 후보', en: 'Max candidates', ja: '最大候補', zh: '最多候选' },
  'cd.exp': { ko: '실험적 후보 포함 (검증이 덜 된 방식도 시도)', en: 'Include experimental (less-proven methods too)', ja: '実験的候補を含む(検証が浅い方式も試す)', zh: '含实验性候选（也尝试验证较少的方式）' },
  'cd.intro': { ko: '<b>튜닝을 몰라도 됩니다.</b> [후보 생성] 을 누르면 이 SQL 에 시도해 볼 수 있는 튜닝안을 자동으로 만들고, [토너먼트 실행] 을 누르면 원본과 후보들을 <b>번갈아 여러 회전 실행</b>해서 속도·부하를 재고 <b>결과가 같은지</b>까지 확인한 뒤 순위를 매겨 드립니다.', en: '<b>No tuning expertise needed.</b> Click [Generate] to auto-build tuning candidates for this SQL, then [Run tournament] to execute the original and candidates <b>alternately over multiple rounds</b>, measure speed and load, verify the <b>results match</b>, and rank them.', ja: '<b>チューニングの知識は不要です。</b> [候補生成] でこの SQL の案を自動生成し、[トーナメント実行] で原本と候補を <b>交互に複数回転実行</b> して速度・負荷を測り、<b>結果が同じか</b> まで確認して順位を付けます。', zh: '<b>无需懂调优。</b> 点击[生成候选]为此 SQL 自动构建调优方案，点击[运行竞赛]将原语句与候选 <b>交替多轮执行</b>，测量速度与负载，验证 <b>结果是否一致</b> 并排名。' },
  'cd.progress.starting': { ko: '토너먼트 준비 중…', en: 'Preparing tournament…', ja: 'トーナメント準備中…', zh: '正在准备锦标赛…' },
  'cd.progress.phaseVerify': { ko: '예선', en: 'Qualifying', ja: '予選', zh: '预选' },
  'cd.progress.phaseMeasure': { ko: '본선', en: 'Final', ja: '本戦', zh: '正赛' },
  'cd.progress.status': { ko: '{phase} {done} / {total} 실행 중 — {label}', en: '{phase} {done} / {total} running — {label}', ja: '{phase} {done} / {total} 実行中 — {label}', zh: '{phase} {done} / {total} 执行中 — {label}' },
  'cd.progress.elapsed': { ko: '경과 {sec}초', en: 'Elapsed {sec}s', ja: '経過 {sec}秒', zh: '已用 {sec}秒' },
  'cd.progress.hint': { ko: '총 약 {total}회 실행 예정입니다. 완료될 때까지 이 탭을 벗어나도 됩니다.', en: 'About {total} executions are planned in total. You can leave this tab until it finishes.', ja: '合計約{total}回実行される予定です。完了までこのタブを離れても構いません。', zh: '预计共执行约 {total} 次。完成前可以离开此标签页。' },

  // ── 스키마 ──
  'sc.schema': { ko: '스키마', en: 'Schema', ja: 'スキーマ', zh: '模式' },
  'sc.filter': { ko: '객체명 검색…', en: 'Search objects…', ja: 'オブジェクト名検索…', zh: '搜索对象…' },
  'sc.query': { ko: '조회', en: 'Query', ja: '照会', zh: '查询' },
  'sc.selectTable': { ko: '왼쪽에서 테이블을 선택하세요.', en: 'Select a table on the left.', ja: '左でテーブルを選択してください。', zh: '请在左侧选择表。' },
  'sc.countRows': { ko: '행수 실측', en: 'Count rows', ja: '行数実測', zh: '实测行数' },
  'sc.countRowsTip': { ko: '실제 COUNT(*) 실측', en: 'Actual COUNT(*)', ja: '実際の COUNT(*)', zh: '实际 COUNT(*)' },
  'sc.genSelect': { ko: 'SELECT 생성', en: 'Generate SELECT', ja: 'SELECT 生成', zh: '生成 SELECT' },
  'sc.tabColumns': { ko: '컬럼', en: 'Columns', ja: 'カラム', zh: '列' },
  'sc.tabIndexes': { ko: '인덱스', en: 'Indexes', ja: 'インデックス', zh: '索引' },
  'sc.tabConstraints': { ko: '제약', en: 'Constraints', ja: '制約', zh: '约束' },
  'sc.tabStats': { ko: '통계', en: 'Statistics', ja: '統計', zh: '统计' },
  'sc.listFailed': { ko: '스키마 목록 조회 실패: {err}', en: 'Failed to load schema list: {err}', ja: 'スキーマ一覧の取得失敗: {err}', zh: '获取模式列表失败: {err}' },
  'sc.needConnect': { ko: 'DB 에 접속하세요.', en: 'Connect to the database.', ja: 'DB に接続してください。', zh: '请先连接数据库。' },
  'sc.colName': { ko: '객체명', en: 'Object', ja: 'オブジェクト名', zh: '对象名' },
  'sc.colType': { ko: '유형', en: 'Type', ja: '種別', zh: '类型' },
  'sc.colStatus': { ko: '상태', en: 'Status', ja: '状態', zh: '状态' },
  'sc.colLastDdl': { ko: '최종 DDL', en: 'Last DDL', ja: '最終 DDL', zh: '最后 DDL' },
  'sc.objectsCount': { ko: '{n}개 객체 · 출처 <b>{source}</b>', en: '{n} object(s) · source <b>{source}</b>', ja: '{n} 件のオブジェクト · 出典 <b>{source}</b>', zh: '{n} 个对象 · 来源 <b>{source}</b>' },
  'sc.loadingDetail': { ko: '조회 중…', en: 'Loading…', ja: '照会中…', zh: '查询中…' },
  'sc.detailCount': { ko: '{n}건 · 출처 <b>{source}</b>', en: '{n} row(s) · source <b>{source}</b>', ja: '{n} 件 · 出典 <b>{source}</b>', zh: '{n} 条 · 来源 <b>{source}</b>' },
  'sc.kindTable': { ko: '테이블', en: 'Table', ja: 'テーブル', zh: '表' },
  'sc.kindColumn': { ko: '컬럼', en: 'Column', ja: 'カラム', zh: '列' },
  'sc.density': { ko: '밀도 {density} / {histogram}', en: 'Density {density} / {histogram}', ja: '密度 {density} / {histogram}', zh: '密度 {density} / {histogram}' },
  'sc.colColumnName': { ko: '컬럼명', en: 'Column', ja: 'カラム名', zh: '列名' },
  'sc.colDataType': { ko: '타입', en: 'Type', ja: '型', zh: '类型' },
  'sc.colLength': { ko: '길이', en: 'Length', ja: '長さ', zh: '长度' },
  'sc.colPrecision': { ko: '정밀도', en: 'Precision', ja: '精度', zh: '精度' },
  'sc.colScale': { ko: '스케일', en: 'Scale', ja: 'スケール', zh: '小数位' },
  'sc.colDefault': { ko: '기본값', en: 'Default', ja: 'デフォルト値', zh: '默认值' },
  'sc.colIndexName': { ko: '인덱스명', en: 'Index', ja: 'インデックス名', zh: '索引名' },
  'sc.colIndexColumns': { ko: '구성 컬럼', en: 'Columns', ja: '構成カラム', zh: '组成列' },
  'sc.colUniqueness': { ko: '유일성', en: 'Uniqueness', ja: '一意性', zh: '唯一性' },
  'sc.colRows': { ko: '행수', en: 'Rows', ja: '行数', zh: '行数' },
  'sc.colDistinctKeys': { ko: '고유키', en: 'Distinct keys', ja: '一意キー', zh: '唯一键数' },
  'sc.colClusteringFactor': { ko: '군집도', en: 'Clustering factor', ja: 'クラスタリング係数', zh: '聚簇因子' },
  'sc.colLastAnalyzed': { ko: '최종분석', en: 'Last analyzed', ja: '最終分析', zh: '最后分析' },
  'sc.colConstraintName': { ko: '제약명', en: 'Constraint', ja: '制約名', zh: '约束名' },
  'sc.colColumns': { ko: '컬럼', en: 'Columns', ja: 'カラム', zh: '列' },
  'sc.colRefConstraint': { ko: '참조 제약', en: 'Referenced constraint', ja: '参照制約', zh: '引用约束' },
  'sc.colCondition': { ko: '조건', en: 'Condition', ja: '条件', zh: '条件' },
  'sc.colKind': { ko: '구분', en: 'Kind', ja: '区分', zh: '类别' },
  'sc.colTarget': { ko: '대상', en: 'Target', ja: '対象', zh: '对象' },
  'sc.colRowsDistinct': { ko: '행수/고유값', en: 'Rows / distinct', ja: '行数/一意値', zh: '行数/唯一值' },
  'sc.colBlocksNulls': { ko: '블록/NULL수', en: 'Blocks / NULLs', ja: 'ブロック/NULL数', zh: '块数/NULL数' },
  'sc.colAvgLen': { ko: '평균길이', en: 'Avg length', ja: '平均長', zh: '平均长度' },
  'sc.colNote': { ko: '비고', en: 'Note', ja: '備考', zh: '备注' },
  'sc.pickTable': { ko: '테이블을 선택하세요.', en: 'Select a table.', ja: 'テーブルを選択してください。', zh: '请选择表。' },
  'sc.selectAdded': { ko: '워크벤치(튜닝 전)에 SELECT 문을 추가했습니다.', en: 'Added the SELECT statement to the workbench (Original).', ja: 'ワークベンチ(チューニング前)に SELECT 文を追加しました。', zh: '已将 SELECT 语句添加到工作台（调优前）。' },
  'sc.countConfirm': { ko: '{owner}.{table} 의 실제 행수를 COUNT(*) 로 셉니다.\n큰 테이블이면 시간이 오래 걸릴 수 있습니다. 진행할까요?', en: 'Count the actual rows of {owner}.{table} with COUNT(*).\nThis can take a while for large tables. Proceed?', ja: '{owner}.{table} の実際の行数を COUNT(*) で数えます。\n大きなテーブルでは時間がかかることがあります。実行しますか?', zh: '将使用 COUNT(*) 统计 {owner}.{table} 的实际行数。\n表较大时可能耗时较长，是否继续？' },
  'sc.countResult': { ko: '{table}: {rows}행 ({ms}ms)', en: '{table}: {rows} rows ({ms}ms)', ja: '{table}: {rows}行 ({ms}ms)', zh: '{table}：{rows} 行（{ms}ms）' },
  'sc.countFailed': { ko: '실측 실패: {err}', en: 'Count failed: {err}', ja: '実測失敗: {err}', zh: '实测失败: {err}' },
  'sc.counting': { ko: '세는 중…', en: 'Counting…', ja: 'カウント中…', zh: '统计中…' },

  // ── 이력 ──
  'hi.search': { ko: '제목·SQL·메모 검색…', en: 'Search title, SQL, notes…', ja: 'タイトル・SQL・メモ検索…', zh: '搜索标题、SQL、备注…' },
  'hi.status': { ko: '상태', en: 'Status', ja: '状態', zh: '状态' },
  'hi.statusAll': { ko: '전체', en: 'All', ja: 'すべて', zh: '全部' },
  'hi.refresh': { ko: '새로고침', en: 'Refresh', ja: '更新', zh: '刷新' },
  'st.draft': { ko: '작성중', en: 'Draft', ja: '作成中', zh: '草稿' },
  'st.verified': { ko: '검증완료', en: 'Verified', ja: '検証済', zh: '已验证' },
  'st.applied': { ko: '적용됨', en: 'Applied', ja: '適用済', zh: '已应用' },
  'st.rejected': { ko: '보류', en: 'On hold', ja: '保留', zh: '搁置' },

  // ── 설정 ──
  'se.diagTitle': { ko: '환경 진단', en: 'Environment check', ja: '環境診断', zh: '环境诊断' },
  'se.diagDesc': { ko: '이 도구가 동작하는 데 필요한 것들의 실제 상태입니다. 빠진 것은 빠진 대로 표시합니다.', en: 'Actual status of what this tool needs. Missing items are shown as missing.', ja: 'このツールに必要なものの実状態です。欠けているものはそのまま表示します。', zh: '本工具运行所需项的实际状态。缺失项如实显示。' },
  'se.rebuild': { ko: '브리지 재빌드', en: 'Rebuild bridge', ja: 'ブリッジ再ビルド', zh: '重建桥接' },
  'se.restart': { ko: '브리지 재기동', en: 'Restart bridge', ja: 'ブリッジ再起動', zh: '重启桥接' },
  'se.rescan': { ko: '드라이버 재탐색', en: 'Rescan drivers', ja: 'ドライバ再探索', zh: '重新扫描驱动' },
  'se.javaTitle': { ko: 'Java 실행환경 (JDK / JRE)', en: 'Java runtime (JDK / JRE)', ja: 'Java 実行環境 (JDK / JRE)', zh: 'Java 运行环境 (JDK / JRE)' },
  'se.javaHome': { ko: 'Java 홈 경로', en: 'Java home path', ja: 'Java ホームパス', zh: 'Java 主目录' },
  'se.jvmOptions': { ko: 'JVM 옵션 (한 줄에 하나)', en: 'JVM options (one per line)', ja: 'JVM オプション (1行に1つ)', zh: 'JVM 选项(每行一个)' },
  'se.driverTitle': { ko: 'Oracle JDBC 드라이버', en: 'Oracle JDBC driver', ja: 'Oracle JDBC ドライバ', zh: 'Oracle JDBC 驱动' },
  'se.driverPaths': { ko: '드라이버 jar 경로', en: 'Driver jar paths', ja: 'ドライバ jar パス', zh: '驱动 jar 路径' },
  'se.autoDiscover': { ko: 'java/lib 자동 탐색 사용', en: 'Auto-discover in java/lib', ja: 'java/lib 自動探索を使用', zh: '自动扫描 java/lib' },
  'se.execTitle': { ko: '실행 기본값', en: 'Execution defaults', ja: '実行デフォルト', zh: '执行默认值' },
  'se.maxRows': { ko: '최대 인출 행수', en: 'Max fetch rows', ja: '最大取得行数', zh: '最大取回行数' },
  'se.fetchSize': { ko: 'Fetch Size', en: 'Fetch size', ja: 'フェッチサイズ', zh: 'Fetch 大小' },
  'se.timeout': { ko: '질의 타임아웃(초)', en: 'Query timeout (s)', ja: 'クエリタイムアウト(秒)', zh: '查询超时(秒)' },
  'se.benchRuns': { ko: '벤치마크 반복', en: 'Benchmark runs', ja: 'ベンチ反復', zh: '基准重复' },
  'se.benchWarmup': { ko: '워밍업 실행', en: 'Warmup runs', ja: 'ウォームアップ', zh: '预热次数' },
  'se.port': { ko: '서버 포트(재시작 필요)', en: 'Server port (restart)', ja: 'サーバポート(再起動)', zh: '服务器端口(需重启)' },
  'se.safeMode': { ko: '<b>안전모드</b> — DML/DDL 을 실행해도 실수로 데이터가 바뀌지 않도록 자동 되돌립니다. 끄지 않는 것을 권장합니다.', en: '<b>Safe mode</b> — automatically rolls back DML/DDL so data is never changed by accident. Keep it on.', ja: '<b>セーフモード</b> — DML/DDL を実行しても誤ってデータが変わらないよう自動で元に戻します。オンのままを推奨。', zh: '<b>安全模式</b> — 执行 DML/DDL 也会自动回滚，避免误改数据。建议保持开启。' },
  'se.autoExplain': { ko: '실행 시 실행계획도 자동 조회', en: 'Auto-explain on execution', ja: '実行時に実行計画も自動取得', zh: '执行时自动获取执行计划' },
  'se.save': { ko: '설정 저장', en: 'Save settings', ja: '設定保存', zh: '保存设置' },
  'se.use': { ko: '사용', en: 'Use', ja: '使用', zh: '使用' },
  'se.loadFailed': { ko: '설정을 불러오지 못했습니다: {err}', en: 'Failed to load settings: {err}', ja: '設定を読み込めませんでした: {err}', zh: '无法加载设置: {err}' },
  'se.saved': { ko: '저장했습니다.', en: 'Saved.', ja: '保存しました。', zh: '已保存。' },
  'se.restartedNote': { ko: 'Java/JDBC 설정이 바뀌어 브리지를 다시 띄웠습니다 (DB 접속은 끊깁니다).', en: 'Java/JDBC settings changed, so the bridge was restarted (the DB connection will be dropped).', ja: 'Java/JDBC 設定が変わったため、ブリッジを再起動しました(DB 接続は切断されます)。', zh: 'Java/JDBC 设置已更改，已重启桥接（数据库连接将断开）。' },
  'se.restartFailed': { ko: '브리지 재기동 실패: {err}', en: 'Bridge restart failed: {err}', ja: 'ブリッジ再起動失敗: {err}', zh: '桥接重启失败: {err}' },
  'se.saving': { ko: '저장 중…', en: 'Saving…', ja: '保存中…', zh: '保存中…' },
  'se.restartedOk': { ko: '브리지를 다시 띄웠습니다. DB 접속은 끊겼습니다.', en: 'Bridge restarted. The DB connection was dropped.', ja: 'ブリッジを再起動しました。DB 接続は切断されました。', zh: '已重启桥接。数据库连接已断开。' },
  'se.restarting': { ko: '재기동 중…', en: 'Restarting…', ja: '再起動中…', zh: '重启中…' },
  'se.buildOk': { ko: '빌드 성공', en: 'Build succeeded', ja: 'ビルド成功', zh: '构建成功' },
  'se.buildFail': { ko: '빌드 실패', en: 'Build failed', ja: 'ビルド失敗', zh: '构建失败' },
  'se.building': { ko: '빌드 중…', en: 'Building…', ja: 'ビルド中…', zh: '构建中…' },
  'se.driversFound': { ko: '드라이버 {n}개를 인식했습니다.', en: 'Recognized {n} driver(s).', ja: 'ドライバを {n} 件認識しました。', zh: '已识别 {n} 个驱动。' },
  'se.runtimeLabel': { ko: '실행 환경', en: 'Runtime', ja: '実行環境', zh: '运行环境' },
  'se.runtimeDetail': { ko: 'Node {node} · {platform}\n설정 파일: {file}', en: 'Node {node} · {platform}\nSettings file: {file}', ja: 'Node {node} · {platform}\n設定ファイル: {file}', zh: 'Node {node} · {platform}\n配置文件: {file}' },
  'se.noDrivers': { ko: '인식된 드라이버가 없습니다. java/lib 에 ojdbc11.jar 를 넣으세요.', en: 'No drivers recognized. Place ojdbc11.jar in java/lib.', ja: '認識されたドライバがありません。java/lib に ojdbc11.jar を置いてください。', zh: '未识别到驱动。请将 ojdbc11.jar 放入 java/lib。' },
  'se.searchingJava': { ko: '설치된 Java 를 찾는 중…', en: 'Searching for installed Java…', ja: 'インストール済み Java を検索中…', zh: '正在查找已安装的 Java…' },
  'se.noJavaFound': { ko: '설치된 Java 를 찾지 못했습니다. 경로를 직접 입력하세요.', en: 'No installed Java found. Enter the path manually.', ja: 'インストール済み Java が見つかりませんでした。パスを直接入力してください。', zh: '未找到已安装的 Java。请手动输入路径。' },
  'se.pathFilled': { ko: '경로를 입력란에 넣었습니다. [설정 저장] 을 누르세요.', en: 'Filled the path field. Click [Save settings].', ja: 'パスを入力欄に設定しました。[設定保存] を押してください。', zh: '已填入路径。请点击[保存设置]。' },

  // ── 접속 모달 ──
  'cn.title': { ko: 'DB 접속', en: 'Database connection', ja: 'DB 接続', zh: '数据库连接' },
  'cn.saved': { ko: '저장된 접속', en: 'Saved connections', ja: '保存済み接続', zh: '已保存连接' },
  'cn.new': { ko: '+ 새로', en: '+ New', ja: '+ 新規', zh: '+ 新建' },
  'cn.name': { ko: '이름', en: 'Name', ja: '名前', zh: '名称' },
  'cn.user': { ko: '사용자', en: 'User', ja: 'ユーザー', zh: '用户' },
  'cn.host': { ko: '호스트', en: 'Host', ja: 'ホスト', zh: '主机' },
  'cn.port': { ko: '포트', en: 'Port', ja: 'ポート', zh: '端口' },
  'cn.service': { ko: '서비스명', en: 'Service name', ja: 'サービス名', zh: '服务名' },
  'cn.sid': { ko: 'SID (서비스명 대신)', en: 'SID (instead of service)', ja: 'SID (サービス名の代替)', zh: 'SID(替代服务名)' },
  'cn.password': { ko: '비밀번호', en: 'Password', ja: 'パスワード', zh: '密码' },
  'cn.role': { ko: '롤', en: 'Role', ja: 'ロール', zh: '角色' },
  'cn.roleNormal': { ko: '일반', en: 'Normal', ja: '通常', zh: '普通' },
  'cn.url': { ko: '직접 URL (입력하면 위 항목보다 우선)', en: 'Direct URL (overrides fields above)', ja: '直接 URL (上の項目より優先)', zh: '直连 URL(优先于上方字段)' },
  'cn.note': { ko: '메모', en: 'Note', ja: 'メモ', zh: '备注' },
  'cn.savePw': { ko: '비밀번호 저장(로컬 암호화)', en: 'Save password (locally encrypted)', ja: 'パスワード保存(ローカル暗号化)', zh: '保存密码(本地加密)' },
  'cn.production': { ko: '표시', en: 'mark', ja: '表示', zh: '标记' },
  'cn.productionLabel': { ko: '운영계', en: 'Production', ja: '本番系', zh: '生产环境' },
  'cn.test': { ko: '접속 시험', en: 'Test', ja: '接続テスト', zh: '测试连接' },
  'cn.saveProfile': { ko: '프로필 저장', en: 'Save profile', ja: 'プロファイル保存', zh: '保存配置' },
  'cn.delete': { ko: '삭제', en: 'Delete', ja: '削除', zh: '删除' },
  'cn.doConnect': { ko: '접속', en: 'Connect', ja: '接続', zh: '连接' },
  'cn.noSaved': { ko: '저장된 접속이 없습니다. [+ 새로] 로 만드세요.', en: 'No saved connections. Create one with [+ New].', ja: '保存済み接続がありません。[+ 新規] で作成してください。', zh: '暂无已保存的连接。请点击[+ 新建]创建。' },
  'cn.prodBadge': { ko: '운영', en: 'Prod', ja: '本番', zh: '生产' },
  'cn.savedPwPlaceholder': { ko: '저장된 비밀번호 사용 (바꾸려면 입력)', en: 'Using saved password (type to change)', ja: '保存済みパスワードを使用(変更するには入力)', zh: '使用已保存密码（如需更改请输入）' },
  'cn.needName': { ko: '접속 이름을 입력하세요.', en: 'Enter a connection name.', ja: '接続名を入力してください。', zh: '请输入连接名称。' },
  'cn.needService': { ko: '서비스명을 입력하세요. (Oracle Free 는 보통 FREEPDB1, XE 는 XEPDB1)', en: 'Enter a service name. (Usually FREEPDB1 for Oracle Free, XEPDB1 for XE)', ja: 'サービス名を入力してください。(Oracle Free は通常 FREEPDB1、XE は XEPDB1)', zh: '请输入服务名。（Oracle Free 通常为 FREEPDB1，XE 为 XEPDB1）' },
  'cn.needServiceConnect': { ko: '서비스명을 입력하세요. (Oracle Free 는 보통 FREEPDB1, XE 는 XEPDB1)\n비워 두면 ORA-12261 이 납니다.', en: 'Enter a service name. (Usually FREEPDB1 for Oracle Free, XEPDB1 for XE)\nLeaving it empty causes ORA-12261.', ja: 'サービス名を入力してください。(Oracle Free は通常 FREEPDB1、XE は XEPDB1)\n空のままだと ORA-12261 が発生します。', zh: '请输入服务名。（Oracle Free 通常为 FREEPDB1，XE 为 XEPDB1）\n留空将导致 ORA-12261。' },
  'cn.profileSaved': { ko: '프로필을 저장했습니다.', en: 'Profile saved.', ja: 'プロファイルを保存しました。', zh: '已保存配置。' },
  'cn.selectToDelete': { ko: '삭제할 프로필을 선택하세요.', en: 'Select a profile to delete.', ja: '削除するプロファイルを選択してください。', zh: '请选择要删除的配置。' },
  'cn.deleteConfirm': { ko: '접속 프로필 "{name}" 을(를) 삭제할까요?', en: 'Delete connection profile "{name}"?', ja: '接続プロファイル "{name}" を削除しますか?', zh: '确定要删除连接配置"{name}"吗？' },
  'cn.deleted': { ko: '삭제했습니다.', en: 'Deleted.', ja: '削除しました。', zh: '已删除。' },
  'cn.testing': { ko: '접속 시험 중…', en: 'Testing connection…', ja: '接続テスト中…', zh: '正在测试连接…' },
  'cn.testingBtn': { ko: '시험 중…', en: 'Testing…', ja: 'テスト中…', zh: '测试中…' },
  'cn.testOk': { ko: '접속 성공\n{banner}\n스키마: {schema} · 서버시각: {time}', en: 'Connection succeeded\n{banner}\nSchema: {schema} · Server time: {time}', ja: '接続成功\n{banner}\nスキーマ: {schema} · サーバー時刻: {time}', zh: '连接成功\n{banner}\n模式: {schema} · 服务器时间: {time}' },
  'cn.testFail': { ko: '접속 실패\n{err}', en: 'Connection failed\n{err}', ja: '接続失敗\n{err}', zh: '连接失败\n{err}' },
  'cn.needProfile': { ko: '프로필을 먼저 저장하거나 접속 정보를 입력하세요.', en: 'Save a profile first, or enter connection details.', ja: '先にプロファイルを保存するか、接続情報を入力してください。', zh: '请先保存配置，或输入连接信息。' },
  'cn.connecting': { ko: '접속 중…', en: 'Connecting…', ja: '接続中…', zh: '正在连接…' },
  'cn.logConnected': { ko: '접속: {banner} ({schema})', en: 'Connected: {banner} ({schema})', ja: '接続: {banner} ({schema})', zh: '已连接：{banner}（{schema}）' },
  'cn.connectedToast': { ko: '접속되었습니다 — {name}', en: 'Connected — {name}', ja: '接続しました — {name}', zh: '已连接 — {name}' },
  'cn.logConnectFailed': { ko: '접속 실패: {err}', en: 'Connection failed: {err}', ja: '接続失敗: {err}', zh: '连接失败: {err}' },
  'cn.disconnectedToast': { ko: '접속을 끊었습니다.', en: 'Disconnected.', ja: '接続を切断しました。', zh: '已断开连接。' },
  'cn.statusTitle': { ko: '{banner}\n{url}\nSID {sid} · 인스턴스 {instance}', en: '{banner}\n{url}\nSID {sid} · Instance {instance}', ja: '{banner}\n{url}\nSID {sid} · インスタンス {instance}', zh: '{banner}\n{url}\nSID {sid} · 实例 {instance}' },
  'cn.prodPrefix': { ko: '운영 · ', en: 'Production · ', ja: '本番 · ', zh: '生产 · ' },
  'cn.capPlan': { ko: '계획: {v}', en: 'Plan: {v}', ja: '計画: {v}', zh: '计划: {v}' },
  'cn.capRuntime': { ko: '계측: {v}', en: 'Runtime: {v}', ja: '計測: {v}', zh: '实测: {v}' },
  'cn.capDict': { ko: '딕셔너리: {v}', en: 'Dictionary: {v}', ja: 'ディクショナリ: {v}', zh: '字典: {v}' },
  'cn.capDegraded': { ko: '제한 {n}건', en: '{n} limitation(s)', ja: '制限 {n} 件', zh: '{n} 项受限' },
  'cn.planStd': { ko: '표준', en: 'Standard', ja: '標準', zh: '标准' },
  'cn.planBasic': { ko: '기본', en: 'Basic', ja: '基本', zh: '基础' },
  'cn.planNone': { ko: '없음', en: 'None', ja: 'なし', zh: '无' },
  'cn.rtFull': { ko: '실적포함', en: 'With actuals', ja: '実績含む', zh: '含实际值' },
  'cn.rtSession': { ko: '세션통계', en: 'Session stats', ja: 'セッション統計', zh: '会话统计' },
  'cn.rtTimeOnly': { ko: '시간만', en: 'Time only', ja: '時間のみ', zh: '仅时间' },
  'cn.dictJdbcOnly': { ko: 'JDBC만', en: 'JDBC only', ja: 'JDBC のみ', zh: '仅 JDBC' },

  // ── 저장 모달 ──
  'sv.title': { ko: '튜닝 저장', en: 'Save tuning', ja: 'チューニング保存', zh: '保存调优' },
  'sv.titleField': { ko: '제목', en: 'Title', ja: 'タイトル', zh: '标题' },
  'sv.tags': { ko: '태그 (쉼표 구분)', en: 'Tags (comma-separated)', ja: 'タグ (カンマ区切り)', zh: '标签(逗号分隔)' },
  'sv.status': { ko: '상태', en: 'Status', ja: '状態', zh: '状态' },
  'sv.note': { ko: '메모 — 무엇을 왜 바꿨는지', en: 'Note — what changed and why', ja: 'メモ — 何をなぜ変えたか', zh: '备注 — 改了什么、为什么' },
  'sv.save': { ko: '저장', en: 'Save', ja: '保存', zh: '保存' },
  'sv.linkSql': { ko: '이 SQL 도 목록에 저장하고 이 튜닝을 연결', en: 'Also save this SQL to the list and link this tuning', ja: 'この SQL も一覧に保存し、このチューニングを紐付ける', zh: '同时把此 SQL 保存到列表并关联本次调优' },
  'sv.linkedNew': { ko: 'SQL 을 목록에 저장하고 이력을 연결했습니다.', en: 'Saved the SQL to the list and linked the tuning.', ja: 'SQL を一覧に保存し、履歴を紐付けました。', zh: '已把 SQL 保存到列表并关联调优。' },
  'sv.saveTargets': { ko: '저장 대상', en: 'What will be saved', ja: '保存対象', zh: '将保存的内容' },
  'hist.improve': { ko: '개선율', en: 'Improvement', ja: '改善率', zh: '改善率' },

  // ── 도움말 ──
  'help.title': { ko: '도움말', en: 'Help', ja: 'ヘルプ', zh: '帮助' },
  'help.close': { ko: '닫기', en: 'Close', ja: '閉じる', zh: '关闭' },

  // ── 공통 동작/토스트 ──
  'common.copy': { ko: '복사', en: 'Copy', ja: 'コピー', zh: '复制' },
  'common.copied': { ko: '복사했습니다.', en: 'Copied to clipboard.', ja: 'コピーしました。', zh: '已复制到剪贴板。' },
  'common.copyFail': { ko: '복사에 실패했습니다.', en: 'Copy failed.', ja: 'コピーに失敗しました。', zh: '复制失败。' },
  'common.nothingToCopy': { ko: '복사할 내용이 없습니다.', en: 'Nothing to copy.', ja: 'コピーする内容がありません。', zh: '没有可复制的内容。' },
  'common.needConnect': { ko: '먼저 DB 에 접속하세요. (Ctrl+Shift+C)', en: 'Connect to a database first. (Ctrl+Shift+C)', ja: 'まず DB に接続してください。(Ctrl+Shift+C)', zh: '请先连接数据库。(Ctrl+Shift+C)' },
  'common.copySql': { ko: '이 SQL 을 복사', en: 'Copy this SQL', ja: 'この SQL をコピー', zh: '复制此 SQL' },
  'common.adopt': { ko: '이 안을 [튜닝 후] 편집기로 채택', en: 'Adopt into [Tuned] editor', ja: '[チューニング後] エディタに採用', zh: '采用到[调优后]编辑器' },

  // ── 심각도 / 판정 / 위험도 / 등급 라벨(화면 곳곳에 반복) ──
  'sev.high': { ko: '높음', en: 'High', ja: '高', zh: '高' },
  'sev.medium': { ko: '보통', en: 'Medium', ja: '中', zh: '中' },
  'sev.low': { ko: '낮음', en: 'Low', ja: '低', zh: '低' },
  'sev.info': { ko: '참고', en: 'Info', ja: '参考', zh: '参考' },
  'verdict.identical': { ko: '동일', en: 'Identical', ja: '同一', zh: '一致' },
  'verdict.sameset': { ko: '순서다름', en: 'Order differs', ja: '順序違い', zh: '顺序不同' },
  'verdict.different': { ko: '결과다름', en: 'Differs', ja: '結果違い', zh: '结果不同' },
  'verdict.inconclusive': { ko: '확인불가', en: 'N/A', ja: '確認不可', zh: '无法确认' },
  'verdict.skipped': { ko: '미검증', en: 'Skipped', ja: '未検証', zh: '未验证' },
  'risk.safe': { ko: '안전', en: 'Safe', ja: '安全', zh: '安全' },
  'risk.semantic': { ko: '의미변화', en: 'Semantic', ja: '意味変化', zh: '语义变化' },
  'risk.experimental': { ko: '실험적', en: 'Experimental', ja: '実験的', zh: '实验性' },
  'grade.strong': { ko: '강력권고', en: 'Strong', ja: '強く推奨', zh: '强力推荐' },
  'grade.good': { ko: '권고', en: 'Recommended', ja: '推奨', zh: '推荐' },
  'grade.moderate': { ko: '검토', en: 'Consider', ja: '検討', zh: '可考虑' },
  'grade.marginal': { ko: '미미', en: 'Marginal', ja: '軽微', zh: '微小' },
  'grade.worse': { ko: '역효과', en: 'Worse', ja: '逆効果', zh: '更差' },

  // ── 공용 그리드 헤더 / 짧은 라벨 ──
  'col.severity': { ko: '심각도', en: 'Severity', ja: '深刻度', zh: '严重度' },
  'col.category': { ko: '분류', en: 'Category', ja: '分類', zh: '分类' },
  'col.finding': { ko: '지적사항', en: 'Finding', ja: '指摘', zh: '问题' },
  'col.line': { ko: '줄', en: 'Line', ja: '行', zh: '行' },
  'col.location': { ko: '위치', en: 'Location', ja: '位置', zh: '位置' },
  'col.ruleId': { ko: '규칙 ID', en: 'Rule ID', ja: 'ルール ID', zh: '规则 ID' },
  'col.title': { ko: '제목', en: 'Title', ja: 'タイトル', zh: '标题' },
  'col.tuneItem': { ko: '튜닝안', en: 'Candidate', ja: 'チューニング案', zh: '调优方案' },
  'col.risk': { ko: '위험도', en: 'Risk', ja: 'リスク', zh: '风险' },
  'col.rank': { ko: '순위', en: 'Rank', ja: '順位', zh: '排名' },
  'col.verdictShort': { ko: '결과', en: 'Result', ja: '結果', zh: '结果' },
  'col.medianMs': { ko: '중앙값(ms)', en: 'Median (ms)', ja: '中央値(ms)', zh: '中位数(ms)' },
  'col.rows': { ko: '행수', en: 'Rows', ja: '行数', zh: '行数' },
  'col.reason': { ko: '사유', en: 'Reason', ja: '理由', zh: '原因' },
  'col.type': { ko: '유형', en: 'Type', ja: '種類', zh: '类型' },
  'col.change': { ko: '무엇이 바뀌나', en: 'What changes', ja: '変更点', zh: '变化内容' },
  'col.status': { ko: '상태', en: 'Status', ja: '状態', zh: '状态' },
  'col.tags': { ko: '태그', en: 'Tags', ja: 'タグ', zh: '标签' },
  'col.updated': { ko: '수정일시', en: 'Updated', ja: '更新日時', zh: '更新时间' },
  'col.connection': { ko: '접속', en: 'Connection', ja: '接続', zh: '连接' },
  'col.item': { ko: '항목', en: 'Item', ja: '項目', zh: '项目' },
  'col.value': { ko: '값', en: 'Value', ja: '値', zh: '值' },
  'col.desc': { ko: '설명', en: 'Description', ja: '説明', zh: '说明' },
  'col.grade': { ko: '판정', en: 'Grade', ja: '判定', zh: '判定' },
  'col.scorePct': { ko: '종합개선%', en: 'Overall %', ja: '総合改善%', zh: '综合改善%' },
  'col.timePct': { ko: '시간개선%', en: 'Time %', ja: '時間改善%', zh: '时间改善%' },
  'col.readPct': { ko: '읽기개선%', en: 'Reads %', ja: '読取改善%', zh: '读取改善%' },
  'col.logicalReads': { ko: '논리읽기', en: 'Logical reads', ja: '論理読取', zh: '逻辑读' },
  'col.costPct': { ko: '비용개선%', en: 'Cost %', ja: 'コスト改善%', zh: '成本改善%' },
  'col.spreadPct': { ko: '편차%', en: 'Spread %', ja: 'ばらつき%', zh: '偏差%' },
  'col.excludeReason': { ko: '제외 사유', en: 'Excluded because', ja: '除外理由', zh: '排除原因' },
  'col.errorMsg': { ko: '오류 메시지', en: 'Error message', ja: 'エラーメッセージ', zh: '错误信息' },

  // ── 푸터 ──
  'footer.rights': { ko: 'All rights reserved.', en: 'All rights reserved.', ja: 'All rights reserved.', zh: 'All rights reserved.' },

  // ── 공용 단위·오류 (util.js / api.js) ──
  'unit.min': { ko: '{v} 분', en: '{v} min', ja: '{v} 分', zh: '{v} 分钟' },
  'unit.sec': { ko: '{v} 초', en: '{v} s', ja: '{v} 秒', zh: '{v} 秒' },
  'common.unknownError': { ko: '알 수 없는 오류', en: 'Unknown error', ja: '不明なエラー', zh: '未知错误' },
  'common.serverUnreachable': { ko: '서버에 연결할 수 없습니다 ({msg}). 서버가 떠 있는지 확인하세요.', en: 'Cannot reach the server ({msg}). Check that the server is running.', ja: 'サーバーに接続できません ({msg})。サーバーが起動しているか確認してください。', zh: '无法连接到服务器 ({msg})。请确认服务器已启动。' },

  // ── 편집기 (editor.js) ──
  'ed.aria': { ko: '{name} 편집기', en: '{name} editor', ja: '{name} エディター', zh: '{name} 编辑器' },

  // ── SQL 목록 트리 (library.js) ──
  'lib.leafTip': { ko: '(더블클릭: 튜닝 전으로 열기)', en: '(Double-click: open as Original SQL)', ja: '(ダブルクリック: チューニング前として開く)', zh: '(双击: 作为调优前打开)' },

  // ── 기동·부팅 메시지 (app.js) ──
  'boot.started': { ko: 'Oracle Tuner 시작', en: 'Oracle Tuner started', ja: 'Oracle Tuner を開始しました', zh: 'Oracle Tuner 已启动' },
  'boot.swFail': { ko: '서비스워커 등록 실패: {msg}', en: 'Service worker registration failed: {msg}', ja: 'サービスワーカーの登録に失敗しました: {msg}', zh: 'Service Worker 注册失败: {msg}' },
  'boot.degraded': { ko: '이 계정에서 제한되는 기능 {n}건 — 상단 배지에 마우스를 올리면 목록이 보입니다.', en: '{n} feature(s) are limited for this account — hover the badge at the top to see the list.', ja: 'このアカウントで制限される機能が {n} 件あります — 上部のバッジにマウスを乗せると一覧が表示されます。', zh: '此账号有 {n} 项功能受限 — 将鼠标悬停在顶部徽章上可查看列表。' },
  'boot.tiers': { ko: '가능 수준 — 계획: {plan} / 계측: {runtime} / 딕셔너리: {dict}', en: 'Capability level — Plan: {plan} / Metrics: {runtime} / Dictionary: {dict}', ja: '利用可能レベル — 実行計画: {plan} / 計測: {runtime} / ディクショナリ: {dict}', zh: '可用级别 — 执行计划: {plan} / 度量: {runtime} / 数据字典: {dict}' },
  'boot.bridgeStarting': { ko: '기동 중', en: 'starting', ja: '起動中', zh: '正在启动' },
  'boot.bridgeNotReady': { ko: 'JDBC 브리지가 아직 준비되지 않았습니다: {msg}', en: 'The JDBC bridge is not ready yet: {msg}', ja: 'JDBC ブリッジがまだ準備できていません: {msg}', zh: 'JDBC 桥接尚未就绪: {msg}' },
  'boot.bridgeReady': { ko: 'JDBC 브리지 준비됨 (pid {pid})', en: 'JDBC bridge ready (pid {pid})', ja: 'JDBC ブリッジ準備完了 (pid {pid})', zh: 'JDBC 桥接已就绪 (pid {pid})' },
  'boot.healthFail': { ko: '서버 상태 확인 실패: {msg}', en: 'Failed to check server status: {msg}', ja: 'サーバー状態の確認に失敗しました: {msg}', zh: '检查服务器状态失败: {msg}' },
  'boot.configCheck': { ko: '설정 확인이 필요합니다: {items}', en: 'Settings need attention: {items}', ja: '設定の確認が必要です: {items}', zh: '需要检查设置: {items}' },
  'boot.configFail': { ko: '설정 조회 실패: {msg}', en: 'Failed to load settings: {msg}', ja: '設定の取得に失敗しました: {msg}', zh: '读取设置失败: {msg}' },
  'boot.sessionRestored': { ko: '접속 복원됨: {name}', en: 'Connection restored: {name}', ja: '接続を復元しました: {name}', zh: '已恢复连接: {name}' },
  'boot.sessionRestoreFail': { ko: '세션 복원 시도 실패: {msg}', en: 'Failed to restore the session: {msg}', ja: 'セッションの復元に失敗しました: {msg}', zh: '恢复会话失败: {msg}' },
  'boot.needConnection': { ko: '먼저 DB 접속 정보를 등록하세요.', en: 'Register a database connection first.', ja: 'まず DB 接続情報を登録してください。', zh: '请先注册数据库连接信息。' },
  'boot.initFail': { ko: '초기화 실패: {msg}', en: 'Initialization failed: {msg}', ja: '初期化に失敗しました: {msg}', zh: '初始化失败: {msg}' },

  // ── 그리드 공통 (gridkit.js) ──
  'grid.noResultSet': { ko: '표시할 결과 집합이 없습니다.', en: 'No result set to display.', ja: '表示する結果セットがありません。', zh: '没有可显示的结果集。' },
  'grid.noPlan': { ko: '실행계획이 없습니다.', en: 'No execution plan.', ja: '実行計画がありません。', zh: '没有执行计划。' },
  'grid.noFindings': { ko: '지적사항이 없습니다. 정적 규칙 기준으로는 문제가 발견되지 않았습니다.', en: 'No findings. Nothing was flagged by the static rules.', ja: '指摘事項はありません。静的ルールでは問題は見つかりませんでした。', zh: '没有发现问题。静态规则未检出任何问题。' },
  'grid.noChartData': { ko: '차트로 표시할 수치가 없습니다.', en: 'No values to chart.', ja: 'グラフに表示する数値がありません。', zh: '没有可用于绘图的数值。' },
  'grid.chartFail': { ko: '차트를 그릴 수 없습니다: {msg}', en: 'Cannot draw the chart: {msg}', ja: 'グラフを描画できません: {msg}', zh: '无法绘制图表: {msg}' },
  'grid.noData': { ko: '조회된 자료가 없습니다.', en: 'No data returned.', ja: '取得されたデータがありません。', zh: '未查询到数据。' },
  'col.signal': { ko: '신호', en: 'Signals', ja: 'シグナル', zh: '信号' },
  'col.metric': { ko: '지표', en: 'Metric', ja: '指標', zh: '指标' },
  'common.expand': { ko: '크게 보기', en: 'Enlarge', ja: '拡大表示', zh: '放大查看' },

  // ── 실행계획 상세 패널 (gridkit.js) ──
  'pd.access': { ko: '접근 술어 (ACCESS)', en: 'Access predicates (ACCESS)', ja: 'アクセス述語 (ACCESS)', zh: '访问谓词 (ACCESS)' },
  'pd.filter': { ko: '필터 술어 (FILTER)', en: 'Filter predicates (FILTER)', ja: 'フィルタ述語 (FILTER)', zh: '过滤谓词 (FILTER)' },
  'pd.projection': { ko: '프로젝션', en: 'Projection', ja: 'プロジェクション', zh: '投影' },
  'pd.qblock': { ko: '질의 블록', en: 'Query block', ja: 'クエリブロック', zh: '查询块' },
  'pd.alias': { ko: '객체 별칭', en: 'Object alias', ja: 'オブジェクト別名', zh: '对象别名' },
  'pd.partition': { ko: '파티션', en: 'Partition', ja: 'パーティション', zh: '分区' },
  'pd.distribution': { ko: '분산 방식', en: 'Distribution', ja: '分散方式', zh: '分布方式' },
  'pd.estimates': { ko: '추정치', en: 'Estimates', ja: '推定値', zh: '估算值' },
  'pd.estimatesValue': { ko: '행 {rows} · 바이트 {bytes} · 비용 {cost} · CPU {cpu} · IO {io} · 임시공간 {temp}', en: 'Rows {rows} · Bytes {bytes} · Cost {cost} · CPU {cpu} · IO {io} · Temp {temp}', ja: '行 {rows} · バイト {bytes} · コスト {cost} · CPU {cpu} · IO {io} · 一時領域 {temp}', zh: '行 {rows} · 字节 {bytes} · 成本 {cost} · CPU {cpu} · IO {io} · 临时空间 {temp}' },

  // ── 지적사항 상세 패널 (gridkit.js) ──
  'fd.why': { ko: '왜 문제인가', en: 'Why this matters', ja: 'なぜ問題なのか', zh: '为什么这是问题' },
  'fd.how': { ko: '어떻게 고치나', en: 'How to fix it', ja: 'どう直すか', zh: '如何修复' },
  'fd.location': { ko: '해당 위치', en: 'Location', ja: '該当箇所', zh: '相关位置' },
  'fd.atLine': { ko: ' ({n}번째 줄)', en: ' (line {n})', ja: ' ({n} 行目)', zh: ' (第 {n} 行)' },
  'fd.autoFix': { ko: '자동 수정 적용', en: 'Apply auto-fix', ja: '自動修正を適用', zh: '应用自动修复' },

  // ── 튜닝 이력 (history.js) ──
  'col.verdictCheck': { ko: '결과검증', en: 'Result check', ja: '結果検証', zh: '结果验证' },
  'col.beforeMs': { ko: '전(ms)', en: 'Before (ms)', ja: '前(ms)', zh: '前(ms)' },
  'col.afterMs': { ko: '후(ms)', en: 'After (ms)', ja: '後(ms)', zh: '后(ms)' },
  'col.findings': { ko: '지적', en: 'Findings', ja: '指摘', zh: '问题' },
  'hist.count': { ko: '{n}건', en: '{n} record(s)', ja: '{n} 件', zh: '{n} 条' },
  'hist.tagSummary': { ko: ' · 태그 {tags}', en: ' · Tags {tags}', ja: ' · タグ {tags}', zh: ' · 标签 {tags}' },
  'hist.noSearchTitle': { ko: '검색 결과가 없습니다', en: 'No search results', ja: '検索結果がありません', zh: '没有搜索结果' },
  'hist.noSearchDesc': { ko: '검색어나 상태 필터를 바꿔보세요.', en: 'Try a different search term or status filter.', ja: '検索語や状態フィルタを変えてみてください。', zh: '请尝试更换搜索词或状态筛选。' },
  'hist.emptyTitle': { ko: '아직 저장된 튜닝 기록이 없습니다', en: 'No tuning records saved yet', ja: 'まだ保存されたチューニング記録がありません', zh: '尚未保存任何调优记录' },
  'hist.emptyDesc': { ko: '튜닝 이력은 <b>전/후 SQL·실행계획·검증 결과</b>를 한 건으로 묶어 파일로 남긴 기록입니다.<br>아래 순서로 첫 기록을 만들어 보세요:', en: 'A tuning record bundles the <b>before/after SQL, execution plans, and verification result</b> into a single file.<br>Create your first record like this:', ja: 'チューニング履歴は <b>前後の SQL・実行計画・検証結果</b> を 1 件にまとめてファイルに残した記録です。<br>次の手順で最初の記録を作ってみてください:', zh: '调优历史是把 <b>调优前后的 SQL、执行计划、验证结果</b> 打包成一条记录保存的文件。<br>请按以下步骤创建第一条记录:' },
  'hist.emptyStep1': { ko: '<b>워크벤치</b> 탭에서 튜닝 전/후 SQL 을 작성합니다.', en: 'Write the before/after SQL on the <b>Workbench</b> tab.', ja: '<b>ワークベンチ</b> タブでチューニング前後の SQL を作成します。', zh: '在 <b>工作台</b> 标签页编写调优前后的 SQL。' },
  'hist.emptyStep2': { ko: '<b>비교 검증</b>(Ctrl+Shift+K) 또는 <b>튜닝 후보</b> 토너먼트로 효과를 확인합니다.', en: 'Check the effect with <b>Compare</b> (Ctrl+Shift+K) or the <b>Candidates</b> tournament.', ja: '<b>比較検証</b>(Ctrl+Shift+K) または <b>チューニング候補</b> トーナメントで効果を確認します。', zh: '通过 <b>对比验证</b>(Ctrl+Shift+K) 或 <b>调优候选</b> 锦标赛确认效果。' },
  'hist.emptyStep3': { ko: '결과 영역 오른쪽 위 <b>[튜닝 저장]</b> 버튼을 누릅니다.', en: 'Click the <b>[Save tuning]</b> button at the top right of the result area.', ja: '結果領域の右上にある <b>[チューニング保存]</b> ボタンを押します。', zh: '点击结果区域右上角的 <b>[保存调优]</b> 按钮。' },
  'hist.emptyStep4': { ko: '여기 목록에 나타나고, 행을 펼치면 상세·내보내기·다시 불러오기가 됩니다.', en: 'It appears in this list; expand a row for details, export, and reload.', ja: 'この一覧に表示され、行を展開すると詳細・エクスポート・再読み込みができます。', zh: '它会出现在此列表中，展开行可查看详情、导出并重新载入。' },
  'hist.goWorkbench': { ko: '워크벤치로 가기', en: 'Go to Workbench', ja: 'ワークベンチへ移動', zh: '前往工作台' },
  'hist.loading': { ko: '불러오는 중…', en: 'Loading…', ja: '読み込み中…', zh: '正在加载…' },
  'hist.summary': { ko: '요약', en: 'Summary', ja: '概要', zh: '摘要' },
  'hist.summaryStatus': { ko: '상태', en: 'Status', ja: '状態', zh: '状态' },
  'hist.summaryVerify': { ko: '검증', en: 'Verification', ja: '検証', zh: '验证' },
  'hist.summaryPerf': { ko: '성능', en: 'Performance', ja: '性能', zh: '性能' },
  'hist.summaryFindings': { ko: '지적 {n}건', en: '{n} finding(s)', ja: '指摘 {n} 件', zh: '问题 {n} 项' },
  'hist.summaryCreated': { ko: '작성 {date}', en: 'Created {date}', ja: '作成 {date}', zh: '创建 {date}' },
  'hist.memo': { ko: '메모', en: 'Note', ja: 'メモ', zh: '备注' },
  'hist.loadToWb': { ko: '워크벤치로 불러오기', en: 'Load into Workbench', ja: 'ワークベンチに読み込む', zh: '载入工作台' },
  'hist.exportMd': { ko: 'Markdown 보고서', en: 'Markdown report', ja: 'Markdown レポート', zh: 'Markdown 报告' },
  'hist.exportSql': { ko: '.sql 파일', en: '.sql file', ja: '.sql ファイル', zh: '.sql 文件' },
  'hist.loaded': { ko: '"{title}" 을(를) 워크벤치로 불러왔습니다.', en: 'Loaded "{title}" into the Workbench.', ja: '"{title}" をワークベンチに読み込みました。', zh: '已将 "{title}" 载入工作台。' },
  'hist.deleteConfirm': { ko: '"{title}" 을(를) 삭제할까요?\n(삭제해도 data/tunings/.trash 에 백업본이 남습니다)', en: 'Delete "{title}"?\n(A backup is kept in data/tunings/.trash)', ja: '"{title}" を削除しますか?\n(削除しても data/tunings/.trash にバックアップが残ります)', zh: '要删除 "{title}" 吗?\n(删除后仍会在 data/tunings/.trash 中保留备份)' },
  'hist.deleted': { ko: '삭제했습니다.', en: 'Deleted.', ja: '削除しました。', zh: '已删除。' },
  'hist.titleGuess': { ko: '{tables} {type} 튜닝 ({stamp})', en: '{tables} {type} tuning ({stamp})', ja: '{tables} {type} チューニング ({stamp})', zh: '{tables} {type} 调优 ({stamp})' },
  'hist.titleGuessNoTable': { ko: '{type} 튜닝 ({stamp})', en: '{type} tuning ({stamp})', ja: '{type} チューニング ({stamp})', zh: '{type} 调优 ({stamp})' },
  'hist.snippetSaveFail': { ko: 'SQL 자동 저장 실패(튜닝만 저장): {msg}', en: 'Auto-saving the SQL failed (tuning saved only): {msg}', ja: 'SQL の自動保存に失敗しました(チューニングのみ保存): {msg}', zh: 'SQL 自动保存失败(仅保存调优): {msg}' },
  'hist.savedLog': { ko: '튜닝 저장 {id} ({title}){link}', en: 'Tuning saved {id} ({title}){link}', ja: 'チューニング保存 {id} ({title}){link}', zh: '已保存调优 {id} ({title}){link}' },

  // ── 튜닝 후보 / 토너먼트 (candidates.js) ──
  'grade.none': { ko: '후보 없음', en: 'No candidate', ja: '候補なし', zh: '无候选' },
  'cd.needSql': { ko: '원본 SQL 이 비어 있습니다.', en: 'The original SQL is empty.', ja: '元の SQL が空です。', zh: '原始 SQL 为空。' },
  'cd.genSummary': { ko: '후보 <b>{n}</b>개 생성', en: '<b>{n}</b> candidate(s) generated', ja: '候補 <b>{n}</b> 件を生成', zh: '已生成 <b>{n}</b> 个候选' },
  'cd.genSummaryTotal': { ko: ' <span class="muted">(전체 {total}개 중)</span>', en: ' <span class="muted">(out of {total})</span>', ja: ' <span class="muted">(全 {total} 件中)</span>', zh: ' <span class="muted">(共 {total} 个中)</span>' },
  'cd.genUsedDb': { ko: ' · DB 정보 반영', en: ' · Using DB info', ja: ' · DB 情報を反映', zh: ' · 已参考数据库信息' },
  'cd.genNoDb': { ko: ' · <span class="muted">문장만 보고 생성(미접속)</span>', en: ' · <span class="muted">Generated from the statement only (not connected)</span>', ja: ' · <span class="muted">文のみから生成(未接続)</span>', zh: ' · <span class="muted">仅根据语句生成(未连接)</span>' },
  'cd.genLog': { ko: '튜닝 후보 {n}개 생성', en: 'Generated {n} tuning candidate(s)', ja: 'チューニング候補 {n} 件を生成', zh: '已生成 {n} 个调优候选' },
  'cd.connectForBetter': { ko: '접속하면 인덱스·컬럼타입을 참고해 더 정확한 후보를 만들고, 실제로 재볼 수 있습니다.', en: 'If you connect, candidates can use indexes and column types for better accuracy, and can actually be measured.', ja: '接続すると、インデックスや列型を参考により正確な候補を作り、実際に計測できます。', zh: '连接后可参考索引和列类型生成更准确的候选，并进行实际测量。' },
  'cd.generating': { ko: '생성 중…', en: 'Generating…', ja: '生成中…', zh: '正在生成…' },
  'cd.noneFound': { ko: '이 SQL 에서 자동으로 만들 수 있는 튜닝안을 찾지 못했습니다. [진단] 탭의 지적사항을 참고해 직접 수정해 보세요.', en: 'No tuning candidate could be generated automatically for this SQL. Use the findings on the [Diagnosis] tab and revise it yourself.', ja: 'この SQL から自動生成できるチューニング案は見つかりませんでした。[診断] タブの指摘事項を参考に手動で修正してみてください。', zh: '未能为此 SQL 自动生成调优方案。请参考 [诊断] 标签页的问题自行修改。' },
  'cd.pendingTitle': { ko: '후보 {n}개를 만들었습니다 — 아직 실행하지 않았습니다', en: 'Generated {n} candidate(s) — not run yet', ja: '候補 {n} 件を作成しました — まだ実行していません', zh: '已生成 {n} 个候选 — 尚未执行' },
  'cd.pendingDesc': { ko: '[토너먼트 실행] 을 누르면 원본과 번갈아 실행해 실제 성능과 결과 동일성을 재고 순위를 매깁니다. 예상 실행 횟수: 약 {total}회', en: 'Press [Run tournament] to run them alternately with the original, measure real performance and result equivalence, and rank them. Estimated runs: about {total}.', ja: '[トーナメント実行] を押すと、元の SQL と交互に実行して実際の性能と結果の同一性を測り、順位を付けます。予想実行回数: 約 {total} 回', zh: '点击 [运行竞赛] 后，将与原始 SQL 交替执行，测量实际性能与结果一致性并排名。预计执行次数: 约 {total} 次' },
  'cd.needConnect': { ko: '토너먼트는 실제 실행이 필요합니다. 먼저 DB 에 접속하세요.', en: 'A tournament requires actual execution. Connect to a database first.', ja: 'トーナメントには実際の実行が必要です。まず DB に接続してください。', zh: '竞赛需要实际执行。请先连接数据库。' },
  'cd.runConfirm': { ko: '원본과 후보 {n}개를 {runs}회전(워밍업 {warmup}회) 번갈아 실행합니다.\n총 실행 횟수는 약 {total}회입니다.\n\n조회(SELECT)가 아니면 데이터가 바뀔 수 있으니 주의하세요. 진행할까요?', en: 'The original and {n} candidate(s) will run alternately for {runs} round(s) ({warmup} warmup run(s)).\nTotal runs: about {total}.\n\nIf the statement is not a SELECT, data may change. Proceed?', ja: '元の SQL と候補 {n} 件を {runs} 回転(ウォームアップ {warmup} 回)交互に実行します。\n総実行回数は約 {total} 回です。\n\n照会(SELECT)でない場合はデータが変わる可能性があるのでご注意ください。進めますか?', zh: '将原始 SQL 与 {n} 个候选交替执行 {runs} 轮(预热 {warmup} 次)。\n总执行次数约 {total} 次。\n\n如果不是查询(SELECT)语句，数据可能会被更改，请注意。是否继续?' },
  'cd.resultSummary': { ko: '유효 <b>{ok}</b> · 결과불일치 {rejected} · 실행실패 {failed}', en: 'Valid <b>{ok}</b> · Result mismatch {rejected} · Failed {failed}', ja: '有効 <b>{ok}</b> · 結果不一致 {rejected} · 実行失敗 {failed}', zh: '有效 <b>{ok}</b> · 结果不一致 {rejected} · 执行失败 {failed}' },
  'cd.resultSummaryRuns': { ko: ' · {runs}회전', en: ' · {runs} round(s)', ja: ' · {runs} 回転', zh: ' · {runs} 轮' },
  'cd.doneLog': { ko: '토너먼트 완료 — {headline}', en: 'Tournament finished — {headline}', ja: 'トーナメント完了 — {headline}', zh: '竞赛完成 — {headline}' },
  'cd.failLog': { ko: '토너먼트 실패: {msg}', en: 'Tournament failed: {msg}', ja: 'トーナメント失敗: {msg}', zh: '竞赛失败: {msg}' },
  'cd.measuring': { ko: '측정 중…', en: 'Measuring…', ja: '計測中…', zh: '正在测量…' },
  'cd.adoptTop': { ko: '1순위 채택', en: 'Adopt rank 1', ja: '1 位を採用', zh: '采用第 1 名' },
  'cd.baseTime': { ko: '원본 응답시간 (중앙값)', en: 'Original response time (median)', ja: '元の応答時間 (中央値)', zh: '原始响应时间 (中位数)' },
  'cd.baseTimeSub': { ko: '{runs}회전 측정', en: 'Measured over {runs} round(s)', ja: '{runs} 回転で計測', zh: '测量 {runs} 轮' },
  'cd.baseReads': { ko: '원본 논리적 읽기', en: 'Original logical reads', ja: '元の論理読取', zh: '原始逻辑读' },
  'cd.notMeasurable': { ko: '측정 불가', en: 'Not measurable', ja: '計測不可', zh: '无法测量' },
  'cd.noMystat': { ko: 'V$MYSTAT 권한 없음', en: 'No V$MYSTAT privilege', ja: 'V$MYSTAT 権限なし', zh: '无 V$MYSTAT 权限' },
  'cd.readsSub': { ko: '읽은 블록 수 — 부하의 실제 척도', en: 'Blocks read — the real measure of load', ja: '読み取ったブロック数 — 負荷の実際の尺度', zh: '读取的块数 — 负载的真实衡量标准' },
  'cd.baseCost': { ko: '원본 옵티마이저 비용', en: 'Original optimizer cost', ja: '元のオプティマイザコスト', zh: '原始优化器成本' },
  'cd.notAvailable': { ko: '조회 불가', en: 'Not available', ja: '取得不可', zh: '无法获取' },
  'cd.costSub': { ko: '추정치(실측 아님)', en: 'Estimate (not measured)', ja: '推定値(実測ではない)', zh: '估算值(非实测)' },
  'cd.baseRows': { ko: '원본 결과 행수', en: 'Original row count', ja: '元の結果行数', zh: '原始结果行数' },
  'cd.rowsSub': { ko: '이 행수를 기준으로 동일성을 판정', en: 'Equivalence is judged against this row count', ja: 'この行数を基準に同一性を判定', zh: '以此行数为基准判定一致性' },
  'cd.chartLabel': { ko: '응답시간 비교 (ms, 낮을수록 좋음) — 원본 vs 상위 후보', en: 'Response time comparison (ms, lower is better) — original vs top candidates', ja: '応答時間の比較 (ms, 低いほど良い) — 元の SQL と上位候補', zh: '响应时间对比 (ms, 越低越好) — 原始 vs 前列候选' },
  'cd.original': { ko: '원본', en: 'Original', ja: '元の SQL', zh: '原始' },
  'cd.chartBefore': { ko: '원본 기준', en: 'Original baseline', ja: '元の SQL 基準', zh: '原始基准' },
  'cd.chartAfter': { ko: '각 안', en: 'Each candidate', ja: '各候補', zh: '各候选' },
  'cd.rankHeading': { ko: '순위 (결과 동일성 통과 {n}건)', en: 'Ranking ({n} passed result equivalence)', ja: '順位 (結果同一性を通過 {n} 件)', zh: '排名 (通过结果一致性 {n} 项)' },
  'cd.noPassed': { ko: '결과 동일성을 통과한 후보가 없습니다.', en: 'No candidate passed result equivalence.', ja: '結果の同一性を通過した候補はありません。', zh: '没有候选通过结果一致性检查。' },
  'cd.rejectedHeading': { ko: '결과가 달라 제외된 후보 ({n}건)', en: 'Candidates excluded for different results ({n})', ja: '結果が異なるため除外された候補 ({n} 件)', zh: '因结果不同而被排除的候选 ({n} 项)' },
  'cd.rejectedNote': { ko: '이 후보들은 <b>빠를 수는 있어도 결과가 다릅니다</b>. 업무 의미를 확인하기 전에는 적용하면 안 됩니다. 다만 원본 쪽이 틀렸을 가능성도 있으니(예: ROWNUM + ORDER BY) 어느 쪽이 옳은지 판단해 보세요.', en: 'These candidates <b>may be faster, but their results differ</b>. Do not apply them before checking the business meaning. That said, the original may be the wrong one (e.g. ROWNUM + ORDER BY), so decide which side is correct.', ja: 'これらの候補は <b>速くても結果が異なります</b>。業務上の意味を確認するまで適用してはいけません。ただし元の SQL の方が誤っている可能性もあるため(例: ROWNUM + ORDER BY)、どちらが正しいか判断してください。', zh: '这些候选 <b>可能更快，但结果不同</b>。在确认业务含义之前不应采用。不过原始 SQL 也可能是错的(例如 ROWNUM + ORDER BY)，请判断哪一方才正确。' },
  'cd.failedHeading': { ko: '실행하지 못한 후보 ({n}건)', en: 'Candidates that failed to run ({n})', ja: '実行できなかった候補 ({n} 件)', zh: '未能执行的候选 ({n} 项)' },
  'cd.failedNote': { ko: '자동 생성한 변환이 이 SQL 구조에는 맞지 않았다는 뜻입니다. 다른 후보의 결과에는 영향이 없습니다.', en: 'It means the auto-generated rewrite did not fit this SQL structure. Other candidates are unaffected.', ja: '自動生成した変換がこの SQL の構造に合わなかったという意味です。他の候補の結果には影響しません。', zh: '这表示自动生成的改写不适用于此 SQL 结构。不影响其他候选的结果。' },
  'cd.skippedHeading': { ko: '생성 단계에서 제외된 항목 ({n}건)', en: 'Items skipped during generation ({n})', ja: '生成段階で除外された項目 ({n} 件)', zh: '生成阶段被排除的项目 ({n} 项)' },
  'cd.adoptFail': { ko: '채택할 SQL 을 찾지 못했습니다.', en: 'Could not find the SQL to adopt.', ja: '採用する SQL が見つかりませんでした。', zh: '未找到要采用的 SQL。' },
  'cd.adopted': { ko: '"{title}" 을(를) 튜닝 후 편집기에 넣었습니다.', en: 'Put "{title}" into the Tuned SQL editor.', ja: '"{title}" をチューニング後エディターに入れました。', zh: '已将 "{title}" 放入调优后编辑器。' },
  'cd.adoptLog': { ko: '후보 채택: {id} — {title}', en: 'Candidate adopted: {id} — {title}', ja: '候補を採用: {id} — {title}', zh: '采用候选: {id} — {title}' },
  'cd.runNo': { ko: '회차', en: 'Run', ja: '回', zh: '轮次' },
  'cd.runSlot': { ko: '순번', en: 'Slot', ja: '順番', zh: '顺序' },
  'cd.runTotal': { ko: '합계(ms)', en: 'Total (ms)', ja: '合計(ms)', zh: '合计(ms)' },
  'cd.runExec': { ko: '실행(ms)', en: 'Execute (ms)', ja: '実行(ms)', zh: '执行(ms)' },
  'cd.runFetch': { ko: '인출(ms)', en: 'Fetch (ms)', ja: 'フェッチ(ms)', zh: '提取(ms)' },
  'cd.baseRuns': { ko: '원본 회차별 (비교용)', en: 'Original per-run (for comparison)', ja: '元の SQL の回ごと (比較用)', zh: '原始各轮 (用于对比)' },
  'cd.execError': { ko: '실행 오류', en: 'Execution error', ja: '実行エラー', zh: '执行错误' },
  'cd.whyTry': { ko: '왜 이걸 시도하나', en: 'Why try this', ja: 'なぜこれを試すのか', zh: '为什么尝试这个' },
  'cd.whenEffective': { ko: '언제 효과가 있나', en: 'When it helps', ja: 'どんなときに効くのか', zh: '什么情况下有效' },
  'cd.caution': { ko: '주의', en: 'Caution', ja: '注意', zh: '注意' },
  'cd.changed': { ko: '바뀐 내용', en: 'What changed', ja: '変更内容', zh: '变更内容' },
  'cd.measured': { ko: '측정 결과', en: 'Measurement', ja: '計測結果', zh: '测量结果' },
  'cd.mScore': { ko: '종합 개선 <b>{score}%</b> <span class="muted">({basis})</span>', en: 'Overall improvement <b>{score}%</b> <span class="muted">({basis})</span>', ja: '総合改善 <b>{score}%</b> <span class="muted">({basis})</span>', zh: '综合改善 <b>{score}%</b> <span class="muted">({basis})</span>' },
  'cd.mTimeLabel': { ko: '응답시간 중앙값', en: 'Median response time', ja: '応答時間の中央値', zh: '响应时间中位数' },
  'cd.mReadsLabel': { ko: '논리적 읽기', en: 'Logical reads', ja: '論理読取', zh: '逻辑读' },
  'cd.mCostLabel': { ko: '옵티마이저 비용', en: 'Optimizer cost', ja: 'オプティマイザコスト', zh: '优化器成本' },
  'cd.mImprove': { ko: '({pct}% 개선)', en: '({pct}% better)', ja: '({pct}% 改善)', zh: '(改善 {pct}%)' },
  'cd.mRowsSpread': { ko: '결과 행수 {rows} · 회차 편차 {spread}', en: 'Row count {rows} · Run spread {spread}', ja: '結果行数 {rows} · 回ごとのばらつき {spread}', zh: '结果行数 {rows} · 轮次偏差 {spread}' },
  'cd.mUnstable': { ko: ' <span style="color:var(--warn)">(편차가 커서 감점됨)</span>', en: ' <span style="color:var(--warn)">(penalized for high spread)</span>', ja: ' <span style="color:var(--warn)">(ばらつきが大きく減点)</span>', zh: ' <span style="color:var(--warn)">(偏差过大而扣分)</span>' },
  'cd.runsDetail': { ko: '회차별 실측', en: 'Per-run measurements', ja: '回ごとの実測', zh: '各轮实测' },
  'cd.candSql': { ko: '이 후보의 SQL', en: 'SQL of this candidate', ja: 'この候補の SQL', zh: '此候选的 SQL' },

  // ── 워크벤치 — 편집기 메타 (workbench.js) ──
  'wb.metaStmts': { ko: '{n}개 문장', en: '{n} statement(s)', ja: '{n} 文', zh: '{n} 条语句' },
  'wb.metaCurrent': { ko: '현재: {type}', en: 'Current: {type}', ja: '現在: {type}', zh: '当前: {type}' },
  'wb.metaLines': { ko: '{n}줄', en: '{n} line(s)', ja: '{n} 行', zh: '{n} 行' },
  'wb.metaBinds': { ko: '바인드 {n}개', en: '{n} bind(s)', ja: 'バインド {n} 個', zh: '绑定变量 {n} 个' },
  'wb.metaSubs': { ko: '치환변수 {vars}', en: 'Substitutions {vars}', ja: '置換変数 {vars}', zh: '替换变量 {vars}' },
  'wb.copiedToAfter': { ko: '튜닝 후 편집기로 복사했습니다.', en: 'Copied to the Tuned SQL editor.', ja: 'チューニング後エディターにコピーしました。', zh: '已复制到调优后编辑器。' },
  'wb.actionFail': { ko: '{act} 실패: {msg}', en: '{act} failed: {msg}', ja: '{act} 失敗: {msg}', zh: '{act} 失败: {msg}' },
  'wb.notConnected': { ko: 'DB 에 접속되어 있지 않습니다.', en: 'Not connected to a database.', ja: 'DB に接続されていません。', zh: '未连接到数据库。' },
  'wb.sideBefore': { ko: '전', en: 'Before', ja: '前', zh: '前' },
  'wb.sideAfter': { ko: '후', en: 'After', ja: '後', zh: '后' },

  // ── 워크벤치 — 실행 ──
  'wb.noStmtRun': { ko: '실행할 문장이 없습니다.', en: 'There is no statement to run.', ja: '実行する文がありません。', zh: '没有可执行的语句。' },
  'wb.runLog': { ko: '[{side}] 실행: {sql}', en: '[{side}] Run: {sql}', ja: '[{side}] 実行: {sql}', zh: '[{side}] 执行: {sql}' },
  'wb.affected': { ko: '<b>{n}행</b> 영향 · {ms}', en: '<b>{n} row(s)</b> affected · {ms}', ja: '<b>{n} 行</b> 影響 · {ms}', zh: '影响 <b>{n} 行</b> · {ms}' },
  'wb.rolledBack': { ko: ' · <span style="color:var(--warn)">안전모드로 자동 롤백됨</span>', en: ' · <span style="color:var(--warn)">Auto-rolled back by safe mode</span>', ja: ' · <span style="color:var(--warn)">安全モードで自動ロールバックされました</span>', zh: ' · <span style="color:var(--warn)">安全模式已自动回滚</span>' },
  'wb.notCommitted': { ko: ' · <b style="color:var(--danger)">커밋되지 않음(수동 커밋 필요)</b>', en: ' · <b style="color:var(--danger)">Not committed (manual commit required)</b>', ja: ' · <b style="color:var(--danger)">コミットされていません(手動コミットが必要)</b>', zh: ' · <b style="color:var(--danger)">未提交(需手动提交)</b>' },
  'wb.autoRollbackShort': { ko: ' (자동 롤백)', en: ' (auto rollback)', ja: ' (自動ロールバック)', zh: ' (自动回滚)' },
  'wb.affectedLog': { ko: '영향 행수 {n}{note}', en: 'Affected rows {n}{note}', ja: '影響行数 {n}{note}', zh: '影响行数 {n}{note}' },
  'wb.keepTruncated': { ko: ' <span style="color:var(--warn)">(표시 상한 초과 — 일부만 보관)</span>', en: ' <span style="color:var(--warn)">(display limit exceeded — only part kept)</span>', ja: ' <span style="color:var(--warn)">(表示上限を超過 — 一部のみ保持)</span>', zh: ' <span style="color:var(--warn)">(超出显示上限 — 仅保留部分)</span>' },
  'wb.consumedKept': { ko: '<b>소비 {consumed}행</b> · 표시 {kept}행{note}', en: '<b>{consumed} row(s) consumed</b> · {kept} shown{note}', ja: '<b>消費 {consumed} 行</b> · 表示 {kept} 行{note}', zh: '<b>消耗 {consumed} 行</b> · 显示 {kept} 行{note}' },
  'wb.fetchTruncated': { ko: ' <span style="color:var(--warn)">(최대 인출 수에서 잘림)</span>', en: ' <span style="color:var(--warn)">(cut off at the max fetch count)</span>', ja: ' <span style="color:var(--warn)">(最大フェッチ数で切り捨て)</span>', zh: ' <span style="color:var(--warn)">(已在最大提取数处截断)</span>' },
  'wb.timingBreak': { ko: ' · 실행 {exec} + 인출 {fetch} = <b>{total}</b>', en: ' · Execute {exec} + Fetch {fetch} = <b>{total}</b>', ja: ' · 実行 {exec} + フェッチ {fetch} = <b>{total}</b>', zh: ' · 执行 {exec} + 提取 {fetch} = <b>{total}</b>' },
  'wb.roundTrip': { ko: ' · 왕복 {ms}', en: ' · Round trip {ms}', ja: ' · 往復 {ms}', zh: ' · 往返 {ms}' },
  'wb.statsCollected': { ko: ' · 세션통계 수집됨', en: ' · Session stats collected', ja: ' · セッション統計を収集', zh: ' · 已收集会话统计' },
  'wb.statsMissing': { ko: ' · <span class="muted">세션통계 없음(권한)</span>', en: ' · <span class="muted">No session stats (privilege)</span>', ja: ' · <span class="muted">セッション統計なし(権限)</span>', zh: ' · <span class="muted">无会话统计(权限)</span>' },
  'wb.resultLog': { ko: '소비 {consumed}행 · 표시 {kept}행 / {ms}', en: '{consumed} row(s) consumed · {kept} shown / {ms}', ja: '消費 {consumed} 行 · 表示 {kept} 行 / {ms}', zh: '消耗 {consumed} 行 · 显示 {kept} 行 / {ms}' },
  'wb.runFail': { ko: '실행 실패: {msg}', en: 'Run failed: {msg}', ja: '実行失敗: {msg}', zh: '执行失败: {msg}' },
  'wb.scriptStart': { ko: '스크립트 실행 시작 — {n}문장', en: 'Script run started — {n} statement(s)', ja: 'スクリプト実行開始 — {n} 文', zh: '脚本执行开始 — {n} 条语句' },
  'wb.scriptApplied': { ko: '{n}행 반영', en: '{n} row(s) applied', ja: '{n} 行 反映', zh: '已应用 {n} 行' },
  'wb.scriptRows': { ko: '{n}행', en: '{n} row(s)', ja: '{n} 行', zh: '{n} 行' },
  'wb.scriptFail': { ko: '스크립트 실패: {msg}', en: 'Script failed: {msg}', ja: 'スクリプト失敗: {msg}', zh: '脚本失败: {msg}' },
  'wb.running': { ko: '실행 중…', en: 'Running…', ja: '実行中…', zh: '正在执行…' },
  'wb.cancelled': { ko: '실행을 취소했습니다.', en: 'Execution cancelled.', ja: '実行を取り消しました。', zh: '已取消执行。' },
  'wb.cancelFail': { ko: '취소하지 못했습니다: {reason}', en: 'Could not cancel: {reason}', ja: '取り消せませんでした: {reason}', zh: '无法取消: {reason}' },

  // ── 워크벤치 — 실행계획 ──
  'wb.noStmtPlan': { ko: '계획을 볼 문장이 없습니다.', en: 'There is no statement to explain.', ja: '計画を見る文がありません。', zh: '没有可查看执行计划的语句。' },
  'wb.planUnavailable': { ko: '실행계획 조회 불가: {msg}', en: 'Execution plan unavailable: {msg}', ja: '実行計画を取得できません: {msg}', zh: '无法获取执行计划: {msg}' },
  'wb.planLog': { ko: '실행계획({source}) {steps}단계, 총비용 {cost}', en: 'Execution plan ({source}) {steps} step(s), total cost {cost}', ja: '実行計画({source}) {steps} 段階、総コスト {cost}', zh: '执行计划({source}) {steps} 步, 总成本 {cost}' },
  'wb.planNotQueried': { ko: '아직 조회하지 않았습니다.', en: 'Not queried yet.', ja: 'まだ取得していません。', zh: '尚未查询。' },
  'wb.planNoText': { ko: '(계획 텍스트 없음)', en: '(no plan text)', ja: '(計画テキストなし)', zh: '(无计划文本)' },
  'wb.planSource': { ko: '출처: {source}', en: 'Source: {source}', ja: '取得元: {source}', zh: '来源: {source}' },
  'wb.planTotalCost': { ko: '총 비용 {v}', en: 'Total cost {v}', ja: '総コスト {v}', zh: '总成本 {v}' },
  'wb.planEstRows': { ko: '예상 행수 {v}', en: 'Estimated rows {v}', ja: '推定行数 {v}', zh: '预估行数 {v}' },
  'wb.planSteps': { ko: '{n}단계', en: '{n} step(s)', ja: '{n} 段階', zh: '{n} 步' },
  'wb.planFullScans': { ko: '전체스캔 {n}', en: 'Full scans {n}', ja: 'フルスキャン {n}', zh: '全表扫描 {n}' },
  'wb.planCartesian': { ko: '카티션 {n}', en: 'Cartesian {n}', ja: 'デカルト積 {n}', zh: '笛卡尔积 {n}' },
  'wb.planSorts': { ko: '정렬 {n}', en: 'Sorts {n}', ja: 'ソート {n}', zh: '排序 {n}' },
  'wb.planFailed': { ko: '조회 불가 — {msg}', en: 'Not available — {msg}', ja: '取得不可 — {msg}', zh: '无法获取 — {msg}' },
  'wb.srcXplan': { ko: 'DBMS_XPLAN 표준서식', en: 'DBMS_XPLAN standard format', ja: 'DBMS_XPLAN 標準書式', zh: 'DBMS_XPLAN 标准格式' },
  'wb.srcPlanTable': { ko: '계획테이블 직접조회', en: 'Direct PLAN_TABLE query', ja: 'プランテーブル直接照会', zh: '直接查询计划表' },
  'wb.srcDisplayCursor': { ko: '실제 실행 계획', en: 'Actual execution plan', ja: '実際の実行計画', zh: '实际执行计划' },
  'wb.srcNone': { ko: '없음', en: 'None', ja: 'なし', zh: '无' },
  'wb.noVPriv': { ko: 'V$ 권한 부족', en: 'Insufficient V$ privilege', ja: 'V$ 権限不足', zh: 'V$ 权限不足' },
  'wb.actualPlanFail': { ko: '실제 계획을 볼 수 없습니다: {msg}', en: 'Cannot show the actual plan: {msg}', ja: '実際の計画を表示できません: {msg}', zh: '无法查看实际计划: {msg}' },
  'wb.displayCursorFail': { ko: 'DISPLAY_CURSOR 불가: {msg}', en: 'DISPLAY_CURSOR unavailable: {msg}', ja: 'DISPLAY_CURSOR 不可: {msg}', zh: 'DISPLAY_CURSOR 不可用: {msg}' },
  'wb.actualPlanSource': { ko: '출처: <b>실제 실행 계획(DISPLAY_CURSOR)</b> · SQL_ID {id}', en: 'Source: <b>Actual execution plan (DISPLAY_CURSOR)</b> · SQL_ID {id}', ja: '取得元: <b>実際の実行計画(DISPLAY_CURSOR)</b> · SQL_ID {id}', zh: '来源: <b>实际执行计划(DISPLAY_CURSOR)</b> · SQL_ID {id}' },
  'col.elapsedUs': { ko: '경과(us)', en: 'Elapsed (us)', ja: '経過(us)', zh: '耗时(us)' },
  'wb.actualPlanDone': { ko: '실제 실행 계획 조회 완료 (SQL_ID {id})', en: 'Actual execution plan loaded (SQL_ID {id})', ja: '実際の実行計画を取得しました (SQL_ID {id})', zh: '已获取实际执行计划 (SQL_ID {id})' },

  // ── 워크벤치 — 진단 ──
  'wb.noStmtAnalyze': { ko: '진단할 문장이 없습니다.', en: 'There is no statement to diagnose.', ja: '診断する文がありません。', zh: '没有可诊断的语句。' },
  'wb.present': { ko: '있음', en: 'yes', ja: 'あり', zh: '有' },
  'wb.absent': { ko: '없음', en: 'no', ja: 'なし', zh: '无' },
  'wb.diagSrcDb': { ko: 'DB 연동 분석 (계획 {plan}, 컬럼타입 {cols}개, 통계 {tables}개 테이블)', en: 'DB-assisted analysis (plan {plan}, {cols} column type(s), stats for {tables} table(s))', ja: 'DB 連携分析 (計画 {plan}、列型 {cols} 個、統計 {tables} テーブル)', zh: '数据库联动分析 (计划 {plan}, 列类型 {cols} 个, 统计 {tables} 个表)' },
  'wb.diagSrcStatic': { ko: '정적 분석만 (DB 미접속)', en: 'Static analysis only (not connected)', ja: '静的分析のみ (DB 未接続)', zh: '仅静态分析 (未连接数据库)' },
  'wb.diagSummary': { ko: '점수 <b>{score}</b>/100 · 지적 {total}건 (높음 {high} / 보통 {medium} / 낮음 {low} / 참고 {info}) · <span class="muted">{src}</span>', en: 'Score <b>{score}</b>/100 · {total} finding(s) (High {high} / Medium {medium} / Low {low} / Info {info}) · <span class="muted">{src}</span>', ja: 'スコア <b>{score}</b>/100 · 指摘 {total} 件 (高 {high} / 中 {medium} / 低 {low} / 参考 {info}) · <span class="muted">{src}</span>', zh: '评分 <b>{score}</b>/100 · 问题 {total} 项 (高 {high} / 中 {medium} / 低 {low} / 参考 {info}) · <span class="muted">{src}</span>' },
  'wb.diagPartialFail': { ko: ' <span class="muted" title="{detail}">· 일부 조회 실패 {n}건</span>', en: ' <span class="muted" title="{detail}">· {n} lookup(s) failed</span>', ja: ' <span class="muted" title="{detail}">· 一部の取得に失敗 {n} 件</span>', zh: ' <span class="muted" title="{detail}">· 部分查询失败 {n} 项</span>' },
  'wb.diagLog': { ko: '진단({side}): {total}건, 점수 {score}', en: 'Diagnosis ({side}): {total} finding(s), score {score}', ja: '診断({side}): {total} 件、スコア {score}', zh: '诊断({side}): {total} 项, 评分 {score}' },
  'wb.noAutoFix': { ko: '이 지적에는 자동 수정이 없습니다.', en: 'There is no auto-fix for this finding.', ja: 'この指摘には自動修正がありません。', zh: '此问题没有自动修复。' },

  // ── 워크벤치 — 편집 보조 ──
  'wb.formatted': { ko: 'SQL 을 정렬했습니다.', en: 'SQL formatted.', ja: 'SQL を整形しました。', zh: '已格式化 SQL。' },
  'wb.noStmtTarget': { ko: '대상 문장이 없습니다.', en: 'There is no target statement.', ja: '対象の文がありません。', zh: '没有目标语句。' },
  'wb.needDbForColumns': { ko: '컬럼 목록을 얻으려면 DB 접속이 필요합니다.', en: 'A database connection is required to get the column list.', ja: '列一覧を取得するには DB 接続が必要です。', zh: '获取列清单需要连接数据库。' },
  'wb.expandFail': { ko: '펼치지 못했습니다.', en: 'Could not expand.', ja: '展開できませんでした。', zh: '无法展开。' },
  'wb.expandDone': { ko: '컬럼 {n}개로 펼쳤습니다.', en: 'Expanded into {n} column(s).', ja: '{n} 個の列に展開しました。', zh: '已展开为 {n} 个列。' },

  // ── 워크벤치 — 계측 탭 ──
  'wb.tPrepare': { ko: '파싱/준비 (prepare)', en: 'Parse/prepare', ja: 'パース/準備 (prepare)', zh: '解析/准备 (prepare)' },
  'wb.tPrepareNote': { ko: 'PreparedStatement 생성 시간', en: 'Time to create the PreparedStatement', ja: 'PreparedStatement の生成時間', zh: '创建 PreparedStatement 的时间' },
  'wb.tExecute': { ko: '실행 (execute)', en: 'Execute', ja: '実行 (execute)', zh: '执行 (execute)' },
  'wb.tExecuteNote': { ko: '서버가 커서를 열 때까지', en: 'Until the server opens the cursor', ja: 'サーバーがカーソルを開くまで', zh: '直到服务器打开游标' },
  'wb.tFetch': { ko: '인출 (fetch)', en: 'Fetch', ja: 'フェッチ (fetch)', zh: '提取 (fetch)' },
  'wb.tFetchNote': { ko: '결과 행을 모두 받아오는 시간', en: 'Time to receive all result rows', ja: '結果行をすべて受け取る時間', zh: '接收全部结果行的时间' },
  'wb.tTotal': { ko: '합계', en: 'Total', ja: '合計', zh: '合计' },
  'wb.statsNote': { ko: '세션 통계 증분(V$MYSTAT)입니다. 시간보다 흔들림이 적어 튜닝 판정의 1차 근거로 쓰세요.', en: 'These are session statistic deltas (V$MYSTAT). They fluctuate less than time, so use them as the primary basis for tuning decisions.', ja: 'セッション統計の増分(V$MYSTAT)です。時間よりぶれが少ないため、チューニング判定の一次根拠として使ってください。', zh: '这是会话统计增量(V$MYSTAT)。它比时间波动更小，请作为调优判定的首要依据。' },
  'wb.statsNoPriv': { ko: 'V$MYSTAT 접근 권한이 없어 시간만 측정했습니다. 이 환경에서는 반복 측정(벤치마크)으로 보완하세요.', en: 'Without V$MYSTAT access only time was measured. In this environment, supplement it with repeated measurement (benchmarking).', ja: 'V$MYSTAT へのアクセス権限がないため時間のみ計測しました。この環境では反復計測(ベンチマーク)で補ってください。', zh: '由于没有 V$MYSTAT 访问权限，仅测量了时间。在此环境中请用重复测量(基准测试)加以补充。' },
  'col.unit': { ko: '단위', en: 'Unit', ja: '単位', zh: '单位' },
  'wb.sn.logicalReads': { ko: '논리적 블록 읽기 총량. 튜닝 효과를 가장 잘 반영하는 지표.', en: 'Total logical block reads. The metric that best reflects tuning effect.', ja: '論理ブロック読み取りの総量。チューニング効果を最もよく反映する指標。', zh: '逻辑块读取总量。最能反映调优效果的指标。' },
  'wb.sn.consistentGets': { ko: '일관성 읽기(주로 SELECT). 줄어들면 실질적으로 빨라진 것.', en: 'Consistent reads (mostly SELECT). A drop means it really got faster.', ja: '一貫性読み取り(主に SELECT)。減れば実質的に速くなったということ。', zh: '一致性读(主要为 SELECT)。减少即表示实际变快了。' },
  'wb.sn.dbBlockGets': { ko: '현재 모드 읽기(주로 DML).', en: 'Current-mode reads (mostly DML).', ja: 'カレントモード読み取り(主に DML)。', zh: '当前模式读(主要为 DML)。' },
  'wb.sn.physicalReads': { ko: '디스크에서 읽은 블록. 버퍼 캐시 상태에 따라 흔들린다.', en: 'Blocks read from disk. Varies with the buffer cache state.', ja: 'ディスクから読んだブロック。バッファキャッシュの状態で変動する。', zh: '从磁盘读取的块。会随缓冲区缓存状态波动。' },
  'wb.sn.sortsMemory': { ko: '메모리 정렬 횟수.', en: 'Number of in-memory sorts.', ja: 'メモリソートの回数。', zh: '内存排序次数。' },
  'wb.sn.sortsDisk': { ko: '디스크 정렬 횟수. 0 이 아니면 PGA 부족 신호.', en: 'Number of disk sorts. Non-zero signals insufficient PGA.', ja: 'ディスクソートの回数。0 でなければ PGA 不足の兆候。', zh: '磁盘排序次数。非 0 表示 PGA 不足。' },
  'wb.sn.tableScans': { ko: '큰 테이블 전체 스캔 횟수.', en: 'Number of full scans on long tables.', ja: '大きな表のフルスキャン回数。', zh: '大表全表扫描次数。' },
  'wb.sn.fetchByRowid': { ko: '인덱스를 타고 행을 찾은 횟수.', en: 'Number of rows fetched via an index.', ja: 'インデックス経由で行を取得した回数。', zh: '通过索引查找行的次数。' },
  'wb.sn.cpuUsed': { ko: 'CPU 사용(1/100초).', en: 'CPU used (in hundredths of a second).', ja: 'CPU 使用(1/100 秒)。', zh: 'CPU 使用量(1/100 秒)。' },
  'wb.sn.hardParse': { ko: '하드 파싱 횟수. 바인드 변수 미사용의 대표 신호.', en: 'Number of hard parses. A classic sign of unused bind variables.', ja: 'ハードパースの回数。バインド変数を使っていない代表的な兆候。', zh: '硬解析次数。未使用绑定变量的典型信号。' },

  // ── 워크벤치 — 비교 검증 ──
  'wb.needBothSql': { ko: '튜닝 전/후 SQL 이 모두 필요합니다.', en: 'Both the original and tuned SQL are required.', ja: 'チューニング前後の SQL が両方必要です。', zh: '需要同时提供调优前后的 SQL。' },
  'wb.comparing': { ko: '전·후 SQL 을 번갈아 실행하며 측정하고 있습니다…', en: 'Running the before/after SQL alternately and measuring…', ja: '前後の SQL を交互に実行して計測しています…', zh: '正在交替执行调优前后的 SQL 并测量…' },
  'wb.compareLog': { ko: '비교 검증: {verdict} / 성능 {perf}', en: 'Compare: {verdict} / performance {perf}', ja: '比較検証: {verdict} / 性能 {perf}', zh: '对比验证: {verdict} / 性能 {perf}' },
  'wb.compareFail': { ko: '비교 검증 실패: {msg}', en: 'Compare failed: {msg}', ja: '比較検証に失敗: {msg}', zh: '对比验证失败: {msg}' },
  'wb.verifying': { ko: '검증 중…', en: 'Verifying…', ja: '検証中…', zh: '正在验证…' },
  'wb.respTimeMedian': { ko: '응답시간 (중앙값)', en: 'Response time (median)', ja: '応答時間 (中央値)', zh: '响应时间 (中位数)' },
  'wb.speedup': { ko: '{v}배', en: '{v}x', ja: '{v} 倍', zh: '{v} 倍' },
  'wb.crossRuns': { ko: '{runs}회 교차 실행 (워밍업 {warmup}회 제외)', en: '{runs} interleaved run(s) ({warmup} warmup run(s) excluded)', ja: '{runs} 回の交互実行 (ウォームアップ {warmup} 回を除く)', zh: '交替执行 {runs} 次 (不含预热 {warmup} 次)' },
  'wb.logicalReadsCard': { ko: '논리적 읽기', en: 'Logical reads', ja: '論理読取', zh: '逻辑读' },
  'wb.moreStableThanTime': { ko: '{pct} · 시간보다 안정적인 지표', en: '{pct} · a more stable metric than time', ja: '{pct} · 時間より安定した指標', zh: '{pct} · 比时间更稳定的指标' },
  'wb.optimizerCost': { ko: '옵티마이저 비용', en: 'Optimizer cost', ja: 'オプティマイザコスト', zh: '优化器成本' },
  'wb.estimateNotMeasured': { ko: '{pct} · 추정치(실측 아님)', en: '{pct} · estimate (not measured)', ja: '{pct} · 推定値(実測ではない)', zh: '{pct} · 估算值(非实测)' },
  'wb.statsCompareMedian': { ko: '세션 통계 비교 (중앙값)', en: 'Session statistics comparison (median)', ja: 'セッション統計の比較 (中央値)', zh: '会话统计对比 (中位数)' },
  'col.statName': { ko: '통계 항목', en: 'Statistic', ja: '統計項目', zh: '统计项' },
  'col.delta': { ko: '증감', en: 'Change', ja: '増減', zh: '增减' },
  'col.improvePct': { ko: '개선율(%)', en: 'Improvement (%)', ja: '改善率(%)', zh: '改善率(%)' },
  'wb.statsCompare': { ko: '세션 통계 비교', en: 'Session statistics comparison', ja: 'セッション統計の比較', zh: '会话统计对比' },
  'wb.statsCompareNoPriv': { ko: 'V$MYSTAT 접근 권한이 없어 통계 증분을 수집하지 못했습니다. 이 환경에서는 <b>반복 실행의 중앙값</b>과 <b>결과 동일성</b>이 판단 근거입니다.', en: 'Without V$MYSTAT access the statistic deltas could not be collected. In this environment the <b>median of repeated runs</b> and <b>result equivalence</b> are the basis for judgement.', ja: 'V$MYSTAT へのアクセス権限がないため統計の増分を収集できませんでした。この環境では <b>反復実行の中央値</b> と <b>結果の同一性</b> が判断根拠になります。', zh: '由于没有 V$MYSTAT 访问权限，未能收集统计增量。在此环境中，<b>重复执行的中位数</b> 与 <b>结果一致性</b> 是判断依据。' },
  'wb.perRunTime': { ko: '실행별 소요시간', en: 'Time per run', ja: '実行ごとの所要時間', zh: '每次执行的耗时' },
  'col.beforeTotalMs': { ko: '전 합계(ms)', en: 'Before total (ms)', ja: '前 合計(ms)', zh: '前 合计(ms)' },
  'col.beforeExecMs': { ko: '전 실행(ms)', en: 'Before execute (ms)', ja: '前 実行(ms)', zh: '前 执行(ms)' },
  'col.afterTotalMs': { ko: '후 합계(ms)', en: 'After total (ms)', ja: '後 合計(ms)', zh: '后 合计(ms)' },
  'col.afterExecMs': { ko: '후 실행(ms)', en: 'After execute (ms)', ja: '後 実行(ms)', zh: '后 执行(ms)' },
  'wb.planCompare': { ko: '실행계획 요약 비교 (옵티마이저 추정치)', en: 'Execution plan summary comparison (optimizer estimates)', ja: '実行計画の要約比較 (オプティマイザ推定値)', zh: '执行计划摘要对比 (优化器估算值)' },
  'wb.pm.totalCost': { ko: '총 비용', en: 'Total cost', ja: '総コスト', zh: '总成本' },
  'wb.pm.estimatedRows': { ko: '예상 행수', en: 'Estimated rows', ja: '推定行数', zh: '预估行数' },
  'wb.pm.steps': { ko: '계획 단계 수', en: 'Plan steps', ja: '計画の段階数', zh: '计划步数' },
  'wb.pm.fullScans': { ko: '전체 테이블 스캔', en: 'Full table scans', ja: 'フルテーブルスキャン', zh: '全表扫描' },
  'wb.pm.cartesian': { ko: '카티션 조인', en: 'Cartesian joins', ja: 'デカルト結合', zh: '笛卡尔连接' },
  'wb.pm.indexScans': { ko: '인덱스 접근', en: 'Index accesses', ja: 'インデックスアクセス', zh: '索引访问' },
  'wb.pm.sorts': { ko: '정렬 단계', en: 'Sort steps', ja: 'ソート段階', zh: '排序步骤' },
  'wb.pm.hashJoins': { ko: '해시 조인', en: 'Hash joins', ja: 'ハッシュ結合', zh: '哈希连接' },
  'wb.pm.nestedLoops': { ko: '중첩 루프', en: 'Nested loops', ja: 'ネストループ', zh: '嵌套循环' },
  'wb.compareChart': { ko: '전 / 후 비교 차트', en: 'Before / after comparison chart', ja: '前 / 後の比較チャート', zh: '前 / 后对比图' },
  'wb.respTime': { ko: '응답시간', en: 'Response time', ja: '応答時間', zh: '响应时间' },
  'wb.chartTimeLabel': { ko: '응답시간 (ms, 낮을수록 좋음)', en: 'Response time (ms, lower is better)', ja: '応答時間 (ms, 低いほど良い)', zh: '响应时间 (ms, 越低越好)' },
  'wb.chartRelLabel': { ko: '상대 비교 (원본 = 100, 낮을수록 개선)', en: 'Relative comparison (original = 100, lower is better)', ja: '相対比較 (元の SQL = 100, 低いほど改善)', zh: '相对对比 (原始 = 100, 越低越好)' },
  'wb.respTimeMs': { ko: '응답시간(ms)', en: 'Response time (ms)', ja: '応答時間(ms)', zh: '响应时间(ms)' },
  'wb.beforeIs100': { ko: '튜닝 전(100)', en: 'Original (100)', ja: 'チューニング前(100)', zh: '调优前(100)' },
  'wb.ss.logicalReads': { ko: '논리읽기', en: 'Logical reads', ja: '論理読取', zh: '逻辑读' },
  'wb.ss.consistentGets': { ko: '일관성읽기', en: 'Consistent gets', ja: '一貫性読取', zh: '一致性读' },
  'wb.ss.physicalReads': { ko: '물리읽기', en: 'Physical reads', ja: '物理読取', zh: '物理读' },

  // ── 워크벤치 — 결과 동일성 판정 ──
  'wb.vd.identicalTitle': { ko: '결과 완전 동일', en: 'Results are identical', ja: '結果は完全に同一', zh: '结果完全相同' },
  'wb.vd.identicalDesc': { ko: '행 내용과 순서까지 같습니다. 튜닝 후 SQL 로 안전하게 교체할 수 있습니다.', en: 'Row contents and order match. You can safely replace it with the tuned SQL.', ja: '行の内容も順序も同じです。チューニング後の SQL に安全に置き換えられます。', zh: '行内容与顺序都相同。可以安全地替换为调优后的 SQL。' },
  'wb.vd.samesetTitle': { ko: '행 집합은 같지만 순서가 다릅니다', en: 'Same row set, different order', ja: '行の集合は同じですが順序が異なります', zh: '行集合相同但顺序不同' },
  'wb.vd.samesetDesc': { ko: 'ORDER BY 유무나 정렬 기준이 달라졌습니다. 호출하는 쪽이 순서에 의존한다면 문제가 됩니다.', en: 'The presence of ORDER BY or the sort key changed. This is a problem if the caller depends on the order.', ja: 'ORDER BY の有無や並び替えの基準が変わりました。呼び出す側が順序に依存している場合は問題になります。', zh: 'ORDER BY 的有无或排序依据发生了变化。如果调用方依赖顺序，这会成为问题。' },
  'wb.vd.differentTitle': { ko: '결과가 다릅니다', en: 'Results differ', ja: '結果が異なります', zh: '结果不同' },
  'wb.vd.differentDesc': { ko: '튜닝 후 SQL 이 다른 결과를 냅니다. 성능과 무관하게 그대로 적용하면 안 됩니다.', en: 'The tuned SQL produces different results. Regardless of performance, it must not be applied as is.', ja: 'チューニング後の SQL は異なる結果を返します。性能に関係なく、そのまま適用してはいけません。', zh: '调优后的 SQL 产生了不同的结果。无论性能如何，都不能直接采用。' },
  'wb.vd.inconclusiveTitle': { ko: '결과 비교 불가', en: 'Results cannot be compared', ja: '結果を比較できません', zh: '无法比较结果' },
  'wb.vd.inconclusiveDesc': { ko: '조회문이 아니어서 행 단위 비교를 하지 못했습니다.', en: 'It is not a query, so a row-by-row comparison was not possible.', ja: '照会文ではないため、行単位の比較ができませんでした。', zh: '不是查询语句，因此无法进行逐行比较。' },
  'wb.vd.skippedTitle': { ko: '결과 검증을 건너뛰었습니다', en: 'Result verification was skipped', ja: '結果の検証をスキップしました', zh: '已跳过结果验证' },
  'wb.hashEq': { ko: '<span class="hash-eq">일치</span>', en: '<span class="hash-eq">match</span>', ja: '<span class="hash-eq">一致</span>', zh: '<span class="hash-eq">一致</span>' },
  'wb.hashNe': { ko: '<span class="hash-ne">불일치</span>', en: '<span class="hash-ne">mismatch</span>', ja: '<span class="hash-ne">不一致</span>', zh: '<span class="hash-ne">不一致</span>' },
  'wb.hashRows': { ko: '행수 {before} → {after} {eq}', en: 'Row count {before} → {after} {eq}', ja: '行数 {before} → {after} {eq}', zh: '行数 {before} → {after} {eq}' },
  'wb.hashOrdered': { ko: '순서포함 지문 {before} → {after} {eq}', en: 'Ordered fingerprint {before} → {after} {eq}', ja: '順序込みの指紋 {before} → {after} {eq}', zh: '含顺序指纹 {before} → {after} {eq}' },
  'wb.hashUnordered': { ko: '집합 지문 {before} → {after} {eq}', en: 'Set fingerprint {before} → {after} {eq}', ja: '集合の指紋 {before} → {after} {eq}', zh: '集合指纹 {before} → {after} {eq}' },
  'wb.hashTruncated': { ko: '<br><span style="color:var(--warn)">※ 최대 인출 행수에서 잘린 상태의 비교입니다.</span>', en: '<br><span style="color:var(--warn)">* This comparison is on data cut off at the max fetch row count.</span>', ja: '<br><span style="color:var(--warn)">※ 最大フェッチ行数で切り捨てられた状態での比較です。</span>', zh: '<br><span style="color:var(--warn)">※ 这是在最大提取行数处被截断的状态下的比较。</span>' },
  'wb.diffSample': { ko: '결과 차이 표본', en: 'Result difference sample', ja: '結果の差分サンプル', zh: '结果差异样本' },
  'wb.diffSummary': { ko: '튜닝 전에만 있는 행 {before}건, 튜닝 후에만 있는 행 {after}건 (각 최대 20건 표본)', en: '{before} row(s) only in the original, {after} row(s) only in the tuned SQL (up to 20 sampled each)', ja: 'チューニング前にのみある行 {before} 件、チューニング後にのみある行 {after} 件 (各最大 20 件のサンプル)', zh: '仅存在于调优前的行 {before} 条, 仅存在于调优后的行 {after} 条 (各最多抽样 20 条)' },
  'wb.onlyBefore': { ko: '튜닝 전에만 있는 행', en: 'Rows only in the original', ja: 'チューニング前にのみある行', zh: '仅存在于调优前的行' },
  'wb.onlyAfter': { ko: '튜닝 후에만 있는 행', en: 'Rows only in the tuned SQL', ja: 'チューニング後にのみある行', zh: '仅存在于调优后的行' },
  'wb.noExport': { ko: '내보낼 결과가 없습니다.', en: 'There is no result to export.', ja: 'エクスポートする結果がありません。', zh: '没有可导出的结果。' },
  'wb.exportFail': { ko: '내보내기 실패: {msg}', en: 'Export failed: {msg}', ja: 'エクスポートに失敗: {msg}', zh: '导出失败: {msg}' },
  'wb.copiedRows': { ko: '{msg} ({n}행)', en: '{msg} ({n} row(s))', ja: '{msg} ({n} 行)', zh: '{msg} ({n} 行)' },
  'wb.splitterTip': { ko: '드래그해서 높이 조절', en: 'Drag to resize height', ja: 'ドラッグして高さを調整', zh: '拖动以调整高度' }
};

/** Open Grid 로케일 매핑. ja/zh 는 내장 로케일이 없으면 en 으로 근사한다. */
const GRID_LOCALE = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh' };

let current = 'ko';
const listeners = new Set();

export function getLang() { return current; }

/** 언어를 바꾸고 화면을 다시 그린다. */
export function setLang(code) {
  if (!M['app.title'][code]) code = 'ko';
  current = code;
  try { localStorage.setItem('ot.lang', code); } catch (e) { /* noop */ }
  document.documentElement.setAttribute('lang', code);
  applyDom();
  applyGridLocale();
  for (const fn of listeners) {
    try { fn(code); } catch (e) { /* 리스너 하나가 실패해도 나머지는 진행 */ }
  }
}

/** 언어 변경 시 다시 그려야 하는 화면이 등록한다. */
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * 번역 문자열을 가져온다. {name} 형태의 파라미터를 치환한다.
 * @param {string} key
 * @param {object} [params]
 */
export function t(key, params) {
  const entry = M[key];
  let s = entry ? (entry[current] || entry.ko || key) : key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  }
  return s;
}

/** 특정 언어의 문자열(현재 언어와 무관). 서버로 보낼 lang 파라미터 등에 쓴다. */
export function tIn(lang, key) {
  const entry = M[key];
  return entry ? (entry[lang] || entry.ko || key) : key;
}

/**
 * DOM 을 훑어 data-i18n 계열 속성을 채운다.
 *  - data-i18n         → textContent 또는 innerHTML(값에 태그가 있으면)
 *  - data-i18n-ph      → placeholder
 *  - data-i18n-title   → title
 *  - data-i18n-html    → innerHTML (항상 HTML 로 취급)
 */
export function applyDom(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    const s = t(node.getAttribute('data-i18n'));
    if (/[<&]/.test(s)) node.innerHTML = s;
    else node.textContent = s;
  }
  for (const node of root.querySelectorAll('[data-i18n-html]')) {
    node.innerHTML = t(node.getAttribute('data-i18n-html'));
  }
  for (const node of root.querySelectorAll('[data-i18n-ph]')) {
    node.setAttribute('placeholder', t(node.getAttribute('data-i18n-ph')));
  }
  for (const node of root.querySelectorAll('[data-i18n-title]')) {
    node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
  }
  document.title = t('app.title');
}

function applyGridLocale() {
  const loc = GRID_LOCALE[current] || 'en';
  // gridkit 이 등록해 둔 전역 훅을 통해 모든 그리드 로케일을 바꾼다(순환 import 회피).
  if (typeof globalThis.__otSetGridLocale === 'function') {
    globalThis.__otSetGridLocale(loc);
  }
}

/** 저장된 언어 또는 브라우저 언어로 초기화한다. */
export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem('ot.lang'); } catch (e) { /* noop */ }
  if (!saved) {
    const nav = (navigator.language || 'ko').slice(0, 2).toLowerCase();
    saved = M['app.title'][nav] ? nav : 'ko';
  }
  current = saved;
  document.documentElement.setAttribute('lang', current);
  return current;
}

export { M as MESSAGES };
