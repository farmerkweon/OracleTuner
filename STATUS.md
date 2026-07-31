# Oracle Tuner — 진행 상황 (2026-07-30)

> 다음 세션에서 이 파일부터 읽으면 이어서 작업할 수 있습니다.
> ⚠ 이 파일은 개인 환경 정보를 담고 있어 **git 에서 제외**되어 있습니다(.gitignore).

## 배포 완료 (2026-07-30)

- **GitHub 공개 저장소**: https://github.com/farmerkweon/OracleTuner
  - `master` (기본) · `release/1.0.0-beta` · 태그 `v1.0.0-beta.1`
  - 53개 파일. 접속정보·키·데이터·로그·드라이버 jar 는 제외됨(전수 검사 완료)
- **릴리즈 노트**: https://foxnail.kr/oracle-tuner-1-0-0-beta/ (post_id 440, 카테고리 오픈소스)
  - 대표이미지 2400×1260 생성·지정 완료 (attachment 441)
- **포터블 배포본** (`dist/`, git 제외)
  - `...-with-jre.zip` 61.8 MB — Node + 내장 JRE. 압축 풀고 실행하면 끝
  - `...-no-jre.zip` 41.2 MB — Java 는 시스템 것 사용
  - 서버 업로드 완료: `https://foxnail.kr/wp-content/uploads/download/oracle-tuner/`
  - SHA-256 로컬↔서버 일치 확인
  - 빌드: `node tools/build-portable.js --both`

## 지금 상태 한 줄

**동작합니다.** 서버·브리지·UI 모두 정상, 자동 테스트 140건 통과.
로컬 Oracle(FREEPDB1)에 실제 접속해 **데모 데이터 30만 건 생성까지 성공**했습니다.
남은 것은 **토너먼트 실측으로 개선율이 실제로 나오는지 확인**하는 단계입니다.

---

## 실행 방법

```bash
cd E:\ibank\SeTools\OracleTuner
npm start                 # http://127.0.0.1:7070
npm test                  # 자동 테스트 140건
node java/build.js --force  # Java 브리지 재빌드
```

## 확인된 접속 정보

- 프로필: `orahelper` (id `cms61dk1zd993c0`, 비밀번호 저장됨)
- **서비스명이 비어 있어 접속 실패함 → `FREEPDB1` 로 채워야 함** ⚠
- 실제 접속 성공: `jdbc:oracle:thin:@//localhost:1521/FREEPDB1`, user `orahelper`
- DB: Oracle AI Database 26ai Free 23.26.2.0.0 / 스키마 `ORAHELPER`

### 이 계정의 권한 티어 (실측)

| 항목 | 수준 | 의미 |
|---|---|---|
| 실행계획 | `DBMS_XPLAN` | 표준 서식 계획 조회 가능 (양호) |
| **계측** | **`TIMING_ONLY`** | **V$MYSTAT 불가 → 논리읽기 못 잼, 시간만으로 판정** ⚠ |
| 딕셔너리 | `ALL` | 인덱스·컬럼타입·통계 조회 가능 |

> ⚠ **중요**: 계측이 TIMING_ONLY 라 측정이 시간에만 의존합니다. 시간은 캐시·부하에
> 흔들리므로 **회전수를 늘려야**(5~10) 안정적인 판정이 나옵니다.

---

## 데모 데이터 (생성 완료)

`[SQL 목록] → [데모 데이터 생성]` 버튼 한 번으로 생성됨. 3초 걸림.

- `OT_ORDERS` **300,000건** (3년치, cust_no 는 VARCHAR2, pad 380바이트)
- `OT_BAD_CUST` 500건
- 인덱스 4개: `IX_ORD_DT`, `IX_ORD_CUST`, `IX_ORD_STATUS`, `IX_BAD_CUST`
- 통계 수집 완료

예제 SQL 8개는 `[샘플 예제]` 버튼으로 설치 (SQL 목록의 "데모" 폴더).

---

