# OracleTuner 뷰 모듈 정찰 보고서

## 총괄용 요약

OracleTuner는 9개 뷰 모듈로 구성된 SPA(Single Page App)입니다. 각 뷰는 `initViewName()` 함수로 초기화되며, 공개 함수를 export해 외부에서 호출됩니다. 

**핵심 아키텍처**
- 모든 뷰는 모듈 스코프 상태 변수로 관리
- SqlEditor(Monaco 기반), GridKit(커스텀 그리드), Api(서버 통신)를 공유
- i18n 지원: 일부 뷰는 하드코딩된 한글 레이블 보유 (재팩토링 필요)
- 토너먼트(순차 실행 측정)는 프로그레스바 없음 (텍스트 진행 표시만)

**OOP 리팩토링 기회**
공통 기본 클래스로 추출 가능한 책임:
1. 생명주기 관리(init → render → destroy)
2. 에러 처리(toast/errText 사용)
3. 바쁜 상태 UI(withBusy 패턴)
4. i18n 적용(t() 호출)

---

## 상세 조사 결과

### 1. 뷰 모듈 공통 규약

#### 1.1 표준 인터페이스

모든 뷰가 따르는 패턴:

```javascript
// 1. 초기화 (진입점)
export function initViewName(opts = {}) {
  // opts 콜백 수집: onConnected, onAdopt, getSql 등
  // DOM 이벤트 리스너 등록
}

// 2. 공개 함수 (외부 호출)
export async function refresh() { }
export function open() { }
export function close() { }
export function relayout() { }

// 3. 내부 상태
const state = { ... };  // 모듈 스코프 변수
```

**예시**
- **workbench.js:27-41** `initWorkbench()`: SqlEditor 두 개 생성, 툴바 버튼 등록
- **schema.js:15-33** `initSchema()`: 이벤트 리스너 + cache 초기화
- **history.js:22-29** `initHistory()`: editorsRef 저장, 이벤트 등록

#### 1.2 공통 책임 (OOP 베이스 클래스 후보)

| 책임 | 적용 뷰 | 예시 |
|------|--------|------|
| **생명주기** | 모든 뷰 | init→render→destroy (destroy는 암시적) |
| **에러 처리** | 모든 뷰 | `toast(errText(e), 'err')` (util.js 사용) |
| **바쁜 상태** | 모든 뷰 | `withBusy(btn, asyncFn, '…')` |
| **i18n** | 일부만 | `t('key')` 호출 (미적용 뷰: settings, schema, connect) |
| **API 호출** | 모든 뷰 | `api.xxx()` (Api 클래스에 정의) |

#### 1.3 뷰 간 통신 방식

1. **콜백 (opts.onXxx)**
   - `initHistory(opts = { onLoad: callback })` 
   - 워크벤치: `editorsRef.before.setValue()` 직접 조작

2. **CustomEvent (이벤트 기반)**
   ```javascript
   // library.js:265, 449
   document.dispatchEvent(new CustomEvent('ot:snippets-changed'));
   // workbench.js:80
   document.addEventListener('ot:snippets-changed', () => refreshDock());
   ```

3. **그리드 마스터-디테일 (masterDetail 패턴)**
   - history.js:102-108: 행 클릭 시 상세 패널 렌더
   - candidates.js:273-279: 토너먼트 결과 확대

---

### 2. 워크벤치 (workbench.js)

#### 2.1 SQL 실행 흐름

| 단계 | 함수/라인 | 설명 |
|------|---------|------|
| **편집기 생성** | line 30-41 | SqlEditor (2개: before/after) |
| **버튼 클릭** | line 44-46 | handleAction() 호출 |
| **SQL 실행** | line 10 import | api.execute()/api.plan()/api.compareVerify() |
| **결과 렌더** | line 16 import | renderResult/renderPlan/renderFindings() |
| **탭 전환** | line 49-51 | showTab() → 다양한 탭 표시 |

