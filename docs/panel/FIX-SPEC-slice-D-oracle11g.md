# FIX SPEC · Slice D — 항목 #2 (Oracle 12c 미만 지원)

총괄 직접 진단 · 2026-07-30 19:42. 실행 에이전트는 이 문서를 근거로 작업한다.

---

## 발주자 증상
"데모 sql 오라클 12 이하 버전 지원 안하는 경우도 있음."

## 정찰 R5 의 결론은 **불완전하다** (반박)
R5 는 `demo/*.sql` 와 `data/snippets/_shared/*.sql` 만 검사하고
"Oracle 11g 완전 호환, 비호환 없음" 이라고 보고했다. **정적 SQL 파일만 본 것이다.**

총괄이 직접 grep 해서 찾은 진짜 원인은 **튜너가 런타임에 *생성*하는 후보 SQL** 이다.

## 진짜 원인 【확정】

`server/candidates.js:715-754` — `WHERE ROWNUM <= n` + `ORDER BY` 패턴을
**`FETCH FIRST n ROWS ONLY` 로 재작성하는 후보**를 만든다:

- `candidates.js:715` 주석: `/** WHERE ROWNUM <= n + ORDER BY → ORDER BY ... FETCH FIRST n ROWS ONLY */`
- `candidates.js:737` : `next2 = next2.replace(/\s+$/, '') + '\nFETCH FIRST ${n} ROWS ONLY';`
- `candidates.js:742` : title `'ROWNUM 상위 N건 → FETCH FIRST (결과 정확성 교정)'`
- `candidates.js:750` : 설명에 **"FETCH FIRST(12c 이상)"** 라고 스스로 12c 전용임을 명시하고 있다.

`FETCH FIRST` 는 **Oracle 12.1 부터** 지원된다. 11g 이하에서는 `ORA-00933` 로 실패한다.

이 후보는 **데모 시나리오 ⑦(`data\snippets\_shared\⑦ ROWNUM + ORDER BY (결과가 틀림).sql`)**
에서 정확히 트리거된다. 그래서 발주자에게는 "데모 SQL 이 12c 이하에서 안 된다"로 보인다.
(`demo/02-examples.js:86` 도 이 시나리오 설명에 FETCH FIRST 를 언급한다.)

## 버전 감지는 **이미 구현되어 있다** (새로 만들 필요 없음)

- `java/src/kr/foxnail/otuner/Db.java:135` → `r.put("version", d.getMajorVersion() + "." + d.getMinorVersion())`
- `java/src/kr/foxnail/otuner/Caps.java:246` → `m.put("databaseVersion", md.getDatabaseProductVersion())`
- `Caps.java:100-104` → `v$version` 프로브, 실패 시 `product_component_version` 로 폴백
- 서버에서는 `server/api.js:202-205` 에서 `bridge.request('capabilities', ...)` 로 caps 를 받아
  `meta.capabilities` 에 담는다.

⇒ **DB 메이저 버전을 이미 알 수 있다.** 그걸 후보 생성기에 넘겨주기만 하면 된다.

---

## 수정 지침

### D-1. 버전 인지 후보 생성 (핵심)

`server/candidates.js` 의 `generate({...})` 진입점(`api.js:556`, `api.js:598` 에서 호출)에
**`dbMajorVersion`(number|null) 옵션을 추가**한다.

`ROWNUM → FETCH FIRST` 재작성 함수(`candidates.js:715` 부근)를 다음과 같이 분기한다:

| DB 버전 | 생성할 후보 |
|---|---|
| **12 이상** 또는 **버전 미상(null)** | 현행 유지 — `ORDER BY ... FETCH FIRST n ROWS ONLY` |
| **11 이하** | **인라인뷰 방식** — 아래 참조 |

11g 이하용 대체 재작성 (정확성 교정 효과는 동일하다):
```sql
SELECT * FROM (
  <원본 SELECT ... ORDER BY ...>
) WHERE ROWNUM <= n
```
정렬을 인라인뷰 안에서 먼저 수행하고 바깥에서 ROWNUM 을 걸어야
"정렬 후 상위 N건"이 정확히 나온다. 이 처방은 이미 `server/analyzer.js:305` 가
사용자에게 안내하는 문구와 **동일한 처방**이다 (일관성 확보).

