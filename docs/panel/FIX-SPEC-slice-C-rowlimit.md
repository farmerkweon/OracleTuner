# FIX SPEC · Slice C — 항목 #1 (행 인출 제한 200만) + #7 서버측 테마

총괄 직접 조사 · 2026-07-30 19:55. 실행 에이전트는 이 문서대로 작업한다.

---

## 발주자 요구
"행인출이 제한이 있어서 테스트할때 성능평가하기 힘듦. 기본 2000000 으로 변경"

## ⚠ 결론 먼저 — 숫자만 2000000 으로 바꾸면 **JVM 이 확실히 죽는다**

정찰 R1 은 "clamp 로직이 없음!" 이라고 보고했다. **오답이다.**
총괄이 직접 확인한 결과 **Java 쪽에 하드 캡 100,000 이 있다.** 이것이 진짜 병목이다.

### 확인된 사실 (총괄 실측)

| 위치 | 내용 |
|---|---|
| `server/config.js:46` | `execution.maxRows: 5000` ← 기본값 |
| `java/…/Exec.java:144` | `int maxRows = Json.intv(params, "maxRows", 5000);` |
| **`java/…/Exec.java:146`** | **`else if (maxRows <= 0 \|\| maxRows > 100000) maxRows = 100000;`** ← ★진짜 병목 |
| `java/…/Exec.java:170` | `if (!fullFetch) ps.setMaxRows(maxRows + 1);` |
| `java/…/Exec.java:260` | `if (count >= maxRows) { truncated = true; break; }` |
| **`server/config.js:27`** | **JVM 옵션 `['-Xmx768m', ...]` ← 힙이 768MB 뿐이다** |

⇒ 지금은 config 에서 2000000 을 보내도 Java 가 **100,000 으로 깎는다.**

### 메모리 폭탄 3곳 (`Exec.java` `fetch()` 내부)

`fetch()` 는 행을 읽으며 **두 개의 리스트에 누적**한다:

1. **`rows`** — `Exec.java:253` `List<Object> rows = Json.arr();` / `:274` `if (keepRows) rows.add(Arrays.asList(vals));`
   - `keepRows` 기본값 **true** (`Exec.java:151`, `server/api.js:277` `keepRows: body.keepRows !== false`)
   - 200만 행 × 컬럼수 만큼 `Object[]` + `Arrays.asList` 래퍼 → **수 GB**
2. **`rowDigests`** — `Exec.java:255` `List<String> rowDigests = hashResult ? new ArrayList<String>() : null;`
   / `:272` `rowDigests.add(hex(sha256(rowBytes)));`
   - `hashResult` 기본값 **true** (`Exec.java:150`)
   - **행당 64자 hex String 1개.** 200만 행 = 64자×200만 ≈ 256MB(문자) + String 객체 오버헤드 ≈ **380MB 이상**
   - 게다가 `:285` `Collections.sort(rowDigests)` 로 정렬하고, `:294` `out.put("_rowDigests", rowDigests)` 로
     **응답에 실어 Node 로 넘긴다** → Node 쪽에서 또 한 번 폭발
3. `ordered` MessageDigest (`:254, :270`) — 스트리밍이라 안전. 문제 없음.

**768MB 힙에서 2번(rowDigests)만으로도 OOM 이다.** 1번까지 겹치면 즉사.

### 이미 있는 정답 — `fullFetch` (작성자가 이미 설계해 둠)

`Exec.java:136-146` 주석이 발주자의 불만을 그대로 예견하고 있다:
> "성능 측정에서 이것이 결정적이다. maxRows 로 잘라 읽으면 '전체 스캔 30만 건'의 비용이
>  중간에 끊겨, 튜닝 전/후가 **둘 다 빨라 보이는** 착시가 생긴다.
>  실제 부하를 재려면 질의가 만들어 내는 행을 모두 소비해야 한다."

