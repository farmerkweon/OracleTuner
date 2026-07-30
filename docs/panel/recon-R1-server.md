# OracleTuner 서버 정찰 보고서 (R1-server)

## 총괄용 요약

| 항목 | 현황 | 리스크 | 개선 방안 |
|------|------|--------|---------|
| **행 인출 제한** | 기본값 5000행, clamp 없음 | **높음** | maxRows 상한선(2M) 검증 + clamp 로직 추가 |
| **저장소 구조** | 파일 기반 (JSON/SQL), 원자적 쓰기 | **낮음** | DB 마이그레이션 시 인터페이스 경계 명확함 |
| **설정/기본값** | config.js 에 체계적으로 정의 | **낮음** | 설정값 문서화 완료 |
| **토너먼트 진행률** | 요청-응답만 지원, 스트리밍 없음 | **중간** | SSE/WebSocket 추가 필요 (bridge 연동 필수) |
| **포트 결정** | 고정값(7070) + EADDRINUSE 시 종료 | **중간** | 자동 포트 찾기 함수 추가 필요 |

---

## 1. 행 인출 제한 (Row Fetch Limit)

### 현황

**기본값:** 5000행 (config.js:46)
\\\javascript
execution: {
  maxRows: 5000,
  fetchSize: 1000,
  ...
}
\\\

**API 에서 사용:**
- api.js:260 (SQL 실행): \ody.maxRows || cfg.execution.maxRows\
- api.js:296 (스크립트 실행): \Number(body.maxRows) || 200\
- api.js:589 (토너먼트): \Number(body.maxRows) || cfg.execution.maxRows\

**문제점:**
- clamp 로직이 없음! 사용자가 \maxRows: 2000000\ 을 보내면 그대로 실행됨
- Java 브리지에서도 별도 clamp 없음을 확인함 (candidates.js:1140 에서 rowCount 만 기록)
- 대량 행 반환시 메모리 고갈, 응답 지연 위험

### 2,000,000 행 인출 시 영향도

1. **메모리**: fetchSize 1000 × 2M = 약 2GB 버퍼링 (JVM + Node 합산)
2. **네트워크**: JSON 직렬화 오버헤드
3. **UI 렌더링**: 초대형 배열 처리 불가능

### 개선 필안

**Option A (즉시):**
\\\javascript
// api.js:260 주변에 추가
const MAX_ROWS_LIMIT = 2000000;
const maxRows = Math.min(Number(body.maxRows) || cfg.execution.maxRows, MAX_ROWS_LIMIT);
\\\

**Option B (근본):**
- 페이징 API 추가 (offset/limit)
- 스트리밍 응답 (SSE/WebSocket)

---

## 2. 저장소 구조 분석

### tuning-store.js (data/tunings/)

**포맷:** JSON 파일 (한 건 = 한 파일)

**파일 경로:**
- 개별 튜닝: data/tunings/<id>.json (예: T20260730-093456-a1b2.json)
- 인덱스: data/tunings/index.json (캐시일 뿐, 손상되면 재생성)
- 휴지통: data/tunings/.trash/<id>.<timestamp>.json (백업용)

**CRUD 함수:**
| 함수 | 용도 | 라인 |
|------|------|------|
| list(filter) | 목록 조회 (필터: q, status, tag, limit) | 120 |
| get(id) | 단건 조회 | 152 |
| save(input) | 신규/수정 (부분 갱신 가능) | 165 |
| remove(id) | 삭제 (휴지통 백업 후) | 213 |
| tags() | 태그 목록 (빈도순) | 231 |
| rebuildIndex() | 인덱스 재생성 (손상 복구) | 81 |

**원자성 처리:**
\\\javascript
function writeAtomic(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);  // 원자적 치환
}
\\\

**특징:**
- 개별 파일 → 동시 수정 충돌 사실상 없음
- 인덱스는 캐시 → 없어도 rebuildIndex() 로 복구 가능
- 감사 추적: history 배열에 최대 100건 누적 (tuning-store.js:204)

