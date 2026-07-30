# OracleTuner 정찰 리포트 (R5: i18n·데모·패키징)

## 총괄용 요약 (50줄 이내)

**현황**: 5개 항목 완료, 1개 기술 제약 확인.

| 항목 | 상태 | 핵심 결과 |
|------|------|----------|
| i18n 구조 | ✓ | 276 키, 플랫 구조, localStorage 저장, 한국어 폴백 |
| SQL 호환성 | ✓ | Oracle 12c 미만 비호환 **없음** (11g 호환) |
| 데모 생성 | ✓ | 30만 건 + 8개 예제 + 정리 (총 10건) |
| 포터블 빌드 | ✓ | Node 포함, 선택적 JRE, config/data/logs 빈 폴더 |
| installer 도구 | ✓ | NSIS/Inno Setup 미설치 → bat 유지 필수 |
| **Program Files 설치** | ⚠ | 배포 폴더 내 상대경로 → 권한 문제 가능 |

---

## 1. i18n 구조

**파일**: `web/js/i18n.js` (436줄)

### 구조
- **사전**: 플랫한 키-객체 (중첩 없음)
  ```javascript
  const M = {
    'app.title': { ko: '...', en: '...', ja: '...', zh: '...' }
  }
  ```
- **로케일**: 4개 (ko, en, ja, zh)
- **키 개수**: **276**

### t() 함수 (라인 374)
```javascript
export function t(key, params) {
  const entry = M[key];
  let s = entry ? (entry[current] || entry.ko || key) : key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  }
  return s;
}
```
- **폴백**: 현재 언어 → 한국어 → **키 자체**
- **파라미터 치환**: `{name}` 형식

### 로케일 결정/저장 (라인 357, 425)
- **저장**: `localStorage.setItem('ot.lang', code)`
- **로드**: `localStorage.getItem('ot.lang')`
- **fallback**: 없으면 `navigator.language` 첫 2글자 → 'ko'

### 새 키 추가
```javascript
'snippet.key': { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' },
const text = t('snippet.key', { param1: '값' });
```

---

## 2. SQL 버전 호환성

**결과**: **비호환 없음** (Oracle 11g 이상 완전 호환)

검사 대상: demo/*.sql (3개), data/snippets/_shared/*.sql (8개)

**체크리스트** (모두 PASS):
- FETCH FIRST/OFFSET: ✓ 없음 (⑦은 주석만)
- IDENTITY, DEFAULT ON NULL: ✓ 없음
- WITH FUNCTION, LATERAL, CROSS APPLY: ✓ 없음
- JSON 함수, LISTAGG 옵션: ✓ 없음
- **실제 사용**: ROWNUM(8i~), CONNECT BY LEVEL, DBMS_RANDOM, DATE literal

---

## 3. 데모 데이터

**파일**: `demo/01-setup.sql`, `02-examples.js`, `09-drop.sql`

### 데이터
- ot_orders: 300,000 건 (+ 3개 인덱스, 통계)
- ot_bad_cust: 500 건 (+ 1개 인덱스)
- 생성 시간: 1~2분

### 예제 SQL (8개)
```
① 날짜 함수 → TO_CHAR 제거
② 암시적 형변환 → 타입 맞추기
③ NOT IN → NOT EXISTS
④ SELECT * → 명시적 선택
⑤ NVL 감싼 조건 → 분해
⑥ UNION → UNION ALL
⑦ ROWNUM + ORDER BY → FETCH FIRST (정확성)
⑧ 조인 순서/방식 → 경합
```

### 설치 흐름
`tools/install-demo.js` → SQL 라이브러리에 저장 (metadata: name, tags, desc, sql)
총 **10건** (setup + 8 examples + drop)

---

## 4. 포터블 빌드

**파일**: `tools/build-portable.js`

### 배포본 구조
```
oracle-tuner-VERSION-portable-win-x64-{no-jre|with-jre}/
├── runtime/ (node.exe, jre/ 선택적)
├── server/, web/, demo/
├── java/ (src, out, lib/ojdbc11.jar 선택적)
├── config/, data/{tunings,snippets}/, logs/ [빈 폴더]
├── OracleTuner.bat, README.txt
└── package.json, node_modules/open-grid
```

### JRE 포함/미포함 분기
- **기본판**: JRE 미포함, 시스템 JAVA_HOME 사용
- **포함판**: jlink로 최소 JRE (java.base 등), `./runtime/jre` 자동 설정

### 데이터 디렉터리
- **위치**: `config/`, `data/`, `logs/` (배포 폴더 내 **상대경로**)
- **포트**: 7070 (README.txt 라인 156)
- **⚠ 주의**: Program Files 에 설치 시 쓰기 불가 → `%LOCALAPPDATA%` 재지정 필요

---

## 5. 설치 스크립트

**현황**: OracleTuner는 installer 서브폴더 없음 (SEVIA 프로젝트와 분리)

**대신**: `tools/build-portable.js` 에서 배치 자동 생성
```batch
@echo off
cd /d "%~dp0"
set "JAVA_HOME=%~dp0runtime\jre"  [JRE 포함판]
"%~dp0runtime\node.exe" "%~dp0server\index.js"
```

- **JDK 탐지**: 없음 (하드코딩 또는 시스템 변수)
- **포트 지정**: 없음 (7070 고정)
- **위저드**: 없음

---

## 6. 인스톨러 기술 후보

**현황**: NSIS, Inno Setup **미설치**

**권장**: Node.js CLI 인터랙티브 (inquirer)
- 이미 Node 24 포함
- 크로스플랫폼
- `tools/install-demo.js` 패턴 재사용 가능

---

## 부록: 파일 참조

| 파일 | 내용 |
|------|------|
| web/js/i18n.js:15-20 | LANGS 배열 |
| web/js/i18n.js:22-23 | M 사전 시작 |
| web/js/i18n.js:374 | t() 함수 |
| web/js/i18n.js:357,425 | localStorage |
| demo/01-setup.sql:14-42 | CREATE + INSERT |
| demo/02-examples.js:14-108 | 8개 예제 |
| tools/build-portable.js:26-40 | INCLUDE |
| tools/build-portable.js:142-145 | 설정 초기값 |
