'use strict';
/**
 * 데모 예제 SQL 정의.
 *
 * <p>각 예제는 <b>튜닝 경합이 실제로 일어나는</b> 것만 골랐다. 즉,
 * 이 도구의 [튜닝 후보] → [토너먼트]를 돌리면 순위가 갈리고 개선율이 숫자로 나온다.
 * 30만 건 데이터(01-setup.sql)를 전제로 한다.
 *
 * <p>each: {name, tags, desc, note, sql}
 * - name   : 화면 [SQL 목록]에 뜨는 이름. <b>{ko,en,ja,zh} 4벌</b>
 * - desc   : 무엇이 개선될지(사용자가 결과를 보고 확인할 수 있게). <b>{ko,en,ja,zh} 4벌</b>
 * - note   : SQL 맨 앞에 `-- ` 주석으로 붙는 설명 줄. <b>{ko,en,ja,zh} 4벌</b>
 * - sql    : <b>튜닝 전(느린) SQL 본문</b>. 도구가 고칠 대상이다.
 *
 * <p><b>왜 sql 과 note 를 나눴나</b> — 설명 주석을 SQL 문자열 안에 섞어 두면 번역할 때
 * SQL 문법·표·컬럼명을 건드릴 위험이 생긴다. 주석을 데이터로 분리해 두면 번역이
 * SQL 본문에 절대 닿지 않는다. 붙이는 쪽은 server/demo-install.js 의 localize().
 *
 * <p>번역어는 화면 사전(web/js/i18n.js)과 맞췄다 —
 * 실행계획/Explain/実行計画/执行计划, 논리읽기/Logical reads/論理読取/逻辑读,
 * 전체 테이블 스캔/Full table scan/フルテーブルスキャン/全表扫描, 인덱스/Index/インデックス/索引.
 */

