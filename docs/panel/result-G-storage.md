# RESULT · Slice G — 항목 #4 (파일 기반 저장소 → 경량 DB)

실행 에이전트 G. 상세 로그: `logs/agent/G-storage.log`

## 결론

**기본 backend = sqlite, 폴백 = file.** `node:sqlite` 초기화가 성공하면 SQLite 가 유일한
쓰기 대상이다(이중 쓰기 없음). 실패하면(포터블 배포판의 node < 22 등) 자동으로 파일
저장소로 폴백한다. 기존 JSON/.sql 원본 파일과 `config/connections.json` 은 이관 후에도
삭제하지 않는다(이번 라운드 안전선).

> 최초 설계안은 "기본값을 file 로 유지"였으나, 총괄이 "발주자 요구(파일→DB 전환)가
> 배달되지 않는다"고 지적해 정정했다. 정정 지침에 따라 기존 테스트 1건(`저장하면 파일이
> 생긴다`)의 검증 방식을 조정하고, 파일 구현의 회귀 방지 목적은 새 테스트로 이전했다
> (아래 "테스트" 절 참고).

## 구조

```
server/repo/
  repository.js   인터페이스 계약(JSDoc) + SCHEMA_VERSION
  json-file.js    현행 파일 동작을 그대로 옮긴 구현(createTuningRepo/createSnippetRepo/createConnectionRepo)
  sqlite.js       node:sqlite 구현 (동일 함수 시그니처) + insertIfAbsent(마이그레이션 전용)
  migrate.js      backup() + migrate() — 단일 트랜잭션, 멱등(INSERT OR IGNORE)
  index.js        팩토리 — resolveBackend() 한 곳만 고치면 기본값을 바꿀 수 있다