### snippet-store.js (data/snippets/)

**포맷:** SQL 파일 + 메타데이터 주석

**파일 구조:**
\\\sql
--@ name: 주문 일별 집계
--@ tags: 주문, 배치
--@ desc: 야간 배치 쿼리
--@ updated: 2026-07-29T21:00:00.000Z

SELECT ... FROM ...
\\\

**경로:** data/snippets/<scope>/<name>.sql
- 공용: data/snippets/_shared/ (모든 접속에서 볼 수 있음)
- 접속별: data/snippets/PROD_CONNECTION_1/ 등

**CRUD 함수:**
| 함수 | 용도 | 라인 |
|------|------|------|
| list(scope, filter) | 목록 (공용 포함) | 103 |
| get(scope, name) | 단건 조회 (공용 폴백) | 161 |
| save(scope, input) | 신규/수정 + 이름변경 처리 | 182 |
| remove(scope, name) | 삭제 (공용도 시도) | 206 |
| scopes() | 접속 목록 | 226 |

**특징:**
- 메타데이터가 파일에 포함 → 저장 파일 자체가 실행 가능한 SQL
- 이름 변경시 oldName 감지해 옛 파일 정리 (snippet-store.js:198)

### connections.js (config/connections.json)

**파일 경로:** config/connections.json

**구조:**
\\\json
{
  "version": 1,
  "connections": [
    {
      "id": "c...",
      "name": "프로덕션",
      "host": "db.example.com",
      "port": 1521,
      "serviceName": "ORCL",
      "user": "scott",
      "password": "<암호화됨>",  // secret.encrypt()
      "savePassword": true,
      "production": true,
      "createdAt": "...",
      "updatedAt": "...",
      "lastConnectedAt": "..."
    }
  ]
}
\\\

**CRUD 함수:**
| 함수 | 용도 | 라인 |
|------|------|------|
| list() | 목록 (비밀번호 제거) | 65 |
| get(id) | 단건 조회 (비밀번호 포함) | 69 |
| save(input) | 신규/수정 + 암호화 | 74 |
| remove(id) | 삭제 | 114 |
| connectParams(id) | 실행용 파라미터 + 복호화 | 137 |
| touch(id) | lastConnectedAt 업데이트 | 124 |

**특징:**
- 비밀번호: 저장시 secret.encrypt(), 조회시만 복호화
- 브라우저로 내보낼 때는 hasSavedPassword 플래그만 (connections.js:47)
- 원자적 쓰기 (connections.js:37-39)

### DB 마이그레이션 시 인터페이스 경계

**제안:**

현재 인터페이스를 유지하면서 구현을 SQLite 등으로 바꾸려면:

1. **tuning-store.js 의 내부 구현만 변경**
   - list/get/save/remove 시그니처 유지
   - SQL → 쿼리로 전환
   - rebuildIndex() → DB 스캔

2. **snippet-store.js 는 혼합**
   - 메타데이터는 DB 저장 (메인)
   - .sql 파일은 캐시/노출용 (생성만)
   - 또는 전체 DB 저장

3. **connections.js 는 전부 변경**
   - JSON → SQL 테이블
   - 암호화는 그대로 유지

---

## 3. 설정/기본값 (config.js)

### 기본값 전체 목록 (DEFAULTS)

**Java 실행:**
\\\javascript
java: {
  home: '',  // 비우면 JAVA_HOME → PATH 탐색
  options: ['-Xmx768m', '-Dfile.encoding=UTF-8', '-Duser.language=ko'],
  autoBuild: true  // JDK 있으면 자동 컴파일
}
\\\

**JDBC 설정:**
\\\javascript
jdbc: {
  driverPaths: [],  // 비우면 java/lib 자동탐색
  autoDiscover: true,
  loginTimeoutSec: 15
}
\\\

**서버 (index.js 에서 사용):**
\\\javascript
server: {
  host: '127.0.0.1',     // 기본값: 로컬호스트만
  port: 7070,            // index.js:201 에서 Number(cfg.server.port) || 7070
  openBrowser: true,     // 서버 시작시 브라우저 자동 열기
  maxRequestMb: 64       // POST 본문 최대 크기
}
\\\

