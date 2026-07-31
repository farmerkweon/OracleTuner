/**
 * Open Grid 로케일 보강 — 일본어·중국어.
 *
 * <p>D07(QA-SWEEP): 그리드 라이브러리에 기본 등록된 로케일은 <b>ko·en 둘뿐</b>이다. 앱 언어를
 * `ja`/`zh` 로 바꾸면 `LocaleRegistry.setActive('ja')` 가 거절되면서 콘솔에
 * `[LocaleRegistry] 미등록 로케일 "ja" — 무시하고 현재 로케일 유지.` 경고를 찍고, 그리드 내부
 * 문자열(컬럼 메뉴·필터·"N행 데이터 로드됨" 등)이 한국어로 남았다.
 *
 * <p>여기서 ja·zh 를 직접 등록한다. `extends: 'en'` 을 걸어 두었으므로 아래에 없는 키는 영어로
 * 떨어진다 — 한국어로 남는 것보다 낫고, 뜻이 확실치 않은 문장을 억지로 지어내지 않는다.
 * (a11y 안내문·crossGrid/shuttle 처럼 이 앱이 쓰지 않는 기능의 문구가 그 대상이다.)
 */

import { localeRegistry } from '/vendor/open-grid/open-grid.js';

const ja = {
  contextMenu: {
    sortAsc: '昇順に並べ替え', sortDesc: '降順に並べ替え', find: '検索',
    exportExcel: 'Excel で保存', exportCsv: 'CSV で保存', print: '印刷'
  },
  filter: {
    title: 'フィルター', opContains: '含む', opEq: '等しい', opNe: '等しくない',
    opStartsWith: 'で始まる', opEndsWith: 'で終わる', opGt: 'より大きい', opLt: 'より小さい',
    opGte: '以上', opLte: '以下', valuePlaceholder: 'フィルター値を入力…',
    clear: 'リセット', apply: '適用', legend: 'フィルター', clearAria: 'フィルターをリセット', all: 'すべて'
  },
  findBar: {
    label: '検索', placeholder: '検索語を入力…', searchAria: 'グリッド内を検索', closeAria: '検索を閉じる',
    countBadge: (p = {}) => `${p.current ?? 0}/${p.total ?? 0}`
  },
  pagination: { rowsPerPage: '1 ページの行数:', rangeBadge: '{from}–{to} / {total}', empty: '0 行' },
  tree: { collapse: '折りたたむ', expand: '展開する' },
  detail: {
    glyphLabel: '▤ 詳細', glyphTooltip: '詳細を見る',
    expandAria: '詳細パネルを開く', collapseAria: '詳細パネルを閉じる',
    expandedAnnounce: '行の詳細パネルを開きました。', collapsedAnnounce: '行の詳細パネルを閉じました。',
    collapsedAllAnnounce: 'すべての詳細パネルを閉じました。'
  },
  editor: { datePick: '日付を選択', select: '選択' },
  cell: { emptyValue: '空', revealTooltip: 'クリックで元の値を表示', revealAria: 'マスクされた値を表示', radioAria: '選択' },
  row: { selectAllAria: 'すべての行を選択', selectAria: '{n} 行目を選択' },
  group: { badge: '{label}  ({count})', nullLabel: '(なし)' },
  pivot: { totalLabel: '合計' },
  sort: { asc: '昇順', desc: '降順', none: '並べ替えなし', announce: '{field} を {dir} に並べ替えました' },
  data: {
    loadedAnnounce: (p = {}) => `${p.rows ?? 0} 行のデータを読み込みました。`
  },
  chart: { defaultTitle: 'グラフ', canvasDefault: 'グラフ', a11yNoData: 'データがありません', tooltipEmpty: 'なし' },
  formulaError: {
    err: '数式エラー', ref: '参照が削除されました', cycle: '循環参照', div0: 'ゼロ除算',
    name: '不明な関数・名前', value: '数値でない値の計算', num: '数値範囲エラー', fallback: '数式エラー'
  },
  grid: { containerAria: 'OPEN_GRID データグリッド', emptyMessage: 'データがありません。', filterTooltip: 'フィルター', detailRegion: '詳細' },
  export: { printSummary: '{rows} 行 × {cols} 列 · {date}' }
};

const zh = {
  contextMenu: {
    sortAsc: '升序排序', sortDesc: '降序排序', find: '查找',
    exportExcel: '另存为 Excel', exportCsv: '另存为 CSV', print: '打印'
  },
  filter: {
    title: '筛选', opContains: '包含', opEq: '等于', opNe: '不等于',
    opStartsWith: '开头是', opEndsWith: '结尾是', opGt: '大于', opLt: '小于',
    opGte: '不小于', opLte: '不大于', valuePlaceholder: '输入筛选值…',
    clear: '重置', apply: '应用', legend: '筛选', clearAria: '重置筛选', all: '全部'
  },
  findBar: {
    label: '查找', placeholder: '输入搜索词…', searchAria: '在表格内搜索', closeAria: '关闭查找',
    countBadge: (p = {}) => `${p.current ?? 0}/${p.total ?? 0}`
  },
  pagination: { rowsPerPage: '每页行数:', rangeBadge: '{from}–{to} / 共 {total}', empty: '0 行' },
  tree: { collapse: '折叠', expand: '展开' },
  detail: {
    glyphLabel: '▤ 详情', glyphTooltip: '查看详情',
    expandAria: '展开详情面板', collapseAria: '折叠详情面板',
    expandedAnnounce: '已展开行详情面板。', collapsedAnnounce: '已折叠行详情面板。',
    collapsedAllAnnounce: '已折叠全部详情面板。'
  },
  editor: { datePick: '选择日期', select: '选择' },
  cell: { emptyValue: '空', revealTooltip: '点击显示原值', revealAria: '显示被遮蔽的值', radioAria: '选择' },
  row: { selectAllAria: '选择全部行', selectAria: '选择第 {n} 行' },
  group: { badge: '{label}  ({count})', nullLabel: '(无)' },
  pivot: { totalLabel: '合计' },
  sort: { asc: '升序', desc: '降序', none: '未排序', announce: '{field} 已按{dir}排序' },
  data: {
    loadedAnnounce: (p = {}) => `已加载 ${p.rows ?? 0} 行数据。`
  },
  chart: { defaultTitle: '图表', canvasDefault: '图表', a11yNoData: '无数据', tooltipEmpty: '无' },
  formulaError: {
    err: '公式错误', ref: '引用已被删除', cycle: '循环引用', div0: '除数为零',
    name: '未知函数或名称', value: '对非数值进行运算', num: '数值范围错误', fallback: '公式错误'
  },
  grid: { containerAria: 'OPEN_GRID 数据表格', emptyMessage: '暂无数据。', filterTooltip: '筛选', detailRegion: '详情' },
  export: { printSummary: '{rows} 行 × {cols} 列 · {date}' }
};

let done = false;

/** ja·zh 를 그리드 로케일 레지스트리에 등록한다. 여러 번 불러도 안전하다. */
export function registerGridLocales() {
  if (done) return;
  done = true;
  try {
    if (!localeRegistry.has('ja')) localeRegistry.register('ja', ja, { extends: 'en' });
    if (!localeRegistry.has('zh')) localeRegistry.register('zh', zh, { extends: 'en' });
  } catch (e) {
    // 등록에 실패해도 앱은 떠야 한다. 실패하면 기존 동작(현재 로케일 유지) 그대로다.
  }
}