#### 2.2 행 인출 제한 (Max Rows)

**설정 저장 위치**
- **settings.js:39** `$('#cfg-max-rows').value`
- **settings.js:61** `collectForm()` → `execution.maxRows`
- **settings.js:20-32** `refresh()` → 서버에서 읽음

**서버로 전달되는 값**
```javascript
// api.saveConfig(collectForm()) 호출
// 객체 구조:
{
  execution: {
    maxRows: Number($('#cfg-max-rows').value) || 5000,
    fetchSize: Number($('#cfg-fetch-size').value) || 1000
  }
}
```

#### 2.3 에디터 방식

- **클래스**: SqlEditor (editor.js에서 import)
- **초기화**: `new SqlEditor(element, {name, value, onChange, onAction})`
- **API**: `setValue()`, `getValue()`, `refresh()`
- 기반: Monaco Editor (globalThis.SqlTokenizer로 문법 강조)

---

### 3. 토너먼트 (candidates.js)

#### 3.1 핵심 함수

| 함수 | 라인 | 역할 |
|------|-----|------|
| **runTournament()** | 148 | 토너먼트 진행 (진입점) |
| **generate()** | 65 | 후보 생성 (API 호출) |
| **renderGenerated()** | 97 | 후보 목록 렌더 |
| **renderResult()** | 193 | 순위 결과 렌더 |
| **adopt()** | 433 | 선택 후보를 워크벤치로 전달 |

#### 3.2 진행 방식

**순차 vs 병렬**: **순차 실행**
```javascript
// line 159-161: 실행 방식 명시
confirm(`원본과 후보 ${n}개를 ${o.runs}회전(워밍업 ${o.warmup}회) 번갈아 실행합니다.\n` +
        `총 실행 횟수는 약 ${total}회입니다.`)
```

**실행 순서**:
1. 원본 (1회)
2. 후보1 (1회)
3. 후보2 (1회)
... 번갈아 반복

#### 3.3 진행률 표시

**현재 구현**
- **프로그레스바**: ❌ 없음
- **진행 텍스트**: ✓ line 163-165
  ```html
  <div class="pad muted">원본과 후보 ${n}개를 번갈아 실행하며 측정하고 있습니다… 
  (약 ${total}회 실행)<br>완료될 때까지 이 탭을 벗어나도 됩니다.</div>
  ```

**프로그레스바 추가 가능성**
- 총 실행 횟수 계산 가능: `total = (n+1) * (runs+warmup) + n + 1` (line 156)
- 서버에서 진행률 반환 필요 (WebSocket 또는 polling)
- DOM 위치: `$('#cand-body')` 내 진행 상태 영역

---

### 4. 서브그리드 (Master-Detail)

#### 4.1 사용 위치

| 파일 | 라인 | 용도 | 확대 버튼 |
|------|-----|------|----------|
| **history.js** | 102-108 | 튜닝 기록 행 펼치기 | ❌ 없음 |
| **candidates.js** | 129-132 | 후보 상세 (생성 단계) | ❌ 없음 |
| **candidates.js** | 273-279 | 순위 상세 (토너먼트 결과) | ❌ 없음 |
| **candidates.js** | 313-319 | 제외된 후보 상세 | ❌ 없음 |

#### 4.2 생성 코드

**GridKit 마스터-디테일 설정**
```javascript
// candidates.js:119-133
const grid = makeGrid(gridHost, {
  masterDetail: {
    enabled: true,
    height: 280,
    heightMode: 'auto',
    expandMultiple: true,
    renderer: (row, hostEl) => {
      hostEl.innerHTML = candDetailHtml(row, null);
      wireDetailButtons(hostEl, row);
    }
  }
});
```

**상세 패널 렌더러**
- **candDetailHtml()** (line 362): HTML 템플릿 생성
- **wireDetailButtons()** (line 350): [채택]/[복사] 버튼 이벤트 연결
- history.js도 동일 패턴 (renderDetail 함수)

