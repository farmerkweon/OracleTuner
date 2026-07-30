# 결과 — Slice C (항목 #1 행 인출 상한 200만 + #7 서버측 테마)

## 요약
- `Exec.java`: `MAX_ROWS_CAP` 100,000→2,000,000 상수화. 신규 `keepRowsMax`(기본 5,000)를 파라미터로
  받아 `fetch()` 의 `rows`/`rowDigests` 누적을 별도 상한으로 묶음(소비/보관 분리).
  `keepRowsMax` 초과 시 `unordered` 해시·`_rowDigests` 를 내보내지 않고 `unorderedAvailable=false`,
  `unorderedSkippedReason` 로 명시. `ordered` 해시는 스트리밍이라 그대로 전체 행 기준 정확.
  신규 응답 필드: `consumedRows`, `keptRowCount`, `keepTruncated`. 기존 `rows`/`rowCount`/`truncated`/
  `keptRows` 필드 의미는 변경 없음.
- `config.js`: `execution.maxRows` 5000→2,000,000, `execution.keepRowsMax`(신규) 5000, `ui.theme`
  'default'→'forest'. `-Xmx768m` 은 그대로 둠(설계로 메모리 보호).
- `api.js`: `/api/sql/execute` 에 `keepRowsMax` 배관 추가. `run-script`(:308, 기본 200)와
  demo-setup(:854 maxRows:10, :884 maxRows:1)은 의도된 특수값이라 손대지 않음 — 각각 다중 문장
  순차 실행/데모 생성용이며 성능평가 목적이 아님.
- `workbench.js`: 결과 요약에 "소비 N행 · 표시 M행"을 분리 표시(`consumedRows`/`keptRowCount`/
  `keepTruncated` 사용). i18n 키는 `docs/panel/i18n-needed-from-C.md` 에 요청만 남기고 임시 평문 사용.
- `test/run-tests.js`: config 기본값 3건 추가(순수 함수 `config.defaults()` 기준, 사용자 설정파일에
  영향받지 않음).

## 검증
- `node java/build.js --force` → 성공(8개 소스 컴파일).
- `npm test` → **153 통과 / 0 실패**(기존 150 + 신규 3).
- `node -c server/api.js`, `node -c server/config.js`, `node --input-type=module -c` 로
  `workbench.js` 구문 검사 → 모두 통과.
- `git status` 로 소유 파일(Exec.java, config.js, api.js, workbench.js, run-tests.js)만
  개별 경로로 스테이징·커밋했음을 확인. 금지 파일(app.css/app.js/index.html/candidates.js/
  analyzer.js/i18n.js) 미접촉.

## 검증 못한 것 (정직한 고지)
1. **실 DB 200만 행 인출 검증 미수행.** 이 환경에 Oracle DB가 없어 실측 불가. 상한/메모리 보호
   로직은 코드 추적으로만 확인했다(아래 "코드 추적 검증" 참고).
2. 스펙이 요구한 신규 테스트 항목 (a) `rows` 길이가 `keepRowsMax` 이하 (b) `unordered` 해시가
   정상값처럼 반환되지 않는지 (c) `consumedRows` 가 실제 소비 행수와 같은지 — 이 3가지는
   `Exec.fetch()` 가 실제 `ResultSet` 을 필요로 하는 private 메서드라 DB 없는 Node 테스트 스위트
   (`test/run-tests.js`, `npm test` = `node test/run-tests.js`)로는 실행할 수 없었다. 이 프로젝트에는
   Java 쪽 단위테스트 하네스나 인메모리 JDBC 드라이버(H2 등)가 없다(`java/lib/` 에 `ojdbc11.jar`
   뿐). 새 Java 테스트 파일을 만드는 것은 배타 소유 파일 목록(5개) 밖이라 하지 않았다.
   대신 config 기본값 3건을 추가해 "배관이 올바른 기본값을 쓰는지"만 회귀 보호했다.

### 코드 추적 검증 (실행 대신 수동 트레이스)
- `count < keepRowsMax` 게이트가 `rows.add(...)` 와 `rowDigests.add(...)` 양쪽에 동일하게 적용됨
  → (a)에 해당하는 불변식은 코드 구조상 성립(반복문에서 `count` 는 단조증가, 게이트가 상한 미만일
  때만 추가를 허용).
- `keepTruncated = count > keepRowsMax` (루프 종료 후 최종 count 기준) 일 때만 `unordered`/
  `_rowDigests` 를 생략 — (b)의 안전장치는 분기 구조상 우회 불가(해당 분기에서 `h.put("unordered",...)`
  자체를 호출하지 않음).
- `consumedRows` 는 루프의 `count` 변수를 그대로 `Integer.valueOf(count)` 로 내보냄 — `rowCount` 와
  동일 값이므로 (c)는 정의상 항상 성립.
- 다음 슬라이스나 QA 단계에서 실 DB(또는 데모 스키마)가 준비되면 반드시 실측 검증을 추가로
  수행할 것을 권고한다.

## 커밋 (release/1.0.0-beta 브랜치)
1. `c76230e` feat(exec): 행 인출 상한 200만으로 상향, 소비/보관 상한 분리로 메모리 보호
2. `8a3f3d6` feat(config): 기본 행 인출 200만 · 기본 테마 forest
3. `5125909` feat(api): /api/sql/execute 에 keepRowsMax 배관 추가
4. `418f6de` feat(workbench): 결과 요약에 소비/표시 행수를 분리해 표시
5. `5480505` test(config): 행 인출/보관 상한, 테마 기본값 회귀 테스트 추가
