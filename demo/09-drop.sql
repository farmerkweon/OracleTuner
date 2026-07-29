--@ name: 데모 9) 정리 (DROP)
--@ tags: 데모
--@ desc: 데모용 표를 지웁니다. 다시 만들기 전에도 이걸 먼저 실행하세요.

/* Oracle Tuner 데모 — 정리
 *
 * [전체 실행] 으로 돌리면 됩니다. 표가 없으면 "존재하지 않는다" 오류가 나는데
 * 정상이며, 오류를 건너뛰고 계속 진행합니다.
 */

DROP TABLE ot_orders PURGE;

DROP TABLE ot_bad_cust PURGE;
