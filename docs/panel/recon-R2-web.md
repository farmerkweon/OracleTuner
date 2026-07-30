## 총괄용 요약

### 1. 테마 체계
- **정의 위치**: index.html:41-50 select 옵션 (forest 포함), CSS는 app.css :root 변수
- **기본 테마 결정**: localStorage('ot.theme') 복구 (app.js:42-44), Open Grid 라이브러리 theme 파라미터
- **forest 기본화 방법**: index.html의 select value="default" → value="forest", app.js에서 초기값 로직 수정

### 2. 에디터 색상 버그
- **원인 가설 A**: SQL ≥120KB(LARGE_DOC_CHARS) 시 색상 끔 (editor.js:25, 138-142)
- **원인 가설 B**: tokenizer 내부 토큰 수 상한 있을 시 초과분 미분류 → fallback 없거나 흰색
- **CSS 색상 규칙**: app.css:226-237 .sqlt-* 클래스에 정의됨

### 3. 그리드 휠 스크롤
- **구현 방식**: Open Grid 라이브러리 자체 (외부 라이브러리)
- **gridkit.js**: wheel/scroll 직접 핸들링 없음, 그리드 높이만 관리
- **스크롤 안 됨 원인 가설 1**: Open Grid 가상스크롤의 maxScroll 계산 오류
- **스크롤 안 됨 원인 가설 2**: 마스터-디테일 중첩 시 scroll 컨테이너 중첩으로 외부 스크롤 블로킹

### 4. 서브그리드 렌더링
- **구현**: masterDetail 옵션 (gridkit.js:242-254), height:200px, expandMultiple:true
- **모달/팝업 유틸**: app.css:473-479 .modal-backdrop/.modal (이미 구현됨)
- **확대 기능**: 별도로 없음, 행 확대(expand)만 있음

### 5. 레이아웃 높이/푸터
- **현재**: #views height: calc(100% - topbar - railbar - footer), footer position:fixed
- **변경 방법**: #views에서 calc 제거 + overflow:auto, footer position:relative로 변경

---

## 상세 분석

### 1. 테마 체계 상세

#### 테마 목록 정의
**파일**: `E:\IBANK\SeTools\OracleTuner\web\index.html:41-50`
```html
<select id="sel-theme">
  <option value="default">default</option>
  <option value="modern">modern</option>
  <option value="slate">slate</option>
  <option value="ocean">ocean</option>
  <option value="forest">forest</option>  <!-- 포함됨 -->
  ...
</select>
```

#### 기본 테마 결정 흐름
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\app.js:42-47`
```javascript
const saved = localStorage.getItem('ot.theme');
if (saved) themeSel.value = saved;
setTheme(themeSel.value);
themeSel.addEventListener('change', () => {
  setTheme(themeSel.value);
  localStorage.setItem('ot.theme', themeSel.value);
});
```

#### 테마 적용 (gridkit.js 래퍼)
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\gridkit.js:56-60`
```javascript
export function setTheme(theme) {
  currentTheme = theme;
  for (const g of registry) {
    try { g.setTheme(theme); } catch (e) { }
  }
}
```
→ 모든 Open Grid 인스턴스에 theme 적용

#### CSS 변수 정의
**파일**: `E:\IBANK\SeTools\OracleTuner\web\css\app.css:8-35` (일부)
```css
:root {
  --primary:       #1976d2;
  --text:          #1f2430;
  --panel:         #ffffff;
  --panel-2:       #fbfcfd;
  --border:        #e5e7eb;
  ...
}
```

#### forest를 기본으로 바꾸려면
1. **index.html:42** `value="default"` → `value="forest"`
2. app.js는 localStorage가 없을 때 select.value를 읽으므로 자동 적용됨

---

### 2. 에디터 색상 버그 상세

#### 렌더링 아키텍처
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\editor.js:1-10`
- 투명 textarea를 색칠된 pre 위에 겹침 (외부 라이브러리 없음)
- 서버 분석기와 **같은 토크나이저** 사용

#### 구현 코드
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\editor.js:19`
```javascript
const T = () => globalThis.SqlTokenizer;
```

