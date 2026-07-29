# Oracle Tuner

**Oracle SQL을 실제로 실행해서 튜닝하는 도구.** 추측이 아니라 측정으로 판단합니다.

튜닝을 몰라도 최적 SQL을 고를 수 있게 만드는 것이 목표입니다. 도구가 여러 개선안을 만들고,
실제로 돌려보고, 결과가 같은지까지 확인한 뒤 순위를 매겨 줍니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **베타입니다.** SQL 최종 검증은 사용자의 몫입니다. 운영에 반영하기 전 반드시 직접 확인하세요.

📥 **다운로드(Windows 포터블)** · 📝 [릴리즈 노트](https://foxnail.kr/oracle-tuner-1-0-0-beta/)

---

## 무엇을 하는가

### 1. 튜닝 후보를 자동으로 만든다

SQL을 파싱해 시도해 볼 개선안을 생성합니다(30여 전략).

| 전략 | 예 |
|---|---|
| 날짜 함수 → 범위 조건 | `TO_CHAR(dt,'YYYYMM')='202403'` → `dt >= ... AND dt < ...` |
| 암시적 형변환 제거 | 문자 컬럼 `= 123` → `= '123'` (인덱스 회복) |
| `NOT IN` → `NOT EXISTS` | 안티조인 변환 + NULL 안전 |
| `NVL` 분해 | `NVL(c,'A')='A'` → `(c='A' OR c IS NULL)` |
| `UNION` → `UNION ALL` | 불필요한 중복 제거 정렬 삭제 |
| `ROWNUM`+`ORDER BY` → `FETCH FIRST` | **결과가 틀리는 것**을 교정 |
| 힌트 | `INDEX`/`FULL`/`USE_HASH`/`USE_NL`/`LEADING` 등 (실제 인덱스명 자동 반영) |

각 후보마다 **왜 시도하는지**와 **언제 효과가 있는지**를 함께 보여줍니다.

### 2. 토너먼트로 실측한다

원본과 후보들을 **번갈아 여러 회전 실행**합니다. 회차마다 순서를 회전시켜 캐시 편향을 상쇄하고,
결과는 **끝까지 인출**해 전체 스캔의 실제 비용을 잡습니다.

### 3. 결과가 같은지 검증한다

행 단위 지문(SHA-256)으로 원본과 비교합니다. 순서까지 같은지, 집합만 같은지 구분하며,
**결과가 다르면 아무리 빨라도 순위에서 제외**합니다.

### 4. 권한이 없어도 동작한다

접속 직후 무엇을 볼 수 있는지 실제로 탐침하고, 막힌 기능은 가능한 것 중 최선으로 자동 강등합니다.

| 기능 | 1순위 | 대체 | 최후 |
|---|---|---|---|
| 실행계획 | `DBMS_XPLAN` | 계획 테이블 직접 조회 | 개인 계획 테이블 생성 |
| 부하 측정 | 세션 통계(논리읽기) | 실행 시간 | — |
| 결과 검증 | **권한 무관 · 항상 가능** | | |

---

## 실행

### 포터블 (권장)

압축을 풀고 `OracleTuner.bat` 실행 → 브라우저가 `http://127.0.0.1:7070` 을 엽니다.
Node와 (포함판은) Java까지 들어 있어 별도 설치가 필요 없습니다.

### 소스에서

```bash
npm install
npm run fetch-driver     # Oracle JDBC 드라이버 내려받기 (java/lib/)
npm start                # http://127.0.0.1:7070
```

요구: Node 18+, Java 11+ (JDK 권장 — 없으면 미리 빌드된 `java/out` 필요)

```bash
npm test                 # 자동 테스트 140건
node java/build.js --force   # Java 브리지 재빌드
node tools/build-portable.js --both   # 포터블 배포본 생성
```

---

## 튜닝 효과를 5분 안에 확인하기

1. **[SQL 목록]** → **[샘플 예제]** — 예제 10건 설치
2. **[데모 데이터 생성]** — 30만 건 시험표·인덱스·통계 자동 생성 (1~2분)
3. 예제를 열고 **[튜닝 후보]** → **[후보 생성]** → **[토너먼트 실행]**

예제는 일부러 느리게 짜여 있습니다. **암시적 형변환**과 **날짜 함수 조건**이 차이가 가장 큽니다.

---

## 그 밖의 기능

- **4개 국어** — 한국어 / English / 日本語 / 中文
- **SQL 라이브러리** — 접속별 폴더로 정리, 튜닝 이력과 연결
- **힌트 위저드** — 힌트 이름을 몰라도 상황만 고르면 표·인덱스명 자동 완성
- **안전모드** — DML/DDL 실행 후 자동 롤백(기본 켜짐)
- **큰 SQL** — 1만 줄 이상도 잘림 없이 처리(주석·문자열·q-quote·한글 식별자)
- **진단** — 인덱스를 못 타는 조건, 결과가 틀리는 패턴을 근거·조치와 함께

---

## 구조

```
server/           Node 웹서버 + REST API
  candidates.js   ★ 튜닝 후보 생성 + 순위 판정 (튜닝 지식베이스)
  analyzer.js     ★ 정적 진단 규칙 엔진
  bridge.js       Java 프로세스 관리 (stdin/stdout JSON 라인)
java/src/...      JDBC 브리지
  Exec.java       ★ 실행·계측·결과 지문·토너먼트
  Caps.java       ★ 권한 탐침 (V$ 없어도 동작하게 하는 핵심)
shared/           서버·브라우저 공용 SQL 토크나이저
web/              UI (Open Grid)
demo/             데모 데이터 + 예제 8개
```

**왜 Java 브리지인가** — JDK/JRE와 드라이버 경로를 설정으로 바꿀 수 있어야 해서, Java를 별도 프로세스로
띄우고 표준입출력 JSON으로 통신합니다. 포트를 열지 않아 방화벽·권한 문제가 없습니다.

---

## 라이선스 · 크레딧

- 이 프로그램: **MIT** ([LICENSE](LICENSE))
- 데이터 그리드·차트: [**Open Grid**](https://github.com/farmerkweon/OpenGrid) (MIT) · [가이드](https://foxnail.kr/open-grid/demo/v2/)
- Oracle JDBC 드라이버는 **포함하지 않습니다.** Oracle 라이선스(FUTC) 대상이라
  사용자가 `npm run fetch-driver` 로 직접 받습니다.

문의: foxnail.biz@gmail.com · https://foxnail.kr

© 2026 foxnail