module.exports = [
  {
    name: {
      ko: '① 날짜 함수 조건 (인덱스 못 탐)',
      en: '① Function on a date column (index unusable)',
      ja: '① 日付関数の条件 (インデックスが使えない)',
      zh: '① 日期函数条件（用不上索引）'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: TO_CHAR 를 범위 조건으로 바꾸면 전체 테이블 스캔 → 인덱스 범위 스캔. 논리읽기 대폭 감소.',
      en: 'Expect: replacing TO_CHAR with a range predicate turns a full table scan into an index range scan. Logical reads drop sharply.',
      ja: '期待: TO_CHAR を範囲条件に変えるとフルテーブルスキャン → インデックスレンジスキャン。論理読取が大幅に減ります。',
      zh: '预期：把 TO_CHAR 改为范围条件后，全表扫描 → 索引范围扫描，逻辑读大幅下降。'
    },
    note: {
      ko: ['[문제] order_dt 컬럼을 TO_CHAR 로 감싸서 IX_ORD_DT 인덱스를 쓰지 못한다.',
           '30만 건 중 특정 1개월(약 8천 건)만 필요한데 전체를 읽는다.'],
      en: ['[Problem] order_dt is wrapped in TO_CHAR, so the IX_ORD_DT index cannot be used.',
           'Only one month (about 8,000 rows) is needed, yet all 300,000 rows are read.'],
      ja: ['[問題] order_dt 列を TO_CHAR で包んでいるため IX_ORD_DT インデックスが使えない。',
           '30 万件のうち特定の 1 か月(約 8 千件)だけ必要なのに全件を読む。'],
      zh: ['[问题] order_dt 列被 TO_CHAR 包裹，无法使用 IX_ORD_DT 索引。',
           '30 万行中只需要某一个月（约 8 千行），却读取了全部。']
    },
    sql:
`SELECT order_id, cust_no, order_dt, amount
  FROM ot_orders
 WHERE TO_CHAR(order_dt, 'YYYYMM') = '202403'
 ORDER BY order_dt`
  },
  {
    name: {
      ko: '② 암시적 형변환 (문자 컬럼 = 숫자)',
      en: '② Implicit conversion (character column = number)',
      ja: '② 暗黙の型変換 (文字列列 = 数値)',
      zh: '② 隐式类型转换（字符列 = 数字）'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: 따옴표만 붙이면 인덱스를 탄다. 전체 테이블 스캔 → 인덱스 스캔으로 극적인 차이.',
      en: 'Expect: just quoting the literal lets the index be used — full table scan → index scan, a dramatic difference.',
      ja: '期待: 引用符を付けるだけでインデックスが使われます。フルテーブルスキャン → インデックススキャンで劇的な差。',
      zh: '预期：只需加上引号即可走索引。全表扫描 → 索引扫描，差异显著。'
    },
    note: {
      ko: ['[문제] cust_no 는 VARCHAR2 인데 숫자와 비교한다.',
           'Oracle 이 TO_NUMBER(cust_no) 로 컬럼을 변환해 IX_ORD_CUST 인덱스가 무력화된다.'],
      en: ['[Problem] cust_no is VARCHAR2 but is compared with a number.',
           'Oracle applies TO_NUMBER(cust_no) to the column, which disables the IX_ORD_CUST index.'],
      ja: ['[問題] cust_no は VARCHAR2 なのに数値と比較している。',
           'Oracle が TO_NUMBER(cust_no) と列を変換するため IX_ORD_CUST インデックスが無効化される。'],
      zh: ['[问题] cust_no 是 VARCHAR2，却与数字比较。',
           'Oracle 会对该列施加 TO_NUMBER(cust_no)，导致 IX_ORD_CUST 索引失效。']
    },
    sql:
`SELECT order_id, cust_no, order_dt, amount
  FROM ot_orders
 WHERE cust_no = 123456`
  },
  {
    name: {
      ko: '③ NOT IN 서브쿼리',
      en: '③ NOT IN subquery',
      ja: '③ NOT IN サブクエリ',
      zh: '③ NOT IN 子查询'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: NOT EXISTS 로 바꾸면 안티조인으로 풀려 빨라진다. NULL 처리도 안전해진다.',
      en: 'Expect: rewriting as NOT EXISTS lets it unnest into an anti-join and run faster. NULL handling also becomes safe.',
      ja: '期待: NOT EXISTS に変えるとアンチ結合に展開されて速くなります。NULL の扱いも安全になります。',
      zh: '预期：改写为 NOT EXISTS 后可展开为反连接，速度更快，NULL 处理也更安全。'
    },
    note: {
      ko: ['[문제] NOT IN 은 3치 논리 때문에 안티조인 변환이 제한적이다.'],
      en: ['[Problem] Because of three-valued logic, NOT IN can be turned into an anti-join only in limited cases.'],
      ja: ['[問題] NOT IN は三値論理のためアンチ結合への変換が限定的である。'],
      zh: ['[问题] 由于三值逻辑，NOT IN 能转换为反连接的场景很有限。']
    },
    sql:
`SELECT o.order_id, o.cust_no, o.amount
  FROM ot_orders o
 WHERE o.order_dt >= DATE '2024-01-01'
   AND o.order_dt <  DATE '2024-02-01'
   AND o.cust_no NOT IN (SELECT b.cust_no FROM ot_bad_cust b)`
  },
  {
    name: {
      ko: '④ SELECT * (불필요한 컬럼)',
      en: '④ SELECT * (unneeded columns)',
      ja: '④ SELECT * (不要な列)',
      zh: '④ SELECT *（多余的列）'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: 필요한 컬럼만 명시하면 인출량이 줄어 fetch 시간이 감소한다(pad 컬럼 400바이트).',
      en: 'Expect: listing only the needed columns cuts the volume fetched and shortens fetch time (the pad column is 400 bytes).',
      ja: '期待: 必要な列だけを指定すると取得量が減り、フェッチ時間が短くなります(pad 列は 400 バイト)。',
      zh: '预期：只列出需要的列可减少取回的数据量，缩短 fetch 时间（pad 列 400 字节）。'
    },
    note: {
      ko: ['[문제] pad 컬럼(400바이트)까지 전부 읽고 전송한다.'],
      en: ['[Problem] Every column is read and sent, including the 400-byte pad column.'],
      ja: ['[問題] pad 列(400 バイト)まで全部読み込んで転送している。'],
      zh: ['[问题] 连 400 字节的 pad 列也全部读取并传输。']
    },
    sql:
`SELECT *
  FROM ot_orders
 WHERE order_dt >= DATE '2024-03-01'
   AND order_dt <  DATE '2024-04-01'`
  },
  {
    name: {
      ko: '⑤ NVL 로 감싼 조건',
      en: '⑤ Predicate wrapped in NVL',
      ja: '⑤ NVL で包んだ条件',
      zh: '⑤ 被 NVL 包裹的条件'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: NVL 을 분해하면 status 인덱스를 쓸 수 있는 경로가 생긴다.',
      en: 'Expect: breaking the NVL apart opens an access path that can use the status index.',
      ja: '期待: NVL を分解すると status インデックスを使える経路が生まれます。',
      zh: '预期：拆开 NVL 后即可产生能够使用 status 索引的访问路径。'
    },
    note: {
      ko: ["[문제] NVL(status,'A') 로 컬럼을 감싸 IX_ORD_STATUS 를 쓰지 못한다."],
      en: ["[Problem] The column is wrapped in NVL(status,'A'), so IX_ORD_STATUS cannot be used."],
      ja: ["[問題] NVL(status,'A') で列を包んでいるため IX_ORD_STATUS を使えない。"],
      zh: ["[问题] 列被 NVL(status,'A') 包裹，无法使用 IX_ORD_STATUS。"]
    },
    sql:
`SELECT order_id, cust_no, status, amount
  FROM ot_orders
 WHERE NVL(status, 'A') = 'A'
   AND order_dt >= DATE '2024-06-01'
   AND order_dt <  DATE '2024-06-08'`
  },
  {
    name: {
      ko: '⑥ UNION (불필요한 중복 제거)',
      en: '⑥ UNION (needless de-duplication)',
      ja: '⑥ UNION (不要な重複排除)',
      zh: '⑥ UNION（多余的去重）'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: 겹치는 행이 없으므로 UNION ALL 로 바꾸면 정렬 단계가 통째로 사라진다.',
      en: 'Expect: the two branches never overlap, so switching to UNION ALL removes the sort step entirely.',
      ja: '期待: 重なる行がないため UNION ALL に変えるとソート段階がまるごと消えます。',
      zh: '预期：两个分支没有重叠行，改为 UNION ALL 后排序步骤完全消失。'
    },
    note: {
      ko: ['[문제] 두 분기는 서로 겹치지 않는데도 UNION 이 중복 제거 정렬을 한다.'],
      en: ['[Problem] The two branches do not overlap, yet UNION still sorts to remove duplicates.'],
      ja: ['[問題] 二つの分岐は重ならないのに UNION が重複排除のソートを行う。'],
      zh: ['[问题] 两个分支互不重叠，UNION 却仍执行去重排序。']
    },
    sql:
`SELECT order_id, cust_no, amount FROM ot_orders WHERE order_dt = DATE '2024-05-01'
UNION
SELECT order_id, cust_no, amount FROM ot_orders WHERE order_dt = DATE '2024-05-02'`
  },
  {
    name: {
      ko: '⑦ ROWNUM + ORDER BY (결과가 틀림)',
      en: '⑦ ROWNUM + ORDER BY (wrong result)',
      ja: '⑦ ROWNUM + ORDER BY (結果が誤り)',
      zh: '⑦ ROWNUM + ORDER BY（结果错误）'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: 성능이 아니라 정확성 문제. FETCH FIRST 로 바꾸면 "진짜 상위 10건"이 나온다.',
      en: 'Expect: this is a correctness issue, not a performance one. FETCH FIRST returns the real top 10 rows.',
      ja: '期待: 性能ではなく正確性の問題。FETCH FIRST に変えると「本当の上位 10 件」が得られます。',
      zh: '预期：这是正确性问题而非性能问题。改为 FETCH FIRST 才能取到"真正的前 10 条"。'
    },
    note: {
      ko: ['[문제] ROWNUM 은 정렬 전에 붙는다. 이 SQL 은 "금액 상위 10건"이 아니라',
           '"아무 10건을 뽑아 정렬한 것"이다. 검증에서 결과가 다르게 나오는 것이 정상.'],
      en: ['[Problem] ROWNUM is applied before sorting. This SQL does not return "the 10 largest amounts";',
           'it takes any 10 rows and then sorts them. A differing verification result is expected here.'],
      ja: ['[問題] ROWNUM は並べ替えの前に付く。この SQL は「金額上位 10 件」ではなく',
           '「任意の 10 件を取って並べ替えたもの」である。検証で結果が異なるのが正常。'],
      zh: ['[问题] ROWNUM 在排序之前生效。该 SQL 取到的不是"金额前 10 条"，',
           '而是"任取 10 条再排序"。因此校验结果不一致属于正常现象。']
    },
    sql:
`SELECT order_id, cust_no, amount
  FROM ot_orders
 WHERE order_dt >= DATE '2024-07-01'
   AND ROWNUM <= 10
 ORDER BY amount DESC`
  },
  {
    name: {
      ko: '⑧ 조인 — 순서/방식 경합',
      en: '⑧ Join — order/method contention',
      ja: '⑧ 結合 — 順序/方式の競合',
      zh: '⑧ 连接 —— 顺序/方式的竞争'
    },
    tags: ['데모'],
    desc: {
      ko: '기대: 조인 방식(USE_HASH/USE_NL)과 순서(LEADING) 후보들이 서로 경합한다.',
      en: 'Expect: candidates for join method (USE_HASH / USE_NL) and join order (LEADING) compete with each other.',
      ja: '期待: 結合方式(USE_HASH/USE_NL)と順序(LEADING)の候補が互いに競います。',
      zh: '预期：连接方式（USE_HASH/USE_NL）与连接顺序（LEADING）的候选相互竞争。'
    },
    note: {
      ko: ['[문제] 조인 방식과 순서에 따라 성능이 갈린다. 토너먼트로 실측해 고른다.'],
      en: ['[Problem] Performance depends on the join method and order. The tournament measures them and picks a winner.'],
      ja: ['[問題] 結合方式と順序で性能が変わる。トーナメントで実測して選ぶ。'],
      zh: ['[问题] 性能取决于连接方式与顺序。由锦标赛实测后选出优胜者。']
    },
    sql:
`SELECT o.order_id, o.cust_no, o.amount
  FROM ot_orders o, ot_bad_cust b
 WHERE o.cust_no = b.cust_no
   AND o.order_dt >= DATE '2024-01-01'
   AND o.order_dt <  DATE '2024-07-01'`
  }
];