**SQL 실행 (api.js 에서 사용):**
\\\javascript
execution: {
  maxRows: 5000,         // 기본값 (clamp 없음!)
  fetchSize: 1000,       // 버퍼 크기
  timeoutSec: 60,        // 쿼리 타임아웃
  benchRuns: 3,          // 토너먼트 회전 수 (기본값, 최대 20)
  benchWarmup: 1,        // 워밍업 회차
  safeMode: true,        // DML/DDL 자동 롤백
  autoExplain: true      // 실행계획 자동 조회
}
\\\

**UI:**
\\\javascript
ui: {
  theme: 'default',
  skin: 'rounded',
  density: 'normal',
  locale: 'ko',
  fontSize: 13
}
\\\

### 설정 파일 위치 결정 (paths.js)

\\\javascript
// paths.js:31
settingsFile: path.join(ROOT, 'config', 'settings.json')
\\\

**특징:**
- ROOT = 프로젝트 설치 디렉터리
- **설치 디렉터리에 저장** (NOT %LOCALAPPDATA%)
- 포터블 설치 가능 (USB 등)
- 권한 문제 가능성 있음 (Program Files 설치시)

### 설정 로드 및 병합

\\\javascript
// config.js:91-105
function load(force) {
  if (cache && !force) return cache;
  let user = {};
  try {
    if (fs.existsSync(P.settingsFile)) {
      user = readJsonFile(P.settingsFile);  // BOM 처리
    }
  } catch (e) {
    parseError = e.message;
  }
  cache = deepMerge(DEFAULTS, user);  // 기본값 + 사용자값
  cache._parseError = parseError;
  return cache;
}
\\\

**특징:**
- 파일 없어도 기본값으로 동작
- 파일 깨져 있어도 경고만 하고 진행
- 부분 설정 가능 (필요한 키만 override)

---

## 4. 토너먼트 진행률 (Tournament Progress)

### 현황

**API 라우트:** POST /api/sql/tournament (api.js:579)

**프로세스:**
1. 후보 확보 (화면에서 선택 또는 자동 생성) - 즉시
2. 실행계획 조회 (각 후보) - 평행 처리, 실패해도 진행
3. **실측 토너먼트** - bridge.request('tournament') [블로킹]
4. 순위 계산 (candidates.rank())

**문제점:**
- **SSE/WebSocket 없음!** 단순 요청-응답만 지원
- bridge.request() 호출이 완전히 블로킹됨
- 클라이언트는 응답 올 때까지 대기만 가능

### 예산 계산 (api.js:629)

\\\javascript
const budgetMs = (timeoutSec * (list.length + 1) * (runs + warmup + 1) + 120) * 1000;
// 예: 60초 × (10후보 + 1) × (3회전 + 1워밍업 + 1) + 120초 → ~26분
\\\

### 프로그레스바 추가 방안

#### A. SSE 스트리밍 (권장)

**필요한 변경:**

1. **bridge.js 에서 진행률 방출**
   - Java 쪽 Bridge 가 진행상황 JSON 메시지 출력
   - bridge.js 가 이를 파싱해 큐에 쌓기

2. **api.js 에서 SSE 응답**
   \\\javascript
   route('POST', '/api/sql/tournament-stream', async ({ req, res, body }) => {
     res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive'
     });
     
     // 토너먼트 실행 중 진행율 emit
     for await (const progress of tournamentStream(body)) {
       res.write(\data: \\\n\\n\);
     }
     res.end();
   });
   \\\

3. **클라이언트 (Web)**
   \\\javascript
   const evt = new EventSource('/api/sql/tournament-stream');
   evt.onmessage = (e) => {
     const { stage, current, total, candidate } = JSON.parse(e.data);
     updateProgressBar(current / total);
   };
   \\\

#### B. WebSocket (대안)

- 양방향 통신 필요시만 (예: 중단 요청)
- 설정 복잡도 높음

