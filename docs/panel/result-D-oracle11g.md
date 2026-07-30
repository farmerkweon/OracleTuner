# 실행 결과 · Slice D — 항목 #2 (Oracle 12c 미만 지원)

담당: 실행 에이전트 D · 완료 시각 2026-07-30 19:5x (로그 참조: `logs/agent/D-oracle11g.log`)

## 요약

`server/candidates.js` 가 런타임에 생성하던 `ROWNUM → FETCH FIRST` 후보(12.1 전용, 11g 이하에서
ORA-00933)를, 접속 DB 의 메이저 버전을 알 때만 인라인뷰(`SELECT * FROM (... ORDER BY ...) WHERE
ROWNUM <= n`) 방식으로 바꿔 생성하도록 버전 게이트를 추가했다. 버전 미상(null)이거나 12 이상이면
기존 동작(FETCH FIRST)을 그대로 유지해 회귀를 방지했다.

## 수정한 파일:행

| 파일 | 행 | 내용 |
|---|---|---|
| `server/candidates.js:130-133` | `generate()` 입력에 `dbMajorVersion`(number\|null) 필드 추가, ctx 에 저장 |
| `server/candidates.js:201-224` | `parseDbMajorVersion(v)` 순수 함수 신설 + `module.exports` 에 추가(224 → 실제 export 문은 1411) |
| `server/candidates.js:749-825` | `rewriteRownumToFetchFirst()` 를 버전 분기: 11 이하는 `RW_ROWNUM_INLINEVIEW`(전략 `FIX_ROWNUM_TOPN_INLINEVIEW`) 신규 후보, 그 외/미상은 기존 `RW_FETCH_FIRST` 그대로 |
| `server/candidates.js:1411` | `module.exports` 에 `parseDbMajorVersion` 추가 |
| `server/api.js:44-55` | `dbMajorVersionFor(sid)` 헬퍼 신설 — `sessionMeta` 에 **connect 시 이미 캐시된** `server.databaseVersion`(없으면 `server.banner`)을 `candidates.parseDbMajorVersion` 으로 파싱. capabilities/serverInfo 를 추가 호출하지 않음(D-2 요구사항 충족) |
| `server/api.js:573` (`/api/sql/candidates`) | `candidates.generate({ ..., dbMajorVersion: dbMajorVersionFor(sid) })` |
| `server/api.js:615` (`/api/sql/tournament`) | 동일 배관 |
| `server/analyzer.js:624` | 안내 문구를 "FETCH FIRST 로 줄이세요" → "12c 이상에서는 FETCH FIRST, 11g 이하는 인라인뷰+ROWNUM" 으로 보완. `:305` 는 이미 조건부 문구라 수정 안 함(스펙 지시대로) |
| `test/run-tests.js:550-584` | D-1 회귀/신규 동작 테스트 4건 추가(아래 목록) |
| `test/run-tests.js:592-621` | `parseDbMajorVersion` 단위 테스트 6건 추가(신규 그룹) |

## D-2 배관 조사 결과 (사전 조사)

- `api.js:170-179` (`/api/connect`) 에서 `sessionMeta.set(sid, { ..., server: r.server, capabilities: r.capabilities })` 로 **접속 시점에 이미 캐시**하고 있음을 확인.
- `r.server` 는 Java `Caps.serverInfo()` 결과이며 `databaseVersion`(`md.getDatabaseProductVersion()`, 예: `"Oracle Database 11g Enterprise Edition Release 11.2.0.4.0..."`)과 `banner`(`v$version` 배너, 폴백용)를 담고 있음을 `java/src/kr/foxnail/otuner/Caps.java:237-260` 에서 확인(읽기만 함, 수정 안 함).
- ⚠ 스펙 문서의 "`Db.java:135` 의 `version`(major.minor)" 서술은 확인 결과 **드라이버 자체 버전**(`driverInfo()`, JDBC 드라이버 버전)이었고, **DB 서버 버전이 아니었다.** 실제 DB 서버 버전은 `Caps.serverInfo()` 의 `databaseVersion`/`banner` 뿐이었다. 이 차이를 반영해 `dbMajorVersionFor()` 는 `server.databaseVersion || server.banner` 를 사용하도록 구현했다(둘 다 없으면 null → 회귀 안전).
- 결론: 캐시를 그대로 재사용했고, `/api/capabilities` 나 `serverInfo` 를 추가로 호출하지 않는다(요청마다 느려지는 문제 없음).

## D-3 전수 확인 결과

