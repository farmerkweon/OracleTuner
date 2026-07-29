'use strict';
/**
 * 데모 예제 SQL 정의.
 *
 * <p>각 예제는 <b>튜닝 경합이 실제로 일어나는</b> 것만 골랐다. 즉,
 * 이 도구의 [튜닝 후보] → [토너먼트]를 돌리면 순위가 갈리고 개선율이 숫자로 나온다.
 * 30만 건 데이터(01-setup.sql)를 전제로 한다.
 *
 * <p>each: {name, tags, desc, sql, expect}
 * - sql    : <b>튜닝 전(느린)</b> SQL. 도구가 고칠 대상이다.
 * - expect : 무엇이 개선될지(사용자가 결과를 보고 확인할 수 있게)
 */

module.exports = [
  {
    name: '① 날짜 함수 조건 (인덱스 못 탐)',
    tags: ['데모'],
    desc: '기대: TO_CHAR 를 범위 조건으로 바꾸면 전체 스캔 → 인덱스 범위 스캔. 논리읽기 대폭 감소.',
    sql:
`-- [문제] order_dt 컬럼을 TO_CHAR 로 감싸서 IX_ORD_DT 인덱스를 쓰지 못한다.
-- 30만 건 중 특정 1개월(약 8천 건)만 필요한데 전체를 읽는다.
SELECT order_id, cust_no, order_dt, amount
  FROM ot_orders
 WHERE TO_CHAR(order_dt, 'YYYYMM') = '202403'
 ORDER BY order_dt`
  },
  {
    name: '② 암시적 형변환 (문자 컬럼 = 숫자)',
    tags: ['데모'],
    desc: '기대: 따옴표만 붙이면 인덱스를 탄다. 전체 스캔 → 인덱스 스캔으로 극적인 차이.',
    sql:
`-- [문제] cust_no 는 VARCHAR2 인데 숫자와 비교한다.
-- Oracle 이 TO_NUMBER(cust_no) 로 컬럼을 변환해 IX_ORD_CUST 인덱스가 무력화된다.
SELECT order_id, cust_no, order_dt, amount
  FROM ot_orders
 WHERE cust_no = 123456`
  },
  {
    name: '③ NOT IN 서브쿼리',
    tags: ['데모'],
    desc: '기대: NOT EXISTS 로 바꾸면 안티조인으로 풀려 빨라진다. NULL 처리도 안전해진다.',
    sql:
`-- [문제] NOT IN 은 3치 논리 때문에 안티조인 변환이 제한적이다.
SELECT o.order_id, o.cust_no, o.amount
  FROM ot_orders o
 WHERE o.order_dt >= DATE '2024-01-01'
   AND o.order_dt <  DATE '2024-02-01'
   AND o.cust_no NOT IN (SELECT b.cust_no FROM ot_bad_cust b)`
  },
  {
    name: '④ SELECT * (불필요한 컬럼)',
    tags: ['데모'],
    desc: '기대: 필요한 컬럼만 명시하면 인출량이 줄어 fetch 시간이 감소한다(pad 컬럼 400바이트).',
    sql:
`-- [문제] pad 컬럼(400바이트)까지 전부 읽고 전송한다.
SELECT *
  FROM ot_orders
 WHERE order_dt >= DATE '2024-03-01'
   AND order_dt <  DATE '2024-04-01'`
  },
  {
    name: '⑤ NVL 로 감싼 조건',
    tags: ['데모'],
    desc: '기대: NVL 을 분해하면 status 인덱스를 쓸 수 있는 경로가 생긴다.',
    sql:
`-- [문제] NVL(status,'A') 로 컬럼을 감싸 IX_ORD_STATUS 를 쓰지 못한다.
SELECT order_id, cust_no, status, amount
  FROM ot_orders
 WHERE NVL(status, 'A') = 'A'
   AND order_dt >= DATE '2024-06-01'
   AND order_dt <  DATE '2024-06-08'`
  },
  {
    name: '⑥ UNION (불필요한 중복 제거)',
    tags: ['데모'],
    desc: '기대: 겹치는 행이 없으므로 UNION ALL 로 바꾸면 정렬 단계가 통째로 사라진다.',
    sql:
`-- [문제] 두 분기는 서로 겹치지 않는데도 UNION 이 중복 제거 정렬을 한다.
SELECT order_id, cust_no, amount FROM ot_orders WHERE order_dt = DATE '2024-05-01'
UNION
SELECT order_id, cust_no, amount FROM ot_orders WHERE order_dt = DATE '2024-05-02'`
  },
  {
    name: '⑦ ROWNUM + ORDER BY (결과가 틀림)',
    tags: ['데모'],
    desc: '기대: 성능이 아니라 정확성 문제. FETCH FIRST 로 바꾸면 "진짜 상위 10건"이 나온다.',
    sql:
`-- [문제] ROWNUM 은 정렬 전에 붙는다. 이 SQL 은 "금액 상위 10건"이 아니라
--        "아무 10건을 뽑아 정렬한 것"이다. 검증에서 결과가 다르게 나오는 것이 정상.
SELECT order_id, cust_no, amount
  FROM ot_orders
 WHERE order_dt >= DATE '2024-07-01'
   AND ROWNUM <= 10
 ORDER BY amount DESC`
  },
  {
    name: '⑧ 조인 — 순서/방식 경합',
    tags: ['데모'],
    desc: '기대: 조인 방식(USE_HASH/USE_NL)과 순서(LEADING) 후보들이 서로 경합한다.',
    sql:
`-- [문제] 조인 방식과 순서에 따라 성능이 갈린다. 토너먼트로 실측해 고른다.
SELECT o.order_id, o.cust_no, o.amount
  FROM ot_orders o, ot_bad_cust b
 WHERE o.cust_no = b.cust_no
   AND o.order_dt >= DATE '2024-01-01'
   AND o.order_dt <  DATE '2024-07-01'`
  }
];