#### 4.3 "확대" 기능

- **현재**: 행 클릭으로 인라인 펼치기만 지원
- **확대 버튼**: 없음
- **개선 아이디어**: 모달 팝업으로 전체 화면 상세 보기

---

### 5. i18n 적용 실태

#### 5.1 파일별 i18n 적용도

| 파일 | 적용 | 하드코딩 | 건수 |
|------|------|---------|------|
| **history.js** | ✓ 부분 | STATUS_LABEL, VERDICT_LABEL | ~40 |
| **candidates.js** | ✓ 부분 | GRADE_STYLE, VERDICT_PILL | ~36 |
| **hint-wizard.js** | ✓ 완전 | 4언어 카탈로그(CATALOG) | 0 |
| **library.js** | ✓ 완전 | 거의 없음 | ~5 |
| **settings.js** | ❌ 미적용 | 모든 한글 메시지 | ~80+ |
| **schema.js** | ❌ 미적용 | 모든 한글 메시지 | ~50+ |
| **connect.js** | ❌ 미적용 | 모든 한글 메시지 | ~60+ |
| **help.js** | ✓ 완전 | 4언어 탭 레이블 | 0 |
| **workbench.js** | ✓ 부분 | 로그 메시지 등 | ~10 |

#### 5.2 하드코딩된 문자열 예시

**settings.js (미적용)**
```javascript
// line 30: '설정을 불러오지 못했습니다'
// line 82: '저장했습니다.'
// line 84: 'Java/JDBC 설정이 바뀌어 브리지를 다시 띄웠습니다'
// line 158: '인식된 드라이버가 없습니다'
// line 175: '설치된 Java 를 찾지 못했습니다'
toast(`설정을 불러오지 못했습니다: ${errText(e)}`, 'err');
```

**schema.js (미적용)**
```javascript
// line 58: '스키마 목록 조회 실패'
// line 75-78: 그리드 헤더 ('객체명', '유형', '상태' 등)
toast(`스키마 목록 조회 실패: ${errText(e)}`, 'warn');
```

**connect.js (미적용)**
```javascript
// line 75, 108, 145-148: 접속 프로필 UI 텍스트
// line 213: 접속 완료 메시지
toast(`접속되었습니다 — ${d.name || s.currentSchema || ''}`, 'ok');
```

**history.js (부분 미적용)**
```javascript
// line 16-20: 하드코딩된 라벨
const STATUS_LABEL = {
  draft: '작성중', verified: '검증완료', applied: '적용됨', rejected: '보류'
};
const VERDICT_LABEL = {
  IDENTICAL: '완전 동일', SAME_SET: '집합 동일', DIFFERENT: '결과 다름',
  INCONCLUSIVE: '비교 불가', SKIPPED: '미검증'
};
```

#### 5.3 i18n 적용 패턴 (바람직)

```javascript
// hint-wizard.js: 다언어 카탈로그
const CATALOG = [
  {
    name: { ko: '…', en: '…', ja: '…', zh: '…' },
    desc: { ko: '…', en: '…', ja: '…', zh: '…' }
  }
];

// library.js, history.js (권고): t() 함수 사용
import { t } from '../i18n.js';
const text = t('sqls.selectHint');  // i18n.js에서 정의
```

---

### 6. 설정 뷰 (settings.js)

#### 6.1 렌더/저장 구조

| 항목 | 함수 | 라인 | 로직 |
|------|------|------|------|
| **테마** | - | - | 보이지 않음 (아직 구현 안 됨?) |
| **언어** | - | - | 보이지 않음 (i18n.js 에서 관리?) |
| **행제한** | fillForm | 39 | `$('#cfg-max-rows').value = s.execution.maxRows` |
| **행제한** | collectForm | 61 | `execution: { maxRows: Number(...) \|\| 5000 }` |
| **행제한** | saveSettings | 72-92 | `api.saveConfig(collectForm())` |