## 이번 세션에서 고친 중요한 버그 3개

### 1. PL/SQL 블록이 깨지던 문제 (ORA-06550 / PLS-00103)
`END;` 의 세미콜론까지 제거해 PL/SQL 이 문법 오류가 됐음.
→ `Plan.stripTrailingSemicolon()` 이 PL/SQL 블록을 인식해 `;` 를 살리도록 수정.
   (BEGIN/DECLARE/CREATE PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE, 앞 주석도 처리)
   11개 케이스 검증 통과.

### 2. **측정이 잘려 튜닝 효과가 안 보이던 문제** ← 가장 중요
성능 측정 실행도 `maxRows`(5000행)에서 인출을 멈춰서, 전체 스캔 30만 건의 비용이
중간에 끊김 → 튜닝 전/후가 **둘 다 빨라 보이는 착시** → "개선율 0%".
→ `fullFetch` 모드 추가. 계측 실행은 `setMaxRows` 를 걸지 않고 **끝까지 인출**.
   - 검증용 실행: maxRows 까지, 행 보관, 지문 계산
   - 계측용 실행: **전부 인출**, 행 버림, 지문 계산 안 함(측정 오염 방지)
   - 적용: 토너먼트 / 비교검증 / 벤치마크 3경로 모두

### 3. 편집기 입력이 안 되던 문제
랜딩이 SQL 목록으로 바뀌며 워크벤치가 `display:none` 상태로 초기화 → 높이 0px.
→ 뷰 전환 시 `relayout()` + `ResizeObserver` 자가복구.

---

## 다음에 할 일 (우선순위)

1. **토너먼트 실측 확인** ← 여기서 멈춤
   - 예제 ② 암시적 형변환, ① 날짜 함수 조건으로 토너먼트 실행
   - 개선율이 실제로 나오는지 확인. 안 나오면 원인 규명
   - **회전수를 5~10으로 올려서** 테스트할 것 (TIMING_ONLY 환경이라 편차 큼)
2. 개선 효과가 확실한 예제만 남기고 나머지 정리 (사용자 요청)
3. 다국어 미적용 부분 마저 채우기 (토스트·요약 문구 등 동적 텍스트)
4. 패키징: README, .gitignore, JRE 포함/미포함 설치판 2종
5. 도움말에 화면 캡처 이미지 삽입

---

## 구조 요약

```
server/          Node 웹서버 + REST API
  index.js       HTTP 서버 (기본 127.0.0.1:7070)
  api.js         라우팅 (SQL 실행/분석/후보/토너먼트/메타/이력/스니펫/데모)
  bridge.js      Java 프로세스 관리 (JSON 라인 프로토콜)
  candidates.js  ★ 튜닝 후보 생성기 + 순위 판정 (튜닝 지식베이스)
  analyzer.js    ★ 정적 진단 규칙 엔진
  snippet-store.js  SQL 라이브러리 (접속별 폴더 + _shared 공용)
  tuning-store.js   튜닝 이력 (sqlRef 로 SQL 과 연결)
java/src/kr/foxnail/otuner/
  Bridge.java    stdin/stdout JSON 프로토콜
  Exec.java      ★ 실행·계측·결과 지문·토너먼트 (fullFetch 여기 있음)
  Plan.java      실행계획 (stripTrailingSemicolon 여기 있음)
  Caps.java      권한 탐침 (V$ 없어도 동작하게 하는 핵심)
shared/sql-tokenizer.js   서버·브라우저 공용 SQL 파서
web/             UI (Open Grid, 한/영/일/중)
demo/            데모 데이터 + 예제 8개
```

## 미해결/주의

- 접속 프로필 `orahelper` 의 **서비스명 비어 있음** → UI 에서 `FREEPDB1` 로 저장 필요
- 계측 TIMING_ONLY 환경 → 회전수 늘려 판정할 것
- `web/js/project.js` 의 저장소 URL 은 가정값(`github.com/farmerkweon/OracleTuner`)
