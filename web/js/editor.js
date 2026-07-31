/**
 * SQL 에디터 — 구문 색상 + 줄번호 + 문장 인식.
 *
 * <p><b>구현 방식</b>: 투명한 &lt;textarea&gt; 를 색칠된 &lt;pre&gt; 위에 정확히 겹친다.
 * 외부 에디터 라이브러리(CodeMirror/Monaco)를 쓰지 않은 이유는
 * (1) 오프라인·폐쇄망 설치를 고려해 의존성을 줄이고,
 * (2) 색칠 규칙을 서버 분석기와 <b>같은 토크나이저</b>로 유지하기 위해서다.
 * 색이 맞으면 분석도 맞는다 — 파서가 하나뿐이라 어긋날 여지가 없다.
 *
 * 단축키
 *   Ctrl+Enter        현재 문장 실행
 *   Ctrl+E            현재 문장 실행계획
 *   Ctrl+D            현재 문장 진단
 *   Ctrl+Shift+F      정렬(포맷)
 *   Tab / Shift+Tab   들여쓰기 / 내어쓰기 (선택 영역 지원)
 *   Ctrl+/            선택 줄 주석 토글
 */

import { t } from './i18n.js';
import { esc } from './util.js';

const T = () => globalThis.SqlTokenizer;

/**
 * 이 크기를 넘는 SQL 은 색상 하이라이팅을 끄고 평문으로 그린다(반응성 우선).
 * 약 12만 자 ≈ 3~4천 줄. SQL 내용·실행·분석은 전체가 그대로 대상이며 색상만 간소화된다.
 */
const LARGE_DOC_CHARS = 120000;

