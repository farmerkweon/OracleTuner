# FIX SPEC · Slice F — 항목 #10 (토너먼트 진행 프로그래스바)

총괄 작성 · 2026-07-30 21:1x. 설계 결정은 `DECISIONS.md` 의 **D-003**.

---

## 발주자 요구
"토너먼트 실행시킬때 프로그래스바 필요. 전체 몇개중 몇개 수행중 등 적당한 정보도 보여주어야함."

## 확정 설계 (D-003) — SSE 를 만들지 않는다

정찰로 확인된 사실:
- Node↔Java 는 **stdin/stdout 라인 JSON**. 응답에 `@@OT@@` 표식을 붙여 드라이버 잡음과 구분한다.
  요청 `{"id":"7","cmd":"execute","params":{…}}` → 응답 `@@OT@@{"id":"7","ok":true,"data":{…}}`
- **요청 id 로 1:1 매칭.** 같은 id 로 응답이 여러 개 와도 **첫 번째만 매칭되고 나머지는 로그로
  흘러가 파서가 깨지지 않는다** (정찰 R4b 확인). ← 이게 이 설계의 근거다.
- SSE·WebSocket 은 서버에 **없다**.
- Java 워커는 요청을 풀에서 처리하고 `cancel`/`shutdown` 만 즉시 처리한다.
  **토너먼트 진행 중 다른 명령을 보내면 큐에서 대기**하므로 진행률을 Java 에 물어볼 수 없다.

그래서 **4단 구조**로 간다:

```
① Java  토너먼트 루프에서 진행 이벤트를 stdout 으로 흘린다
        @@OT@@{"id":"<요청id>","event":"progress","done":3,"total":12,"label":"후보 3"}
② Node  bridge.js 파서가 event 필드가 있으면 promise 를 resolve 하지 않고 진행률 맵에 저장
③ Node  api.js 가 GET /api/sql/tournament/progress?sessionId=… 로 그 맵을 읽어준다
④ 웹    토너먼트 실행 중 ~500ms 폴링해 프로그래스바를 갱신
```

**왜 SSE 가 아닌가**: 기존 요청/응답 매칭을 깨지 않고 증분으로 얹을 수 있다.
SSE 도입은 서버 구조 변경에 프록시·방화벽 변수까지 끌고 오는데, 폐쇄망 도구에 그만한 값을 못 한다.

---

## 수정 지침

### F-1. Java — 진행 이벤트 발신

토너먼트 진입점은 `java/src/kr/foxnail/otuner/Exec.java` **:820 부근**이다
(`int maxRows = Json.intv(params, "maxRows", 5000);` 로 시작하는 메서드).
그 안에서 후보를 순차 실행하는 루프가 두 군데 있다 — `alive`(:840 부근)와 `lineup`(:867 부근).

1. 먼저 **총 개수(total)를 루프 시작 전에 확정**하라. 후보 배열 길이다.
2. 각 후보 실행 **직전 또는 직후**에 진행 이벤트 1줄을 내보내라.
3. 이벤트 발신 함수는 `Bridge.java` 에 두어라 (`@@OT@@` 표식·JSON 직렬화·stdout 플러시를
   이미 그쪽이 담당한다). **표식 문자열을 Exec 에 하드코딩 복제하지 마라.**
   예: `Bridge.event(reqId, "progress", map)` 형태의 정적 메서드 신설.
4. `reqId` 를 Exec 까지 전달해야 한다. 이미 params 에 있는지 먼저 확인하고, 없으면
   Bridge 가 디스패치할 때 넣어주는 방식으로 최소 변경하라.
5. **단계 이름을 함께 보내라.** 토너먼트는 예선(alive 검증)과 본선(lineup 계측)이 나뉘므로
   `phase: "verify" | "measure"` 를 넣어 UI 가 "예선 3/12" 처럼 보여줄 수 있게 하라.

⚠ **stdout 오염 금지**: 진행 이벤트는 반드시 `@@OT@@` 표식을 붙여라. 표식 없는 줄을
흘리면 기존 파서가 로그로 취급하는 데 의존하게 되어 취약해진다.

### F-2. `server/bridge.js` — 파서 분기

