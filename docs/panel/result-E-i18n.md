# 실행 에이전트 E — 다국어지원 (settings/schema/connect) 결과

## 범위
소유 파일: `web/js/i18n.js`, `web/js/views/settings.js`, `web/js/views/schema.js`,
`web/js/views/connect.js`, `web/index.html`

## 스캔 결과 (파일별 하드코딩 문자열 건수)
| 파일 | 건수 | 비고 |
|---|---|---|
| `web/js/views/settings.js` | 17 | 토스트/confirm/진단 라벨/버튼 라벨 |
| `web/js/views/schema.js` | 46 | 그리드 컬럼 헤더 다수(4개 탭 × 6~8열), toast/confirm |
| `web/js/views/connect.js` | 36 | 목록/폼/상태뱃지/권한티어 enum 표시명 |
| `web/index.html` | 0 | **이미 `data-i18n`/`data-i18n-ph`/`data-i18n-title` 로 전면 적용되어 있음** — 수정 불필요 (언어 select 의 `한국어/English/日本語/中文` 는 각 언어의 자국어 표기이므로 의도적으로 미번역) |

## 신규 키 (i18n.js `M` 사전, ko/en/ja/zh 전부 채움)
- `se.*` 18개 (설정 화면: 로드/저장/재기동/빌드/드라이버 인식/Java 검색 메시지, 진단 실행환경 라벨)
- `sc.*` 39개 (스키마: 목록/상세 조회 메시지, columns/indexes/constraints/stats 4개 탭의 컬럼 헤더 전부, 행수 실측 confirm/결과/실패, 통계 kind 라벨)
- `cn.*` 33개 (접속 모달: 목록/폼 메시지, 시험/접속 confirm·toast·log, 상태뱃지, 권한티어 enum 표시명 `표준/기본/없음`, `실적포함/세션통계/시간만`, `JDBC만`)
- 총 신규 키 90개. 기존 네임스페이스(`se.`/`sc.`/`cn.`) 규칙을 그대로 따름. 기존 `se.use`, `top.disconnect`, `top.connect`, `top.notConnected` 는 재사용(중복 키 생성 안 함).

기존 키 포함 사전 전체 367개 키 전수 검사 — **ko/en/ja/zh 4개 로케일 모두 존재 확인** (임시 검증 스크립트 실행 후 삭제).

### ja/zh 번역 검수 필요 여부
전 90개 신규 키 모두 en 값만 넣지 않고 ja/zh 실제 번역을 직접 채웠음(기존 사전의 용어와 일치시킴: 스키마→スキーマ/模式, 저장→保存, 접속→接続/连接 등). 다만 기계 번역이 아닌 사람 손 번역이 아니므로, **네이티브 검수는 권장**. 특히 아래는 검수 우선순위가 높음:
- `cn.testOk`/`cn.statusTitle` 등 줄바꿈 포함 다문장 메시지
- `sc.countConfirm` confirm 대화상자 문구(어순)

## 발견 및 수정한 버그 (사전 조사에는 없던 것)
- **`schema.js` `loadStats()`**: 지역변수명이 `t`(Promise.all 구조분해 결과)였는데, 새로 import 한 `t()`(i18n 번역 함수)와 이름이 충돌(shadowing)함. 그대로 두면 `t('sc.kindTable')` 호출이 API 응답 객체를 함수처럼 호출하려다 런타임 에러가 났을 것. `t` → `ts` 로 개명하여 해결.
- **`connect.js` `renderCapBadges()`**: 동일하게 지역변수 `const t = capabilities.tiers;` 가 i18n `t()` 와 충돌. `tiers` 로 개명하여 해결.
- **`connect.js`**: `testProfile()` 에서 msg 박스 문구("접속 시험 중…")와 버튼 busy 라벨("시험 중…")이 원래 서로 다른 문자열이었음 — 하나로 뭉개지 않고 `cn.testing`(메시지용)과 `cn.testingBtn`(버튼용) 두 키로 분리해 원래 UX 보존.
- **`schema.js` `COLUMN_DEFS`**: 원래 모듈 로드 시점에 평가되는 정적 객체였음. 정적으로 두면 언어를 전환해도 컬럼 헤더가 최초 로드 언어로 고정되는 문제가 생기므로, 4개 탭 프로퍼티를 getter로 바꿔 `loadDetail()`에서 접근할 때마다 현재 언어로 재평가되도록 함(최소 변경, 새 추상화 도입 없음).

## 번역 대상에서 제외한 것 (의도적)
- SQL 키워드, 컬럼/테이블명, Oracle 오류코드(`ORA-12261` 등), `JDK`/`JRE`/`SID`/`BLevel`/`NULL`/`DBA`/`ALL`/`USER` 같은 기술 상수
- 코드 상단 JSDoc 주석(개발자용, 사용자 노출 아님)
- `index.html` 의 언어 선택 옵션 자국어 표기(`한국어/English/日本語/中文`)
- `connect.js` `renderCapBadges()`의 `d.label`/`d.impact` — 서버(API) 데이터 기반 동적 문자열이라 코드 리터럴이 아님(번역 대상 아님)

## 검증
1. **`npm test`** → **153 passed / 0 failed** (기존 규율 요구치 150건 이상 전부 유지, 회귀 없음)
2. i18n 사전 신규/전체 키 ko/en/ja/zh 4키 보유 여부 — 임시 스크립트(`check_i18n2.mjs`, 라인 단위 파싱)로 **367개 키 전수 검사, 누락 0건** 확인 후 스크립트 삭제
3. `node --check`(ESM) 로 `i18n.js`/`settings.js`/`schema.js`/`connect.js` 4개 파일 구문 검사 통과
4. `npm start` 로 서버 기동 — 콘솔 에러 없음, `java`/`javac`/JDBC 드라이버/브리지 빌드 진단 모두 OK, `http://127.0.0.1:7070/` 및 수정한 4개 JS 파일 모두 HTTP 200 확인 후 서버 정상 종료
5. **브라우저 시각검증(언어 전환 클릭 → 화면 확인)은 수행하지 못함 — 정직하게 미수행으로 명시.** curl 기반 HTTP 200 확인과 코드 리뷰까지만 완료.

## 커밋
소유 파일만 개별 경로 지정해 스테이징 후 커밋 예정: `web/js/i18n.js`, `web/js/views/settings.js`,
`web/js/views/schema.js`, `web/js/views/connect.js` (`web/index.html` 은 변경 없음).
