'use strict';
/**
 * 저장소 인터페이스 문서(JSDoc) + 공통 상수.
 *
 * <p>실행 코드는 거의 없다 — 이 파일의 목적은 "json-file.js 와 sqlite.js 가 반드시
 * 지켜야 하는 계약"을 한 곳에 명시하는 것이다. 두 구현이 이 계약만 만족하면
 * 위(파사드: tuning-store.js 등)와 아래(server/repo/index.js 팩토리)는 어느 구현이
 * 실제로 쓰이는지 몰라도 된다.
 *
 * <p>세 저장소 모두 "원본 레코드는 그대로, 조회/정렬에 쓰는 필드만 승격"하는 원칙을
 * 따른다(SQLite 구현에서는 payload 컬럼에 JSON 전문을 담는다). 이렇게 하면 애플리케이션
 * 쪽 레코드 구조가 바뀌어도 스키마 마이그레이션 없이 데이터를 잃지 않는다.
 */

/** 스키마 버전. sqlite.js 가 meta 테이블에 기록한다. */
const SCHEMA_VERSION = 1;

/**
 * 튜닝 이력 저장소 계약.
 *
 * @typedef {Object} TuningRepo
 * @property {function(): object[]} listSummaries
 *   전체 레코드를 요약(summary) 형태로 돌려준다. 정렬·필터는 호출자(tuning-store.js)의 몫이다.
 * @property {function(string): (object|null)} get 단건 조회(전체 레코드, 없으면 null).
 * @property {function(object): object} save
 *   전체 레코드를 저장(있으면 갱신, 없으면 생성). id 는 호출자가 이미 채워서 넘긴다.
 * @property {function(string): boolean} remove
 *   저장소에서만 지운다(휴지통 백업은 파사드의 책임 — 백엔드에 상관없이 동일해야 하므로).
 * @property {function(): object[]} rebuildIndex
 *   요약 캐시를 강제로 다시 만든다(파일 구현: 디렉터리 재스캔 / SQLite 구현: 그냥 재조회).
 *   여러 번 불러도 결과 건수가 같아야 한다(멱등).
 */

/**
 * SQL 라이브러리(스니펫) 저장소 계약. 이름 정제(safeName/safeScope)와 공용(_shared) 폴백은
 * 파사드(snippet-store.js)가 처리한다 — repo 는 이미 정제된 (scope, name) 만 받는다.
 *
 * @typedef {Object} SnippetRepo
 * @property {function(string): object[]} list 한 스코프의 항목 목록(본문 포함, 필터 없음).
 * @property {function(string, string): (object|null)} get 단건 조회.
 * @property {function(string, string, object): void} save 저장(신규/덮어쓰기).
 * @property {function(string, string): boolean} remove 삭제.
 * @property {function(): {scope:string, count:number}[]} scopes 스코프별 건수.
 */

/**
 * 접속 프로필 저장소 계약. 비밀번호 암호화/복호화는 파사드(connections.js) + secret.js 가
 * 전담한다 — repo 는 이미 암호화된 문자열을 그대로 저장할 뿐, 평문을 볼 일이 없다.
 *
 * @typedef {Object} ConnectionRepo
 * @property {function(): object[]} list 전체 목록(비밀번호 포함 원본, 필터/가공 없음).
 * @property {function(string): (object|null)} get 단건 조회.
 * @property {function(object): void} save 저장(신규/갱신). id 는 호출자가 채워서 넘긴다.
 * @property {function(string): boolean} remove 삭제.
 */

module.exports = { SCHEMA_VERSION };