```

- `tuning-store.js` / `snippet-store.js` / `connections.js` 는 얇은 파사드로 남았다.
  ID 생성, 기본값 병합, 이력 누적, 태그/건수 집계, Markdown/.sql 내보내기, 이름 정제
  (safeName/safeScope), 공용(_shared) 병합, 비밀번호 암호화, URL 조립 — 이런 "저장 방식과
  무관한 업무 로직"은 파사드에 남기고, CRUD 만 repo 로 위임했다.
- **`server/api.js` 는 한 줄도 고치지 않았다.** 세 store 모듈의 공개 함수 시그니처가
  이관 전과 동일하기 때문이다.
- 휴지통(trash) 백업(튜닝 삭제 시)은 백엔드에 상관없이 동일하게 동작해야 하므로 repo 가
  아니라 파사드(`tuning-store.js`)에 남겼다 — `repo.get(id)` 로 레코드를 읽어 JSON 을
  `data/tunings/.trash/`에 써낸다. 물리 파일이 있든 없든(SQLite 백엔드에도) 항상 동작한다.

## 스키마 (`data/oracletuner.db`)

FIX-SPEC 원안 그대로 `tunings`/`connections`/`meta` 테이블을 만들었다. **`snippets` 테이블은
스펙 원안(`id,scope,name,sql,created_at,updated_at`)에 `payload TEXT NOT NULL` 컬럼을
추가**했다 — title/tags/desc 를 보존해야 하는데 원안 컬럼만으로는 유실되기 때문이다. 튜닝·
접속 테이블과 같은 "payload 에 전문 보관" 원칙을 스니펫에도 동일 적용한 것으로, 총괄 검토가
필요하면 알려달라.

`meta.schema_version` = "1" (없으면 1로 초기화, 이후 단조증가만 예정). `meta.migrated` 에
이관 완료 시각을 기록해 이관이 앱 생애주기당 1회만 일어나게 한다.

`PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL` 적용.

## 안전선 준수

1. **백업**: SQLite 최초 오픈 시 `data/tunings`, `data/snippets`, `config/connections.json`
   을 `data/_backup-<ISO타임스탬프>/`로 복사(원본 삭제 없음). 실측: 이번 세션에서
   `data/_backup-2026-07-30T12-06-54-721Z/` 생성됨.
2. **폴백**: `server/repo/index.js` 의 각 `create*Repo()` 가 sqlite 경로를 try/catch 로
   감싸고, 실패 시 파일 구현으로 폴백 + `log.warn`. 새 테스트로 검증(아래).
3. **비밀번호**: `connections.js` 가 여전히 `secret.encrypt()`로 암호화한 문자열만 repo 에
   넘긴다. repo/DB 는 평문을 본 적이 없다. 알고리즘·키 유도는 손대지 않았다(`server/secret.js`
   무변경). 새 테스트로 파일·SQLite 양쪽의 저장 바이트를 직접 스캔해 평문 부재를 확인.

## `paths.js` 변경

`dbFile()` 함수 하나만 추가(`data/oracletuner.db` 반환). 기존 경로 정책은 그대로다.
항목 #6(설치판)이 `%LOCALAPPDATA%` 분리를 할 때 이 함수 한 곳만 고치면 된다.

## 테스트

`npm test` → **163 통과, 0 실패** (기존 153건 + 신규 10건).

- 기존 152건은 문구조차 바꾸지 않았다.
- 기존 1건(`튜닝 저장소 > 저장하면 파일이 생긴다`)은 총괄 지침에 따라
  `저장하면 조회된다`로 재조준했다 — 기본 backend 가 sqlite 로 바뀌어 더 이상 물리 파일
  존재를 보장하지 않기 때문이다(이중 쓰기는 하지 않는다는 지침 때문에 파일도 같이 쓰지
  않는다). 이 테스트가 지키던 "저장 후 조회된다" 라는 본질은 유지했고, "파일 구현이
  실제로 물리 파일을 만든다"는 회귀 방지 목적은 새 테스트로 그대로 옮겼다.
- 신규 10건 (`Slice G — 저장소 계약` 그룹, 모두 `os.tmpdir()` 임시 경로만 사용 — 실
  프로젝트 데이터 불변):
  1~2. 튜닝 repo 계약 — 파일/SQLite 양쪽에 **동일한 tuningContract() 함수**를 돌림
  3~4. 스니펫 repo 계약 — 파일/SQLite 동일 함수
  5~6. 접속 repo 계약 — 파일/SQLite 동일 함수
  7. 파일 구현이 실제로 물리 파일을 만드는지(회귀 방지, 위에서 이관된 목적)
  8. 이관 멱등성 — 픽스처(튜닝2/스니펫1/접속1)로 `migrate()` 두 번 실행, 두 번째는
     신규 삽입 0건 확인 + 원본 파일 존재 확인
  9. 폴백 — `paths.dbFile()` 가 던지도록 강제해 sqlite 경로 실패를 흉내내고, 파일로
     정상 저장/조회되는지 확인
  10. 비밀번호 — 파일 저장소의 `connections.json` 텍스트와 SQLite DB 파일 바이트를
      직접 스캔해 평문 문자열이 없는지 확인(`v1:` 암호문 포맷만 존재)

## `npm start` 실측 검증

포트 7070 에 이관 전 코드로 떠 있던 기존 프로세스(PID 27136, 20:42 시작)를 정리하고
새 코드로 재기동했다. 기동 로그(`logs/server.log`):
```
[2026-07-30 21:09:45] INFO server Oracle Tuner 기동 — node v24.15.0, win32
[2026-07-30 21:09:46] INFO server 듣는 중: http://127.0.0.1:7070/
[2026-07-30 21:09:46] INFO server 브리지 준비 완료 (java 17.0.19)
```
API 응답 실측:
- `GET /api/snippets` → 10건 반환 (이관 전 `data/snippets/**/*.sql` 파일 수와 일치)
- `GET /api/connections` → 1건 반환, `hasSavedPassword: true` (이관 전 `config/connections.json`
  의 접속 1건과 일치, 비밀번호 암호문이 보존되어 있음을 간접 확인 — 평문은 API 로 노출 안 됨)
- `GET /api/tunings` → `items: []` — **이건 이관 손실이 아니라 이관 전부터 0건**이었다.
  이관 직후 `data/oracletuner.db` 를 직접 열어 `SELECT COUNT(*) FROM tunings` 로도 0건을
  확인했고, 이관 전 `data/tunings/` 에도 인덱스 파일 외 실제 레코드가 없었다(디렉터리 직접
  확인, 테스트가 만든 레코드는 각 테스트가 끝에서 스스로 지운다). 스펙이 예시로 든
  "튜닝 10건" 규모의 실데이터는 이 환경에 애초에 없었다 — **정직하게 밝힌다.**
  스니펫(10건)과 접속(1건)은 실제로 있었고 이관·조회가 확인됐다.

## 파일 소유권

수정: `server/tuning-store.js`, `server/snippet-store.js`, `server/connections.js`,
`server/paths.js`, `test/run-tests.js`(추가만, 기존 문구는 위 1건만 재조준).
신규: `server/repo/{repository,json-file,sqlite,migrate,index}.js`.
`server/api.js`, `server/config.js`, `java/**`, `web/**` 는 손대지 않았다.