**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\editor.js:138-144`
```javascript
const large = v.length > LARGE_DOC_CHARS;  // 120KB
if (large !== this._largeMode) {
  this._largeMode = large;
  this.root.classList.toggle('is-large', large);
}
this.hl.innerHTML = (large || !tk ? escapeHtml(v) : tk.highlight(v)) + '\n ';
```

#### 토큰 색상 규칙
**파일**: `E:\IBANK\SeTools\OracleTuner\web\css\app.css:226-237`
```css
.sqlt-keyword  { color: #0b5cad; font-weight: 700; }
.sqlt-func     { color: #7b4bc4; }
.sqlt-string   { color: #b3261e; }
.sqlt-number   { color: #0a7d55; }
.sqlt-comment  { color: #8a94a6; font-style: italic; }
.sqlt-unknown  { color: #b3261e; text-decoration: wavy underline; }
... 기타 7개
```

#### 색상 버그 원인 가설

**가설 A: 대용량 문서 자동 색상 off**
- SQL 길이 ≥ 120KB(약 3~4천 줄)일 때 색상 하이라이팅 완전히 끔
- 이유: 수십만 토큰 생성 시 편집기 성능 저하 방지
- **검증 방법**: tokenizer 콜 자체를 제거하므로, 색상이 꺼졌다면 SQL이 120KB 초과인지 확인

**가설 B: 토크나이저 내부 상한**
- tokenizer 내부에서 처리 토큰 수 상한이 있어 초과분이 미분류(span 없음) 처리
- 미분류 텍스트는 .sqlt-unknown이 없으면 기본 색상(white? 상속?)
- **검증 방법**: tokenizer 콜 결과를 브라우저 DevTools DOM 검사 → 긴 SQL 뒷부분이 span 없는지 확인

**가설 C: textarea 하단 오버플로우 스타일 누수**
- .sqled-input의 색상 정의를 다시 확인
  ```css
  .sqled-input {
    background: transparent; color: transparent; caret-color: #111;
  }
  ```
- 하단 여유분이 색 보이는지 (CSS 오버플로우?) 확인

---

### 3. 그리드 휠 스크롤 상세

#### 그리드 구현
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\gridkit.js:20-45`
```javascript
export function makeGrid(host, options = {}) {
  const grid = OG.createGrid(host, {
    height: '100%',
    ...options
  });
  host._ogGrid = grid;
  registry.add(grid);
  return grid;
}
```

#### gridkit.js의 scroll 핸들링
- **wheel/scroll 직접 핸들링 없음**
- gridkit.js는 Open Grid 래퍼일 뿐, 스크롤은 Open Grid 라이브러리의 구현 사용

#### 그리드 높이 설정 (app.css)
**파일**: `E:\IBANK\SeTools\OracleTuner\web\css\app.css:273`
```css
.grid-host-full { height: calc(100% - 40px); }
.grid-host { height: 100%; }
```

#### 스크롤 안 됨 원인 가설

**가설 1: 가상 스크롤(Virtual Scroll) 계산 오류**
- Open Grid의 가상 스크롤에서 maxScroll 또는 totalHeight 계산이 데이터 행 수를 과소평가
- 마지막 행까지 가능한 스크롤 위치가 실제보다 작음
- **검증**: scrollTop/scrollHeight 콘솔 로깅

**가설 2: 마스터-디테일 중첩 시 scroll 컨테이너 중첩**
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\gridkit.js:242-254`
```javascript
const grid = makeGrid(host, {
  columns,
  masterDetail: {
    enabled: true,
    height: 200,
    heightMode: 'auto',
    expandMultiple: true,
    renderer: (row, hostEl) => {
      hostEl.innerHTML = findingDetailHtml(row);
      ...
    }
  }
});
```
- 마스터 그리드(외부 스크롤) + 디테일 패널(내부 스크롤) 겹침
- 사용자가 그리드 위에서 휠하면 내부 스크롤만 먹을 수 있음
- **검증**: 마스터 그리드 body 영역 vs 디테일 panel 영역에서 각각 휠 동작 테스트

**가설 3: 그리드 컨테이너의 overflow 속성 누락**
- 부모 요소가 `overflow: hidden`이거나 `height: calc(...)`로 고정되어 스크롤 불가능
- **검증**: 개발자 도구 → 그리드 요소 > 부모의 overflow/height 확인

---

### 4. 서브그리드 렌더링 상세

#### 마스터-디테일 구현
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\gridkit.js:224-260` (진단 그리드)

```javascript
const grid = makeGrid(host, {
  columns,
  masterDetail: {
    enabled: true,
    height: 200,          // 고정 높이
    heightMode: 'auto',
    expandMultiple: true, // 다중 확대 허용
    renderer: (row, hostEl) => {
      hostEl.innerHTML = findingDetailHtml(row);
      if (row.autoFixable && onFix) {
        const btn = hostEl.querySelector('[data-fix]');
        if (btn) btn.addEventListener('click', () => onFix(row));
      }
    }
  }
});
```

#### 디테일 HTML 생성
**파일**: `E:\IBANK\SeTools\OracleTuner\web\js\gridkit.js:263-278`
```javascript
function findingDetailHtml(f) {
  return `<div class="detail-panel">
    <h4>...</h4>
    <div class="dp-block">...</div>
    ...
  </div>`;
}
```

#### 모달/팝업 유틸
**파일**: `E:\IBANK\SeTools\OracleTuner\web\css\app.css:473-479`
```css
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(20,26,38,.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal {
  width: min(940px, 94vw);
  max-height: 90vh;
  display: flex; flex-direction: column;
}
```

#### 확대 기능 확인
- **행 확대(expand row)**: 있음 (masterDetail 사용)
- **별도 확대(modal/popup)**: 이미 구현됨 (.modal-backdrop)
- **그리드 내 subgrid (서브그리드)**: 없음

---

### 5. 레이아웃 높이/푸터 상세

#### 현재 레이아웃 구조
**파일**: `E:\IBANK\SeTools\OracleTuner\web\css\app.css:29-35`
```css
:root {
  --topbar-h:      52px;
  --railbar-h:     50px;
  --footer-h:      28px;
}

html { height: 100%; }
body { height: 100%; }
#views {
  height: calc(100% - var(--topbar-h) - var(--railbar-h) - var(--footer-h));
  position: relative;
}
.app-footer {
  position: fixed; left: 0; right: 0; bottom: 0;
  height: var(--footer-h);
  z-index: 40;
}
```

**파일**: `E:\IBANK\SeTools\OracleTuner\web\index.html:353-361`
```html
<footer class="app-footer">
  <span class="af-copy">© 2026 <a href="...">foxnail</a>. ...</span>
  ...
</footer>
```

#### 현재 문제
- `#views` 높이 = viewport - 130px (고정)
- 컨텐츠가 130px 푸터 영역과 겹쳐짐
- 푸터는 `position: fixed`이므로 스크롤 따라가지 않고 하단에 고정

#### 변경하려면 (문서 끝까지 펼쳐지는 구조)

1. **app.css 수정**:
   ```css
   #views {
     /* calc 제거 */
     /* height: calc(...); */
     position: relative;
     overflow: auto;  /* 추가 */
   }
   
   .app-footer {
     position: relative;  /* fixed → relative */
     /* left/right/bottom/z-index 제거 */
     height: var(--footer-h);
   }
   ```

2. **효과**:
   - #views가 vp 높이 전체 사용
   - overflow: auto일 때 컨텐츠만 스크롤
   - footer는 body 가장 아래, 스크롤 문서 끝에 위치

#### 영향받는 선택자
- `.view { display: none; height: 100%; }` — 수정 불필요 (자식이므로 부모 overflow 영향받음)
- `.wb-layout`, `.schema-layout` — height: 100% 유지 (부모 overflow 덕분에 자동 크기 조정)
- `.pane-results` 등 내부 패널 — 그대로 작동

---

## 로그

**파일**: `logs/agent/R2-web.log`
- 조사 시작/종료 기록
- 15분 주기 HEARTBEAT (감시용)