`server/candidates.js` 전체에서 아래 패턴을 grep 한 결과:

| 패턴 | 발견 위치 | 실제 SQL 생성 여부 |
|---|---|---|
| `FETCH FIRST` | `candidates.js:737`(구 라인, 현재는 버전분기 내) | **있음** — 이번에 버전 게이트 적용 완료 |
| `OFFSET ... ROWS` | 없음(토크나이저 키워드 집합에만 `OFFSET` 존재, 생성 코드 없음) | 없음 |
| `IDENTITY` | 없음 | 없음 |
| `DEFAULT ON NULL` | 없음 | 없음 |
| `WITH FUNCTION` | 없음 | 없음 |
| `LATERAL` | 없음 | 없음 |
| `CROSS APPLY` | 없음(Oracle 문법 아님, 애초에 안 씀) | 없음 |
| `APPROX_COUNT_DISTINCT` | 없음 | 없음 |
| `JSON_*` | 없음 | 없음 |
| `LISTAGG(DISTINCT` | 없음 | 없음 |
| `MATCH_RECOGNIZE` | 없음 | 없음 |
| `VALIDATE_CONVERSION` | 없음 | 없음 |
| 32K VARCHAR2 / `32767` | 없음 | 없음 |

→ **`FETCH FIRST` 한 곳 외에 12c+ 전용 문법을 생성하는 지점은 없음.** (정직하게 "없음" 명시)

`server/analyzer.js` 의 `:305`, `:624` 는 실행 SQL 이 아니라 안내 텍스트임을 재확인. `:305` 는 이미
"12c 이상이면" 조건이 있어 문제 없음(수정 안 함). `:624` 는 조건 없이 FETCH FIRST 만 안내하고 있어
버전별 안내로 보완함(위 표 참조).

## 추가한 테스트 목록 (`test/run-tests.js`)

그룹 `튜닝 후보 — 조건 변환`(기존 그룹) 안에 4건 추가:
1. `DB 버전 19(12c 이상)면 기존과 동일하게 FETCH FIRST 후보를 만든다(회귀 방지)`
2. `DB 버전 미상(null)이면 기존과 동일하게 FETCH FIRST 후보를 만든다(회귀 방지)`
3. `DB 버전 11 이하면 FETCH FIRST 대신 인라인뷰 + ROWNUM 후보를 만든다` (id/strategy/SQL 형태/문구 검증)
4. `DB 버전 10 도 11 이하와 동일하게 인라인뷰 경로를 탄다`

신규 그룹 `DB 버전 파싱 — parseDbMajorVersion` 6건:
1. `"11.2" → 11`
2. `"12.1" → 12`
3. `"19.0" → 19`
4. 전체 배너 문자열(`"Oracle Database 11g ... 11.2.0.4.0"`) → 11
5. `null`/`undefined` → `null`
6. 숫자를 못 찾는 쓰레기값(`'알 수 없음'`, `''`, `'   '`) → `null`

## 검증 결과

```
cd E:\IBANK\SeTools\OracleTuner; npm test
```
- 통과 150 · 실패 0
- 기존 140건 전부 유지(그대로 통과), 신규 10건 추가 통과.
- `node -c server/candidates.js`, `server/api.js`, `server/analyzer.js` 모두 문법 오류 없음.

## 미해결 / 정직한 한계

- **실제 11g DB 로 검증하지 못했다.** 사내에 11g 인스턴스가 없어 SQL 문자열 생성 결과(단위 테스트)만
  검증했다. 생성된 `SELECT * FROM (...) WHERE ROWNUM <= n` 형태는 Oracle 8i 이후 전 버전에서 표준적으로
  동작하는 패턴이라 위험은 낮다고 판단하지만, 실 DB 접속 후 토너먼트 실행까지는 이 세션에서 확인 못 했다.
- `dbMajorVersionFor()` 는 `sessionMeta` 캐시(connect 시점 스냅샷)만 본다. 접속 도중 DB 가 바뀌는
  경우(사실상 없음)는 고려하지 않았다 — 세션당 DB 는 고정이라는 기존 설계를 그대로 따른 것.
- `web/**` 는 소유권 밖이라 손대지 않았다. 프론트엔드에 `RW_ROWNUM_INLINEVIEW` 라는 새 후보 id/strategy
  가 화면에 특별 처리 없이도 기존 `RW_FETCH_FIRST` 와 동일한 스키마(`cand()` 골격)로 나가므로 별도
  화면 대응 없이도 정상 표시될 것으로 예상하나, 실제 화면 확인은 하지 못했다.