export class SqlEditor {
  /**
   * @param {HTMLElement} host
   * @param {{value?:string, readOnly?:boolean, onChange?:Function, onAction?:Function, name?:string}} opts
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.name = opts.name || 'editor';
    this._onChange = opts.onChange || (() => {});
    this._onAction = opts.onAction || (() => {});

    host.innerHTML = `
      <div class="sqled${opts.readOnly ? ' is-readonly' : ''}">
        <div class="sqled-gutter"></div>
        <div class="sqled-scroll">
          <pre class="sqled-highlight" aria-hidden="true"><code></code></pre>
          <textarea class="sqled-input" spellcheck="false" wrap="off"
            aria-label="${esc(t('ed.aria', { name: opts.name || 'SQL' }))}"></textarea>
        </div>
      </div>`;

    this.root = host.querySelector('.sqled');
    this.gutter = host.querySelector('.sqled-gutter');
    this.scroll = host.querySelector('.sqled-scroll');
    this.hl = host.querySelector('.sqled-highlight code');
    this.input = host.querySelector('.sqled-input');

    if (opts.readOnly) this.input.readOnly = true;

    this.input.addEventListener('input', () => this._render());
    this.input.addEventListener('scroll', () => this._syncScroll());
    this.scroll.addEventListener('scroll', () => this._syncGutter());
    this.input.addEventListener('keydown', (e) => this._onKey(e));

    // 컨테이너 크기가 바뀌면(뷰 전환으로 display:none→보임, 스플리터 드래그, 창 크기)
    // 편집기 높이를 다시 잡는다. display:none 에서 0 으로 잡혔던 높이를 자가 복구한다.
    if (typeof ResizeObserver !== 'undefined') {
      let lastH = 0;
      this._ro = new ResizeObserver(() => {
        const h = this.host.clientHeight;
        if (h > 0 && h !== lastH) { lastH = h; this._render(); }
      });
      try { this._ro.observe(this.host); } catch (e) { /* noop */ }
    }

    this.setValue(opts.value || '');
  }

  get value() { return this.input.value; }

  /**
   * 레이아웃 재계산. 편집기가 처음 만들어질 때 부모가 display:none 이면 높이가 0 으로
   * 잡혀 입력이 안 되므로, 화면에 보이게 된 뒤 이걸 호출해 크기를 다시 잡는다.
   */
  refresh() { this._render(); }

  setValue(v) {
    this.input.value = v === null || v === undefined ? '' : String(v);
    this._render();
  }

  focus() { this.input.focus(); }

  /** 캐럿 위치의 문장(없으면 전체). 실행 버튼이 이걸 쓴다. */
  currentStatement() {
    const sql = this.value;
    const tk = T();
    if (!tk) return { sql, start: 0, end: sql.length, type: 'OTHER' };
    const sel = this.input.selectionStart !== this.input.selectionEnd;
    if (sel) {
      const s = this.input.selectionStart;
      const e = this.input.selectionEnd;
      return { sql: sql.slice(s, e), start: s, end: e, type: tk.classify(sql.slice(s, e)), fromSelection: true };
    }
    const st = tk.statementAt(sql, this.input.selectionStart);
    if (st && st.sql.trim()) return st;
    return { sql, start: 0, end: sql.length, type: tk.classify(sql) };
  }

  /** 현재 문장을 하이라이트(잠깐 선택 표시)해서 무엇이 실행되는지 보여준다. */
  markStatement() {
    const st = this.currentStatement();
    if (st.fromSelection) return;
    this.input.setSelectionRange(st.start, st.end);
    setTimeout(() => {
      if (this.input.selectionStart === st.start && this.input.selectionEnd === st.end) {
        this.input.setSelectionRange(st.end, st.end);
      }
    }, 450);
  }

  replaceCurrentStatement(newSql) {
    const st = this.currentStatement();
    const v = this.value;
    this.setValue(v.slice(0, st.start) + newSql + v.slice(st.end));
    this.input.setSelectionRange(st.start, st.start + newSql.length);
    this._onChange(this.value);
  }

  // ── 내부 ────────────────────────────────────────────────────────────────

  _render() {
    const v = this.input.value;
    const tk = T();

    // ── 대용량 모드 ──────────────────────────────────────────────────────
    // 색상 하이라이팅은 토큰마다 <span> 을 만든다. 10,000줄(수십만 토큰)에서는
    // 매 키 입력마다 수십만 개 span 을 생성해 편집기가 얼어붙는다. 그래서 임계 크기를
    // 넘으면 <b>색상을 끄고 평문</b>으로만 그린다(입력 반응성 우선). SQL 자체는 그대로 —
    // 잘리지 않고, 실행·분석도 전체가 대상이다. 색상만 간소화된다.
    const large = v.length > LARGE_DOC_CHARS;
    if (large !== this._largeMode) {
      this._largeMode = large;
      this.root.classList.toggle('is-large', large);
    }
    // 마지막 줄이 개행이면 <pre> 높이가 한 줄 모자라 보이므로 여백 한 줄을 더한다
    this.hl.innerHTML = (large || !tk ? escapeHtml(v) : tk.highlight(v)) + '\n ';

    const lines = v.split('\n').length;
    if (this._lineCount !== lines) {
      this._lineCount = lines;
      // 초대형 문서에서 줄번호 문자열을 매번 새로 만들면 그것도 부담이므로 조금 넉넉히 캐시한다
      let g = '';
      for (let i = 1; i <= lines; i++) g += i + '\n';
      this.gutter.textContent = g;
    }
    // textarea 높이를 내용에 맞춰 늘려 스크롤을 바깥(.sqled-scroll)이 담당하게 한다
    this.input.style.height = 'auto';
    this.input.style.height = Math.max(this.scroll.clientHeight, this.input.scrollHeight) + 'px';
    this.input.style.width = 'auto';
    this.input.style.width = Math.max(this.scroll.clientWidth, this.input.scrollWidth) + 'px';

    this._syncGutter();
    this._onChange(v);
  }

  _syncScroll() {
    this.scroll.scrollTop = this.input.scrollTop;
    this.scroll.scrollLeft = this.input.scrollLeft;
  }

  _syncGutter() {
    this.gutter.style.transform = `translateY(${-this.scroll.scrollTop}px)`;
  }

  _onKey(e) {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'Enter') { e.preventDefault(); this._onAction('run', this); return; }
    if (ctrl && !e.shiftKey && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); this._onAction('explain', this); return; }
    if (ctrl && !e.shiftKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); this._onAction('analyze', this); return; }
    if (ctrl && e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); this._onAction('format', this); return; }
    if (ctrl && e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this._onAction('compare', this); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      this._indent(e.shiftKey);
      return;
    }
    if (ctrl && e.key === '/') {
      e.preventDefault();
      this._toggleComment();
      return;
    }
  }

  _indent(outdent) {
    const ta = this.input;
    const v = ta.value;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const unit = '  ';

    if (s === e && !outdent) {
      ta.setRangeText(unit, s, e, 'end');
      this._render();
      return;
    }
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = v.indexOf('\n', e);
    if (lineEnd < 0) lineEnd = v.length;
    const block = v.slice(lineStart, lineEnd);
    const changed = block.split('\n').map((ln) => {
      if (outdent) return ln.replace(/^(\t| {1,2})/, '');
      return unit + ln;
    }).join('\n');
    ta.setRangeText(changed, lineStart, lineEnd, 'select');
    this._render();
  }

  _toggleComment() {
    const ta = this.input;
    const v = ta.value;
    const lineStart = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let lineEnd = v.indexOf('\n', ta.selectionEnd);
    if (lineEnd < 0) lineEnd = v.length;
    const block = v.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const allCommented = lines.every((l) => !l.trim() || /^\s*--/.test(l));
    const changed = lines.map((l) => {
      if (!l.trim()) return l;
      return allCommented ? l.replace(/^(\s*)--\s?/, '$1') : l.replace(/^(\s*)/, '$1-- ');
    }).join('\n');
    ta.setRangeText(changed, lineStart, lineEnd, 'select');
    this._render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
