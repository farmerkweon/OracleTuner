--@ name: 데모 1) 데이터 한번에 만들기
--@ name.en: Demo 1) Create all data at once
--@ name.ja: デモ 1) データを一括作成
--@ name.zh: 演示 1) 一次性创建数据
--@ tags: 데모
--@ desc: 표 + 30만 건 + 인덱스 + 통계를 한 번에 만듭니다. [전체 실행] 버튼을 누르세요.
--@ desc.en: Creates tables + 300,000 rows + indexes + statistics in one go. Press [Run script].
--@ desc.ja: 表 + 30 万件 + インデックス + 統計を一括作成します。[全文実行] を押してください。
--@ desc.zh: 一次性创建表 + 30 万行 + 索引 + 统计。请点击[执行全部]。

/* ============================================================================
 * Oracle Tuner 데모 — 데이터 한번에 만들기
 *
 * [전체 실행] 버튼을 누르면 아래 문장이 순서대로 모두 실행됩니다.
 * (INSERT 가 있으므로 "실제로 반영" 을 체크해야 데이터가 남습니다)
 *
 * 이미 표가 있으면 먼저 "데모 9) 정리(DROP)" 를 실행하세요.
 * ========================================================================== */

CREATE TABLE ot_orders (
  order_id  NUMBER        NOT NULL,
  cust_no   VARCHAR2(20)  NOT NULL,
  order_dt  DATE          NOT NULL,
  status    VARCHAR2(10),
  amount    NUMBER(12,2),
  memo      VARCHAR2(200),
  pad       VARCHAR2(400)
);

CREATE TABLE ot_bad_cust (
  cust_no VARCHAR2(20) NOT NULL,
  use_yn  VARCHAR2(1)
);

INSERT INTO ot_orders (order_id, cust_no, order_dt, status, amount, memo, pad)
SELECT ROWNUM,
       TO_CHAR(100000 + MOD(ROWNUM, 50000)),
       DATE '2023-01-01' + MOD(ROWNUM, 1095),
       CASE MOD(ROWNUM, 10) WHEN 0 THEN NULL ELSE 'A' END,
       ROUND(DBMS_RANDOM.VALUE(1000, 900000), 2),
       '주문 메모 ' || ROWNUM,
       RPAD('X', 380, 'X')
  FROM (SELECT 1 FROM dual CONNECT BY LEVEL <= 1000),
       (SELECT 1 FROM dual CONNECT BY LEVEL <= 300);

INSERT INTO ot_bad_cust (cust_no, use_yn)
SELECT TO_CHAR(100000 + (ROWNUM * 97)), 'Y'
  FROM (SELECT 1 FROM dual CONNECT BY LEVEL <= 500);

COMMIT;

CREATE INDEX ix_ord_dt     ON ot_orders (order_dt);

CREATE INDEX ix_ord_cust   ON ot_orders (cust_no);

CREATE INDEX ix_ord_status ON ot_orders (status);

CREATE INDEX ix_bad_cust   ON ot_bad_cust (cust_no);

BEGIN
  DBMS_STATS.GATHER_TABLE_STATS(USER, 'OT_ORDERS',   cascade => TRUE);
  DBMS_STATS.GATHER_TABLE_STATS(USER, 'OT_BAD_CUST', cascade => TRUE);
END;
/

SELECT COUNT(*) AS 주문건수 FROM ot_orders;
