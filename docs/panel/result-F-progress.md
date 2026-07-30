# 결과 · Slice F — 항목 #10 토너먼트 프로그래스바

담당 실행 에이전트 F · 2026-07-30

## 구현 요약 (스펙 D-003 4단 구조 그대로)

1. **Java 발신** — `Exec.tournament(Db.Session, Map, String reqId)` 로 시그니처 변경.
   `Bridge.dispatch(cmd, params, reqId)` 를 거쳐 reqId 를 받는다(요청에 이미 있는 값이 아니라
   Bridge 가 `handleSafely` 에서 파싱한 원 요청 id 를 그대로 넘김 — 최소 변경).
   - 예선(alive) 루프: `phase:"verify"`, total = 후보 수, 후보 1건 처리할 때마다 이벤트 1개.
   - 본선(measure) 루프: `phase:"measure"`, total = runs × lineup.size(), 실행 1건마다 이벤트 1개.
   - 발신은 신설한 `Bridge.event(reqId, "progress", map)` 정적 메서드가 담당(`@@OT@@` 표식·직렬화·
     flush 는 기존 `emit()` 재사용). `Exec.java` 에는 표식 문자열을 복제하지 않았다.

2. **`server/bridge.js` 파서 분기** — stdout 라인 파싱 시 `msg.event` 가 있으면(이미 `ready` 는
   그렇게 처리되고 있었음) `_handleEvent()` 로 보내고 `_resolve()`(promise 처리)는 건너뛴다.
   `event` 가 없는 기존 경로는 손대지 않았다. `progressBySession` 맵에 세션당 최신 1건만 보관.
   `request()` 가 `cmd==='tournament'` 이면 전송 직전 불확정 초기값(`total:null`)을 심어 두고,
   해당 요청이 **어떻게 끝나든**(정상 응답 / 에러 응답 / 타임아웃 / 브리지 프로세스 강제종료) 반드시
   `_finishProgress()` 로 `done=total, finished:true` 마감이 되도록 4곳(정상 resolve, 타임아웃,
   stdin 쓰기 실패, 프로세스 exit 시 pending 일괄 reject)에 모두 걸어 두었다 — 99% 정지 방지.

3. **`server/api.js`** — `GET /api/sql/tournament/progress?sessionId=` 추가. 정보 없으면
   `200 {running:false}` (404 아님). 메모리 맵만 읽으므로 DB·브리지 접근 없음(500ms 폴링 대비).

4. **웹 UI** (`web/js/views/candidates.js`, `web/js/api.js`, `web/js/i18n.js`)
   - `api.tournamentProgress()` 추가(기존 `sessionId=` 쿼리 패턴과 동일 스타일).
   - 토너먼트 실행 시 기존 "측정 중입니다…" 안내문 대신 프로그래스바로 **교체**.
   - `total` 미확정 구간은 불확정(왕복 이동) 막대, 확정되면 `%` 채움 + `예선/본선 N / M — 후보라벨`
     + 경과초. 500ms 폴링, `finally` 로 `clearInterval` 보장. 추가로 매 tick 마다 후보 탭
     (`.rpanel[data-tab="cands"]`)과 workbench 뷰가 여전히 활성 상태인지 자체 확인해 다른 화면으로
     이탈해도 스스로 멈춘다(workbench.js/app.js 는 건드리지 않음 — 소유권 밖).
   - i18n 6개 키 신설, ko/en/ja/zh 4개 로케일 전부 채움, `{done}`/`{total}`/`{sec}` 파라미터 치환 사용.

## 검증

1. **`node java/build.js --force`** → 성공 (8개 소스 컴파일).
2. **`npm test`** → 기존 163건 100% 유지 + 신규 4건 통과, exit code 0.
   신규 4건(모두 `test/run-tests.js` 끝에 **추가만** 함, 기존 코드 무변경):
   - 브리지 — `event` 필드 메시지는 promise 를 resolve/reject 하지 않는다 (요구사항 a)
   - 진행률 API — 정보 없는 세션은 404 아닌 `200 {running:false}` (요구사항 b, sessionId 없는
     경우도 별도 검증)
   - 브리지 — 토너먼트 응답 도착 시 `done===total`, `finished:true` 로 마감 (요구사항 c)
   - dispatch() 가 async 라 기존 동기 전용 test()/group() 틀에 얹지 못해, 파일 맨 끝에 자체
     pass/fail 집계 + `process.exitCode` 로 실패를 반영하는 별도 블록으로 분리했다(기존 "결과"
     집계·종료 로직은 무수정).
3. **시각 검증(헤드리스 크롬)** — `web/__verify-progress.html` 임시 하네스로 4개 로케일 ×
   4개 상태(불확정/예선진행/본선진행/완료) 스크린샷 확인. 막대 채움·라벨·경과초 모두 정상 표시.
   **확인 후 하네스 파일 삭제 완료**(배포물에 없음, `git status` 로 확인 가능).
4. **실 Oracle 토너먼트 검증 — 완료(추정 아님, 실측)**. `STATUS.md` 의 로컬 접속 정보
   (`jdbc:oracle:thin:@//localhost:1521/FREEPDB1`, user `orahelper`, 저장된 프로필
   `cms61dk1zd993c0`)로 실제 접속해 `OT_ORDERS`(30만 건) 풀스캔 SQL 로 후보 2개짜리 토너먼트를
   돌리고 500ms 폴링으로 실측했다. 관측된 시퀀스:
   - 시작 직후: `running:true, phase:null, total:null` (불확정 구간 — 실제로 존재함을 확인)
   - 예선: `phase:verify done:1/2 label:c1` → `2/2 label:c2`
   - 본선: `phase:measure done:1/9` → … → `9/9` (라운드로빈 순서대로 `__baseline/c1/c2` 회전,
     설계한 회전 로직과 일치)
   - 종료: `running:false, done:9, total:9, finished:true` — 99%에서 멈추지 않고 정상 마감 확인.
   검증에 사용한 스크립트는 세션 스크래치패드에만 있고 저장소에는 남기지 않았다.

## 파일 변경 목록
- `java/src/kr/foxnail/otuner/Bridge.java` — `dispatch` 에 reqId 인자 추가, `event()` 정적 메서드 신설
- `java/src/kr/foxnail/otuner/Exec.java` — `tournament()` reqId 인자, verify/measure 진행 이벤트 발신
- `server/bridge.js` — `progressBySession` 맵, `event` 필드 분기, `_finishProgress`, `getProgress()`
- `server/api.js` — `GET /api/sql/tournament/progress` 라우트
- `web/js/api.js` — `api.tournamentProgress()` (기존 파일, 소유권 밖이지만 최소 1개 함수만 추가)
- `web/js/views/candidates.js` — 프로그래스바 뼈대/렌더/폴링, 기존 안내문 대체
- `web/js/i18n.js` — `cd.progress.*` 6개 키, 4개 로케일
- `test/run-tests.js` — 파일 끝에 진행률 관련 신규 테스트 4건 추가(기존 내용 무변경)

## 소유권 밖인데 건드린 파일 1개
`web/js/api.js` 는 스펙의 배타 소유 목록에는 없었지만(금지 목록에도 없음), 웹 UI가 새 진행률
API 를 호출하려면 기존 `call()`/`withSession()` 래퍼를 거쳐야 해서 `tournamentProgress()` 함수
1개(기존 `tournament:` 항목 스타일과 동일하게)만 추가했다. 그 외 다른 함수는 손대지 않았다.
