# R4b 정찰: Bridge.java, Caps.java, Plan.java, bridge.js 전수조사

## 총괄용 요약 (30행 이내)

**프로토콜**: stdin/stdout 라인 JSON. 응답은 `@@OT@@` 표식(드라이버 잡음 방지).
- 한 요청 한 응답 구조 (요청 id로 매칭)
- 비동기 워커 풀 처리, cancel/shutdown만 즉시 처리

**명령 30개**: ping, setDriverJars, driverInfo, connect, disconnect, sessions, shutdown, cancel, 
capabilities, serverInfo, execute, benchmark, compare, tournament, explain, displayCursor, sqlStats, 
describeQuery, schemas, objects, columns, indexes, constraints, tableStats, columnStats, estimateRows, 
ddl, commit, rollback, alterSession

**진행률 스트리밍**: **조건부 가능**. 현재 구조에서 중간 메시지(다른 event 이름)는 무시됨. 
같은 id로 여러 응답 시 첫 번째만 매칭되고 나머지는 로그로 흘러감(깨지지 않음).

**Caps 탐지**: 20개 Probe, serverInfo() 반환 16개 필드

**Oracle 버전**: V$SQL_PLAN_STATISTICS_ALL은 11.1+ 필수(11g에서 없음). 현재 코드는 try-catch로 처리.

---

## 질문 1: Node↔Java 프로토콜 & 명령 목록

### 프로토콜 구조 (Bridge.java:20-28, 77-87, 278-284)

**요청**: `{"id":"7","cmd":"execute","params":{...}}`
**응답**: `@@OT@@{"id":"7","ok":true,"data":{...},"elapsedMs":12.3}`
**오류**: `@@OT@@{"id":"7","ok":false,"error":{"message":"...","ora":"ORA-00942"}}`

**핵심**: stdin/stdout 라인 프로토콜, 한 요청 한 응답(id 매칭), @@OT@@ 표식으로 응답/로그 분리

### 명령 30개 (Bridge.java:139-262)

세션필요 여부에 따른 분류:

**세션 불필요 (8개)**: 
- ping, setDriverJars, driverInfo, connect, disconnect, sessions, shutdown, cancel

**세션 필요 (22개)**: 
- capabilities, serverInfo, execute, benchmark, compare, tournament
- explain, displayCursor, sqlStats, describeQuery, schemas, objects
- columns, indexes, constraints, tableStats, columnStats, estimateRows, ddl
- commit, rollback, alterSession

---

## 질문 2: 진행률 스트리밍 가능성

### 현재 응답 매칭 (bridge.js:192-206)

`pending.get(msg.id)` 로 요청을 찾고, 매칭 후 즉시 삭제(`pending.delete(id)`).
같은 id로 두 번째 응답이 오면 pending에 없어서 무시됨 (195줄 경고).

### 판정: **조건부 가능 (현재 구조에서 무시됨)**

**현 상태**: 모든 중간 진행 메시지 무시 → 진행률 표시 불가능

**개선안**:
1. 응답에 `"type": "progress"` 필드 추가, bridge.js에서 type별 처리
2. `pending.delete()` 를 완료 시에만 호출 (진행 중이면 유지)

---

## 질문 3: Caps.java 탐지 항목

### 20개 Probe (Caps.java:35-112)

**Plan (5개)**: plan_table, dbms_xplan_display, dbms_xplan_cursor, v$sql_plan, v$sql_plan_stats

**Runtime (5개)**: v$mystat, v$statname, v$sql, v$session, v$sql_monitor

**Dictionary (8개)**: user_tables, all_tables, dba_tables, all_tab_columns, all_indexes, all_ind_columns, all_constraints, all_tab_statistics, all_tab_col_statistics

**Meta (4개)**: v$version, product_component_version, dbms_metadata, nls_session_parameters

### serverInfo() 반환 16개 필드 (Caps.java:237-271)

sessionId, url, user, driver, databaseProduct, databaseVersion(총괄확인), jdbcVersion, schema,
banner(총괄확인), sid, instance, dbName, currentSchema, serverTime, nls, metaError(예외시)

---

## 질문 4: Plan.java Oracle 버전 의존성

### 사용 뷰/패키지

| 항목 | 최소버전 | 11g 호환성 |
|------|--------|---------|
| PLAN_TABLE | 7.0+ | ✓ |
| DBMS_XPLAN.DISPLAY | 10g+ | ✓ |
| DBMS_XPLAN.DISPLAY_CURSOR | 10g+ | ✓ |
| V$SESSION | 8i+ | ✓ |
| V$SQL_PLAN_STATISTICS_ALL | 11.1+ | ❌ 11g에서 없음 |
| V$SQL | 9i+ | ✓ |

### 11g 대응 현황 (Plan.java:280-290)

V$SQL_PLAN_STATISTICS_ALL을 try-catch로 감싸서 실패해도 계속 진행(rowsourceStats 필드만 빈다).

**결론**: 버전 의존성 문제 **없음** (graceful degradation 구현됨)

---