`fullFetch: true` 면 `maxRows = Integer.MAX_VALUE` 로 두고 `ps.setMaxRows` 도 걸지 않는다(`:145, :169-170`).
즉 **끝까지 읽고 행은 버린다** — 성능평가에 정확히 필요한 동작이다.

---

## 설계 원칙 (이 슬라이스의 핵심)

> **"얼마나 소비하는가(성능의 진실)" 와 "얼마나 보관하는가(메모리·UI)" 를 분리한다.**

| 개념 | 의미 | 상한 |
|---|---|---|
| `maxRows` | ResultSet 에서 **소비(consume)** 할 행수. 측정의 정확도를 결정 | **2,000,000** (발주자 요구) |
| `keepRowsMax` (**신규**) | 응답에 **보관(retain)** 할 행수. 메모리·전송량을 결정 | **5,000** (기본) |

200만 행을 실제로 읽어 부하를 정직하게 재면서, 메모리는 5,000행 분량으로 묶어둔다.
브라우저 그리드는 어차피 200만 행을 못 그린다.

---

## 수정 지침

### C-1. `java/src/kr/foxnail/otuner/Exec.java`

1. **`:146` 하드 캡 상향** — 상수로 추출할 것 (매직넘버 제거):
   ```java
   /** maxRows 로 허용하는 절대 상한. 성능평가를 위해 200만 행까지 소비를 허용한다. */
   private static final int MAX_ROWS_CAP = 2_000_000;
   /** 응답에 보관하는 행수의 기본 상한. 이걸 넘는 행은 소비만 하고 버린다(메모리 보호). */
   private static final int DEFAULT_KEEP_ROWS_MAX = 5_000;
   ```
   `:146` → `else if (maxRows <= 0 || maxRows > MAX_ROWS_CAP) maxRows = MAX_ROWS_CAP;`

2. **`keepRowsMax` 파라미터 신규 수신** (`:151` 근처):
   ```java
   int keepRowsMax = Json.intv(params, "keepRowsMax", DEFAULT_KEEP_ROWS_MAX);
   if (keepRowsMax < 0) keepRowsMax = 0;
   ```
   `fetch(rs, maxRows, keepRows, hashResult)` → `fetch(rs, maxRows, keepRows, keepRowsMax, hashResult)`

3. **`fetch()` 누적 상한 적용** (`:253-276`):
   - `rows.add(...)` 를 `if (keepRows && count < keepRowsMax)` 로 감쌀 것.
   - `rowDigests.add(...)` 도 **동일한 상한**을 적용할 것.
     `rowDigests` 는 `unordered` 해시(순서 무관 비교)용인데, 상한을 넘으면 그 해시는
     **부분 결과가 되어 거짓말이 된다.** 그러므로:
     - 상한 초과가 발생하면 `unordered` 해시를 **내보내지 말고**(또는 `null`),
       `hash.unorderedAvailable = false`, `hash.unorderedSkippedReason = "keepRowsMax 초과"` 를 넣어라.
     - **절대로 부분 rowDigests 로 계산한 unordered 해시를 정상값처럼 반환하지 마라.**
       결과 동일성 검증이 조용히 틀리는 것이 이 프로젝트에서 가장 위험한 회귀다.
     - `ordered` 해시(스트리밍)는 전체 행 기준으로 계속 정확하다 — 그대로 유지.
   - `:294` `out.put("_rowDigests", rowDigests)` 도 상한 초과 시 넣지 말 것(Node 쪽 폭발 방지).
   - 응답에 다음을 **반드시** 추가해 사용자가 진실을 알 수 있게 하라:
     `consumedRows`(=count, 실제 소비 행수), `keptRowCount`(보관 행수), `keepTruncated`(boolean)

4. `keptRows`/`truncated` 기존 필드의 의미를 **바꾸지 마라** (기존 UI·테스트가 쓴다). 필드는 추가만.

### C-2. `server/config.js`