후보 메타데이터도 함께 고칠 것:
- `title` — 11g 경로에서는 `'ROWNUM 상위 N건 → 인라인뷰 정렬 후 ROWNUM (결과 정확성 교정)'`
- `strategy` — 11g 경로용 별도 식별자 (예: `FIX_ROWNUM_TOPN_INLINEVIEW`). 기존 식별자를 재사용하지 말 것.
- 설명에서 `"FETCH FIRST(12c 이상)"` 문구가 11g 경로에 남지 않게 할 것.
- **버전 미상(null)일 때는 현행 동작을 바꾸지 말 것** — 회귀 방지. 단 설명에
  "12c 이상에서만 동작합니다" 경고를 유지/추가한다.

### D-2. 배관 (plumbing)

`server/api.js` 에서 `candidates.generate(...)` 호출 지점(**:556, :598 두 곳 모두**)에
현재 세션의 DB 메이저 버전을 넘긴다. 방법:
1. 이미 세션별로 caps/meta 를 캐시하고 있는지 먼저 확인하라(`api.js:200-206` 주변).
   캐시가 있으면 거기서 꺼내 쓴다. **capabilities 를 매 요청마다 새로 부르지 마라**(느려진다).
2. `databaseVersion` 문자열(예: `"Oracle Database 11g Enterprise Edition Release 11.2.0.4.0"`)
   또는 `version`(예: `"11.2"`) 에서 **메이저 정수**를 뽑는 헬퍼를 하나 만든다.
   `Db.java:135` 의 `version` 이 `"major.minor"` 형태라 파싱이 쉽다. 둘 다 없으면 `null`.
3. 파싱 헬퍼는 순수 함수로 분리하고 **단위 테스트를 추가**하라(아래 D-4).

### D-3. 12c 전용 문법을 생성하는 다른 곳도 전수 확인

`server/candidates.js` 전체(57KB)를 통째로 읽지 말고, 아래 패턴을 **grep** 해서
다른 12c+ 전용 문법 생성 지점이 있는지 확인하고 결과를 보고서에 표로 남겨라:
`FETCH FIRST` · `OFFSET ... ROWS` · `IDENTITY` · `DEFAULT ON NULL` · `WITH FUNCTION` ·
`LATERAL` · `CROSS APPLY` · `APPROX_COUNT_DISTINCT` · `JSON_*` · `LISTAGG(DISTINCT` ·
`MATCH_RECOGNIZE` · `VALIDATE_CONVERSION` · 32K VARCHAR2
찾으면 같은 방식으로 버전 게이트를 걸어라. 없으면 "없음" 이라고 명시하라.

`server/analyzer.js:305, 624` 의 문구는 **안내 텍스트일 뿐 실행 SQL 이 아니다.**
:305 는 이미 "12c 이상이면" 이라고 조건을 밝히고 있어 문제없다.
:624 ("상위 N건만 필요하면 FETCH FIRST 로 줄이세요")는 버전 조건이 없으니
**"12c 이상이면 FETCH FIRST, 11g 이하는 인라인뷰 + ROWNUM"** 으로 문구만 보완하라.

### D-4. 테스트 (필수)

`test/run-tests.js`(44KB — 통째로 읽지 말고 기존 테스트 작성 패턴만 파악) 에 추가:
1. 버전 파싱 헬퍼 단위 테스트 — `"11.2"`→11, `"12.1"`→12, `"19.0"`→19,
   `"Oracle Database 11g ... 11.2.0.4.0"`→11, `null`/쓰레기값→null
2. `candidates.generate({ dbMajorVersion: 11, ... })` 가 ROWNUM+ORDER BY SQL 에 대해
   **FETCH FIRST 를 포함하지 않는** 후보를 만드는지
3. `dbMajorVersion: 19` 및 `null` 에서는 기존과 동일하게 FETCH FIRST 후보가 나오는지(회귀 방지)

---

## 파일 소유권 (배타)
- `server/candidates.js` ★
- `server/api.js` ★
- `server/analyzer.js` ★ (D-3 문구 보완만)
- `test/run-tests.js` ★ (추가만, 기존 테스트 삭제·수정 금지)

**만지지 말 것**: `server/config.js`(다른 슬라이스 소유), `web/**`(Slice A 작업 중), `java/**`.
Java 는 이번 슬라이스에서 **수정 불필요** — 버전 정보가 이미 나오고 있다.
