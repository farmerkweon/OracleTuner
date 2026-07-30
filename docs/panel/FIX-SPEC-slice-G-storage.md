# FIX SPEC · Slice G — 항목 #4 (파일 기반 저장소 → 경량 DB)

총괄 작성 · 2026-07-30 20:5x. 결정 근거는 `DECISIONS.md` 의 **D-001**.

---

## 발주자 요구
"파일기반 xml db기반으로 변경. 만약 lite한 db를 사용할 수 있다면 교체해도 됨.
용량을 너무 차지 하면 안됨. 억세스db처럼 작은거면 오케이.
하지만 윈도우 전용이라면 그냥 xml 사용하는 것이 나음."

## 확정 결정 (D-001) — `node:sqlite`
총괄이 실측 확인: `node -v` = **v24.15.0**, `require('node:sqlite')` + CREATE/INSERT/SELECT **정상**.
- 추가 용량 **0 B** (node.exe 내장). npm 설치·네이티브 빌드·컴파일러 불필요 → 폐쇄망 VDI 적합
- **크로스플랫폼** → 발주자의 "윈도우 전용이면 XML" 조건에 해당하지 않음
- 탈락: `better-sqlite3`(네이티브 빌드 필요), MS Access(윈도우 전용 + ACE 드라이버 별도 설치)

---

## 현황 (정찰 R1)

| 저장소 | 현재 형식 | 위치 |
|---|---|---|
| `server/tuning-store.js` | 튜닝 1건 = JSON 파일 1개 + `index.json` 캐시 + `.trash/` 백업 | `data/tunings/` |
| `server/snippet-store.js` | SQL 스니펫 = `.sql` 파일 | `data/snippets/_shared/` |
| `server/connections.js` | `{version:1, connections:[...]}` JSON 1개 | `config/connections.json` |

셋 다 `writeAtomic`(temp 파일 → rename) 을 쓴다. 경로는 `server/paths.js` 가 결정한다.

---

## 설계 (반드시 이 순서로)

### G-1. 먼저 **경계(interface)** 를 만든다 — 이게 이 슬라이스의 핵심

DB 로 직행하지 말 것. 먼저 저장소 인터페이스를 뽑고 **현행 파일 구현을 그 뒤로 옮긴다.**
인터페이스 없이 SQLite 로 갈아타면 **문제가 생겼을 때 롤백할 수단이 없다.**

```
server/repo/
  index.js          팩토리 — 설정·가용성에 따라 sqlite | jsonfile 구현을 고른다
  repository.js     인터페이스 문서화(JSDoc) + 공통 검증
  json-file.js      현행 동작을 그대로 옮긴 구현 (동작 변경 금지)
  sqlite.js         node:sqlite 구현
```

각 저장소의 **공개 함수 시그니처를 바꾸지 마라.** `tuning-store.js` 등은 얇은 파사드로 남기고
내부만 repo 로 위임한다. → `server/api.js` 의 호출부를 고칠 필요가 없어야 한다.
(호출부를 고쳐야 한다면 설계가 틀린 것이다.)

### G-2. 스키마

```sql
CREATE TABLE IF NOT EXISTS tunings (
  id TEXT PRIMARY KEY, scope TEXT, name TEXT, sql_ref TEXT, status TEXT,
  created_at TEXT, updated_at TEXT, payload TEXT NOT NULL   -- 원본 JSON 전문
);
CREATE INDEX IF NOT EXISTS ix_tunings_scope_name ON tunings(scope, name);
CREATE INDEX IF NOT EXISTS ix_tunings_updated ON tunings(updated_at DESC);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY, scope TEXT, name TEXT, sql TEXT NOT NULL,
  created_at TEXT, updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_snippets ON snippets(scope, name);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, name TEXT, payload TEXT NOT NULL, sort_order INTEGER
);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);  -- schema_version 등
```
- **`payload` 에 원본 JSON 전문을 그대로 보관**한다. 조회·정렬에 쓰는 필드만 컬럼으로 승격.
  이렇게 하면 스키마가 애플리케이션 구조 변화를 따라가지 못해 데이터를 잃는 일이 없다.