응답 수신부에서 **`event` 필드가 있는 메시지는 promise 를 resolve 하지 말고** 별도 처리:
- `progressBySession` 맵에 `{ done, total, phase, label, ts }` 로 저장 (세션당 최신 1건만).
- 세션 id 가 이벤트에 없으면 요청 id → 세션 매핑을 bridge 가 이미 알고 있으니 그걸 쓰라.
- **기존 요청/응답 매칭 로직을 건드리지 마라.** `event` 가 없는 메시지의 경로는 그대로다.
- 토너먼트가 끝나면(정상·실패 무관) 해당 세션의 진행률을 `done===total` 또는 `finished:true` 로
  마감하라. 그러지 않으면 UI 프로그래스바가 99% 에서 영구히 멈춘다.

### F-3. `server/api.js` — 진행률 조회 라우트

`GET /api/sql/tournament/progress?sessionId=…` 를 추가.
- 응답: `{ running: boolean, done, total, phase, label, startedAt, finished }`
- 진행 정보가 없으면 `{ running: false }` 를 200 으로 반환하라. 404 로 하면 클라이언트가
  폴링마다 에러를 콘솔에 쌓는다.
- **가볍게 유지하라.** 이 라우트는 500ms마다 불린다. DB·브리지에 접근하지 말고 메모리 맵만 읽어라.

### F-4. 웹 UI — `web/js/views/candidates.js`

1. 토너먼트 실행 버튼을 누르면 프로그래스바를 노출하고 폴링을 시작, 응답이 오면 폴링 중지.
2. 표시 정보 (발주자: "전체 몇개중 몇개 수행중 등 적당한 정보"):
   - 막대(백분율) + `예선 3 / 12` 같은 수치 + 현재 후보 라벨
   - 경과 시간(초)도 함께 보여주면 좋다. 토너먼트는 오래 걸린다.
3. **폴링 정리 필수**: 성공·실패·화면 이탈 모든 경로에서 `clearInterval` 하라.
   뷰가 바뀌어도 타이머가 남으면 누수다. `finally` 로 확실히 정리하라.
4. `total` 을 모르는 초기 상태(첫 이벤트 도착 전)에는 **불확정(indeterminate) 막대**로 두고,
   0/0 을 "0%" 로 표시하지 마라. 멈춘 것처럼 보인다.
5. 기존 스피너/진행 텍스트가 있으면 **중복 표시하지 말고** 대체하라.

### F-5. i18n
새 문자열은 `web/js/i18n.js` 의 플랫 구조에 넣어라:
`'키': { ko: '…', en: '…', ja: '…', zh: '…' }` — **4개 로케일 전부** 채울 것.
파라미터는 `{done}`/`{total}` 치환을 쓰고 문장을 조각내지 마라(어순이 다른 언어에서 깨진다).
기존 키 네임스페이스 규칙(`cand.*` 등)을 먼저 Grep 해서 따르라.

---

## 검증 (필수)
1. `node java/build.js --force` 성공 — 실패 시 되돌리고 ERROR 보고
2. `npm test` — 기존 건수 유지 (현재 163건. 다른 에이전트가 늘리는 중이라 실행 시점 기준으로 판단)
3. **실제 토너먼트를 돌려 진행률이 올라가는지 확인하라.** DB 접속이 필요하다 —
   `STATUS.md` 에 로컬 Oracle 접속 정보가 있다(`jdbc:oracle:thin:@//localhost:1521/FREEPDB1`,
   user `orahelper`). 접속이 안 되면 **억지로 하지 말고**, 대신
   진행 이벤트를 흉내낸 단위 테스트(bridge 파서가 event 를 promise 로 resolve 하지 않는지,
   api 라우트가 맵을 올바로 반환하는지)로 대체하고 **"실 토너먼트 미검증"을 정직하게 명시**하라.
4. 폴링 누수 확인: 토너먼트 후 다른 뷰로 이동해도 타이머가 남지 않는지 코드 경로로 확인.

## 파일 소유권 (배타)
`java/src/kr/foxnail/otuner/Exec.java` · `java/src/kr/foxnail/otuner/Bridge.java` ·
`server/bridge.js` · `server/api.js` · `web/js/views/candidates.js` · `web/js/i18n.js`

**만지지 말 것**: `server/tuning-store.js` · `server/snippet-store.js` · `server/connections.js` ·
`server/paths.js` · `server/repo/**` · **`test/run-tests.js`** — 다른 에이전트(G)가 지금 작업 중이다.
테스트가 필요하면 `docs/panel/tests-needed-from-F.md` 에 케이스를 적어 넘겨라.
단, `git status` 로 `test/run-tests.js` 가 깨끗해졌다면(G 커밋 완료) 그때는 추가해도 된다.