1. `:46` `maxRows: 5000` → **`maxRows: 2000000`**
2. `execution` 에 신규 키 추가 — 주석으로 이유를 남길 것:
   ```javascript
   /**
    * 응답에 보관·전송할 행수 상한. maxRows(소비 행수)와 별개다.
    * maxRows 200만을 그대로 보관하면 JVM 힙(-Xmx768m)이 터진다.
    */
   keepRowsMax: 5000,
   ```
3. `:57` `ui.theme: 'default'` → **`'forest'`** (항목 #7 의 서버측 기본값. Slice A 가 클라이언트측을 이미 처리했다.)
4. **`:27` `-Xmx768m` 은 그대로 둔다.** 힙을 키우는 대신 메모리를 설계로 묶는다 —
   폐쇄망 VDI 는 RAM 여유가 적다. 힙 증설은 최후의 수단이다.
   단 `Exec.java` 에서 `OutOfMemoryError` 를 잡아 **"행 보관 상한을 낮추세요"** 라는
   실행 가능한 메시지로 바꿔주면 좋다(있으면 가점, 없어도 됨).

### C-3. `server/api.js` 배관

- `:277` `keepRows: body.keepRows !== false` 옆에 `keepRowsMax` 를 전달하라:
  `keepRowsMax: Number(body.keepRowsMax) || cfg.execution.keepRowsMax`
- `maxRows` 를 넘기는 모든 지점에서 `cfg.execution.maxRows` 가 새 기본값(200만)으로
  동작하는지 확인하라. 특히 `:296` `Number(body.maxRows) || 200`(스크립트 실행)은
  **의도적으로 작은 값**일 수 있으니 함부로 바꾸지 마라 — 확인 후 판단하고 보고서에 근거를 남겨라.
- `:854`, `:884` 는 `maxRows: 1` 등 특수 목적이다. **건드리지 마라.**

### C-4. UI 정직성 (`web/js/views/workbench.js`)

결과 그리드 위에 실제 수치를 보여줘라 — 발주자가 성능평가를 하려는 것이므로
"몇 행을 실제로 읽었는지"가 표시돼야 의미가 있다:
`소비 1,234,567행 · 표시 5,000행 · 12.34초` 형태.
i18n 키를 새로 만들 때는 `web/js/i18n.js` 의 플랫 구조(`'key': { ko, en, ja, zh }`)를 따르되,
**i18n.js 는 다른 슬라이스 소유이므로 수정하지 말고**, 필요한 키 목록을
`docs/panel/i18n-needed-from-C.md` 에 적어 넘겨라. 임시로는 기존 키 또는 평문을 써도 된다.

### C-5. Java 재빌드 (필수)

`Exec.java` 를 고쳤으면 반드시:
```
cd E:\IBANK\SeTools\OracleTuner
node java/build.js --force
```
빌드 실패하면 **되돌리고 ERROR 로 보고**하라. 컴파일 안 되는 코드를 커밋하지 마라.

---

## 검증 (필수)

1. `node java/build.js --force` 성공
2. `npm test` — 기존 150건 전부 유지 (Slice D 가 10건 추가해 150건이다)
3. **신규 테스트 추가**: `keepRowsMax` 초과 시
   (a) `rows` 길이가 `keepRowsMax` 이하인지
   (b) `unordered` 해시가 정상값처럼 반환되지 **않는지** (이게 핵심 안전 테스트)
   (c) `consumedRows` 가 실제 소비 행수와 같은지
4. 실 DB 로 200만 행을 돌려볼 수 없으면 **정직하게 "실 DB 대량 검증 미수행"** 이라고 보고서에 쓸 것.
   추정치를 실측인 것처럼 쓰지 마라.

## 파일 소유권 (배타)
- `java/src/kr/foxnail/otuner/Exec.java` ★
- `server/config.js` ★
- `server/api.js` ★
- `web/js/views/workbench.js` ★
- `test/run-tests.js` ★ (추가만)

**만지지 말 것**: `web/css/app.css`, `web/js/app.js`, `web/index.html` (Slice A 소유),
`server/candidates.js`, `server/analyzer.js` (Slice D 가 방금 커밋), `web/js/i18n.js`.
