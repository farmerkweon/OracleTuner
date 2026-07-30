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
  'sqls.demoInstalled': { ko: '샘플 예제 {n}건을 넣었습니다. "데모" 폴더를 확인하세요.', en: 'Added {n} sample SQLs. See the "데모" folder.', ja: 'サンプル {n} 件を追加しました。「데모」フォルダをご確認ください。', zh: '已添加 {n} 个示例。请查看"데모"文件夹。' },
  'sqls.demoConfirm': { ko: '튜닝 효과를 확인할 수 있는 샘플 예제를 목록에 넣습니다.\n\n먼저 "① 데모 데이터 만들기" 를 실행해 시험용 표(30만 건)를 만들어야 효과를 볼 수 있습니다.\n진행할까요?', en: 'Add sample SQLs that demonstrate tuning gains.\n\nRun "① 데모 데이터 만들기" first to create the 300k-row test tables.\nProceed?', ja: 'チューニング効果を確認できるサンプルを追加します。\n\nまず「① 데모 데이터 만들기」を実行して 30 万件の試験表を作成してください。\n進めますか?', zh: '添加可验证调优效果的示例 SQL。\n\n请先执行"① 데모 데이터 만들기"创建 30 万行测试表。\n是否继续？' },
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
  'footer.rights': { ko: 'All rights reserved.', en: 'All rights reserved.', ja: 'All rights reserved.', zh: 'All rights reserved.' }
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