#### 6.2 폼 필드

```javascript
// settings.js:34-47 fillForm() - 읽기
$('#cfg-java-home').value = s.java.home || '';
$('#cfg-java-options').value = (s.java.options || []).join('\n');
$('#cfg-driver-paths').value = (s.jdbc.driverPaths || []).join('\n');
$('#cfg-auto-discover').checked = s.jdbc.autoDiscover !== false;
$('#cfg-max-rows').value = s.execution.maxRows;        // ← 행제한
$('#cfg-fetch-size').value = s.execution.fetchSize;    // ← 페치 크기
$('#cfg-timeout').value = s.execution.timeoutSec;
$('#cfg-bench-runs').value = s.execution.benchRuns;
$('#cfg-safe-mode').checked = s.execution.safeMode !== false;
```

#### 6.3 저장 플로우

```javascript
// settings.js:72-92 saveSettings()
async function saveSettings() {
  const btn = $('#btn-save-settings');
  await withBusy(btn, async () => {
    try {
      const r = await api.saveConfig(collectForm());
      current = r.settings;
      window.__otConfig = r.settings;  // 전역 참조
      renderDiagnostics(r.diagnostics);
      renderDrivers(r.diagnostics.jars || []);
      toast(text, r.restartError ? 'err' : 'ok', 6000);
    } catch (e) {
      toast(errText(e), 'err');
    }
  }, '저장 중…');
}
```

---

## 개선 권장사항

### 우선순위 높음

1. **i18n 일관성** (설정, 스키마, 접속 뷰)
   - settings.js, schema.js, connect.js의 80+ 하드코딩 문자열 → `t()` 호출로 전환
   - history.js/candidates.js의 상수 테이블 → i18n.js로 이동

2. **프로그레스바 추가** (토너먼트)
   - `renderResult()` 전에 진행률 표시
   - WebSocket 기반 실시간 업데이트 추천

3. **공통 베이스 클래스 추출**
   ```javascript
   class BaseView {
     init(opts) { }
     refresh() { }
     renderError(error) { toast(errText(error), 'err'); }
     withProgress(fn, label) { return withBusy(...); }
   }
   ```

### 우선순위 중간

4. **모달 "확대" 버튼** (서브그리드)
   - 후보/튜닝 상세를 전체 화면 모달로 표시

5. **테마/언어 UI 추가** (settings.js)
   - 현재 i18n 스위치는 어디? (찾을 수 없음)

---

## 파일 목록 & 라인 수

| 파일 | 크기 | 라인 | 역할 |
|------|------|------|------|
| workbench.js | 41KB | ~600 | 메인 SQL 편집 & 실행 |
| candidates.js | 23KB | ~497 | 토너먼트 & 후보 순위 |
| history.js | 13KB | ~291 | 튜닝 이력 관리 |
| library.js | 21KB | ~474 | SQL 스니펫 라이브러리 |
| hint-wizard.js | 16KB | ~350 | 힌트 선택 UI |
| schema.js | 10KB | ~225 | 스키마 탐색기 |
| connect.js | 10KB | ~295 | DB 접속 프로필 |
| settings.js | 7KB | ~196 | 설정 (Java/JDBC) |
| help.js | 39KB | ~800+ | 도움말 모달 (4언어) |

**공유 컴포넌트**
- api.js, editor.js, gridkit.js, i18n.js, util.js

---

## 인덱스

- [1. 뷰 모듈 공통 규약](#1-뷰-모듈-공통-규약)
- [2. 워크벤치](#2-워크벤치-workbenchjs)
- [3. 토너먼트](#3-토너먼트-candidatesjs)
- [4. 서브그리드](#4-서브그리드-master-detail)
- [5. i18n 적용](#5-i18n-적용-실태)
- [6. 설정 뷰](#6-설정-뷰-settingsjs)

---

**보고서 작성**: 2026-07-30  
**조사자**: R3 (뷰 정찰 에이전트)