### 현재로서의 대안

- **타임아웃 지표만 표시** (예상 소요시간)
- **로그 폴링** (GET /api/logs/tournament-<id>)

---

## 5. 포트 결정 로직 (Port Resolution)

### 현황 (index.js:200-216)

\\\javascript
const port = Number(cfg.server.port) || 7070;
const host = cfg.server.host || '127.0.0.1';

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log.error(\포트 \ 가 이미 사용 중입니다. config/settings.json 의 server.port 를 바꾸세요.\);
    process.exit(1);  // ⚠️ 강제 종료!
  }
  log.error(\서버 오류: \\);
});

server.listen(port, host, () => {
  const url = \http://\:\/\;
  log.info(\듣는 중: \\);
  if (cfg.server.openBrowser) openBrowser(url);
});
\\\

### 문제점

1. **고정 포트만 지원** - EADDRINUSE 시 즉시 종료
2. **자동 대체 포트 없음** - 사용자가 설정을 수동으로 변경해야 함
3. **다중 인스턴스 불가** - 동일 호스트에서 여러 개 띄울 수 없음

### 개선안

**findAvailablePort 함수 추가:**

\\\javascript
// index.js 상단에 추가
const net = require('net');

function findAvailablePort(startPort, host = '127.0.0.1', maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    const checkPort = (port) => {
      if (port > startPort + maxAttempts) {
        reject(new Error(\포트 \~\ 모두 사용 중\));
        return;
      }
      
      const server = net.createServer();
      server.once('error', (e) => {
        if (e.code === 'EADDRINUSE') {
          server.close();
          checkPort(port + 1);
        } else {
          reject(e);
        }
      });
      server.once('listening', () => {
        server.close();
        resolve(port);
      });
      server.listen(port, host);
    };
    checkPort(startPort);
  });
}
\\\

**사용:**

\\\javascript
// index.js:200 주변
const startPort = Number(cfg.server.port) || 7070;
const actualPort = await findAvailablePort(startPort, host);
server.listen(actualPort, host, () => {
  log.info(\포트 \ 에서 듣는 중 (설정: \)\);
});
\\\

---

## 의존성 그래프

\\\
index.js
  ├── config.js (설정 로드 및 기본값 적용)
  ├── paths.js (경로 상수)
  ├── api.js (라우팅)
  │   ├── bridge.js (Java 호출)
  │   ├── tuning-store.js (이력 저장)
  │   ├── snippet-store.js (SQL 라이브러리)
  │   ├── connections.js (접속 프로필)
  │   └── candidates.js (후보 생성 & 순위)
  │       └── analyzer.js (SQL 진단)
  ├── bridge.js
  │   ├── paths.js (자바 경로)
  │   ├── config.js (자바/JDBC 설정)
  │   └── [자식 프로세스: java Bridge]
  ├── logger.js (로깅)
  │   └── paths.js (로그 디렉터리)
  └── secret.js (암호화)
      └── paths.js (secret.key)

connections.js
  ├── secret.js (비밀번호 암호화)
  └── paths.js (설정 파일 경로)
\\\

---

## 권장사항 (우선순위)

| 우선순위 | 항목 | 작업 | 난이도 | 영향도 |
|---------|------|------|--------|--------|
| **P0** | maxRows clamp | api.js 에 MAX_ROWS_LIMIT=2M 검증 추가 | 낮음 | 높음 |
| **P1** | 토너먼트 진행률 | bridge ↔ api 간 진행도 메시지 추가 + SSE | 중간 | 중간 |
| **P2** | 자동 포트 찾기 | findAvailablePort() 함수 구현 | 낮음 | 중간 |
| **P3** | DB 마이그레이션 | SQLite 등으로 저장소 교체 (점진적) | 높음 | 낮음 |
| **P4** | 페이징 API | offset/limit 지원 + 대용량 쿼리 처리 | 높음 | 중간 |

---

**작성:** 2026-07-30  
**정찰 에이전트:** R1 (server)  
**상태:** 완료