- `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL` 로 열어라.
- `meta.schema_version` 을 기록하고, 값이 없으면 1 로 초기화.

### G-3. 이관 (마이그레이션) — 안전선 3개는 절대 양보 금지

1. **백업 먼저.** 이관 전 `data/` 와 `config/connections.json` 을
   `data/_backup-<타임스탬프>/` 로 **복사**한다. 원본을 지우지 않는다.
2. **원본 파일을 삭제하지 마라.** 이관 후에도 JSON/.sql 원본은 그대로 둔다.
   (다음 라운드에서 안정성이 확인된 뒤 정리할 문제다. 이번엔 건드리지 않는다.)
3. **멱등**하게 만들어라. 이미 이관된 id 는 건너뛴다. 여러 번 실행해도 같은 결과여야 한다.
4. 이관은 **단일 트랜잭션**으로 묶고, 실패하면 롤백 후 파일 모드로 폴백한다.
5. 이관 건수를 로그에 남겨라: `INFO repo 이관 완료 tunings=12 snippets=10 connections=2`

### G-4. 폴백 (필수)

```javascript
// 의사 코드
let impl = null;
try {
  const sqlite = require('node:sqlite');   // Node 22+ 내장. 없으면 throw
  impl = createSqliteRepo(sqlite, dbPath);
} catch (e) {
  log.warn(`SQLite 사용 불가(${e.message}) — 파일 저장소로 동작합니다`);
  impl = createJsonFileRepo(paths);
}
```
`require('node:sqlite')` 가 던지는 경우가 실제로 있다: **포터블 배포판이 번들한 node 가 22 미만**.
그때 앱이 죽으면 안 된다. **반드시 파일 모드로 계속 동작해야 한다.**

### G-5. ⚠ 보안 — 접속 정보

`config/connections.json` 의 비밀번호는 `server/secret.js` 가 암호화해서 보관한다.
**SQLite 로 옮길 때 평문으로 저장하지 마라.** 기존 `secret.js` 암호화 경로를 그대로 통과시켜
암호문을 `payload` 에 담아라. 암호화 방식·키 유도 방법을 바꾸지 마라.
이 항목을 어기면 자격증명 유출이다 — 다른 어떤 목표보다 우선한다.

### G-6. DB 파일 위치

`server/paths.js` 가 결정하게 하라 (`data/oracletuner.db` 기본).
**⚠ 항목 #6(설치판)에서 `paths.js` 를 다시 고쳐 `%LOCALAPPDATA%` 로 분리할 예정이다.**
그러니 `paths.js` 에 **DB 경로를 반환하는 함수 하나**를 추가하는 형태로만 손대고,
경로 정책 자체는 바꾸지 마라. #6 이 그 함수 한 곳만 고치면 되게 만들어라.

---

## 검증 (필수)
1. `npm test` — 기존 **153건 전부 유지**
2. **신규 테스트 추가** (`test/run-tests.js`):
   - SQLite 구현과 JSON 구현이 **같은 인터페이스 계약**을 만족하는지 (동일 테스트를 두 구현에 돌리는 형태 권장)
   - 이관 멱등성: 두 번 이관해도 건수가 늘지 않는다
   - 폴백: sqlite 생성이 실패해도 파일 모드로 정상 동작한다
   - 접속정보 비밀번호가 **평문으로 저장되지 않는다**
3. `npm start` 로 기동 → 기존 데이터(튜닝 10건 등)가 화면에 그대로 보이는지 확인.
   실제로 확인했으면 그 근거(로그 줄·건수)를 보고서에 쓰고, 못 했으면 "미검증"이라고 쓸 것.

## 파일 소유권 (배타)
`server/repo/**`(신규) · `server/tuning-store.js` · `server/snippet-store.js` ·
`server/connections.js` · `server/paths.js` · `test/run-tests.js`

**만지지 말 것**: `server/api.js`(G-1 을 제대로 하면 고칠 필요가 없다. 고쳐야 한다면 보고하고 멈춰라),
`server/config.js`, `java/**`, `web/**`(다른 에이전트 작업 중).
