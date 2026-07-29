/**
 * 화면 공용 유틸 — DOM 단축, 포맷, 토스트, 로그.
 * 프레임워크를 쓰지 않으므로 여기서 반복되는 잡일을 흡수한다.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 서버가 만든 설명 문구는 <b> 정도의 최소 태그만 허용한다. */
export function safeHtml(s) {
  return esc(s).replace(/&lt;(\/?)(b|i|code|br)&gt;/g, '<$1$2>');
}

// ── 포맷 ───────────────────────────────────────────────────────────────────

export function fmtNum(v, digits = 0) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtMs(v) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (n >= 60000) return `${(n / 60000).toFixed(2)} 분`;
  if (n >= 1000) return `${(n / 1000).toFixed(3)} 초`;
  return `${n.toFixed(1)} ms`;
}

export function fmtPct(v, { arrow = true } = {}) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const sign = arrow ? (n > 0.05 ? '▼ ' : n < -0.05 ? '▲ ' : '') : (n > 0 ? '+' : '');
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

export function fmtBig(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}G`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('ko-KR');
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── 토스트 / 로그 ──────────────────────────────────────────────────────────

let toastHost = null;

export function toast(message, kind = '', ms = 3600) {
  if (!toastHost) toastHost = $('#toast-host');
  const node = el('div', { class: `toast ${kind}`, text: String(message) });
  toastHost.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, ms);
  return node;
}

const logLines = [];

/** 하단 [메시지] 탭에 한 줄 남긴다. 실행/오류의 흔적을 화면에서도 추적할 수 있게. */
export function logMsg(text, kind = '') {
  const t = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
  logLines.push({ ts, text: String(text), kind });
  if (logLines.length > 500) logLines.shift();
  const host = $('#log-text');
  if (host) {
    host.innerHTML = logLines.map((l) =>
      `<span class="lg-dim">[${l.ts}]</span> <span class="${l.kind === 'err' ? 'lg-err' : l.kind === 'ok' ? 'lg-ok' : ''}">${esc(l.text)}</span>`
    ).join('\n');
    host.scrollTop = host.scrollHeight;
  }
}

/** 오류를 사람이 읽을 수 있는 문자열로 만든다(ORA 코드 포함). */
export function errText(e) {
  if (!e) return '알 수 없는 오류';
  const detail = e.detail || (e.error && e.error.detail);
  const base = e.message || String(e);
  if (detail && detail.ora) return `${detail.ora} ${base}`;
  return base;
}

// ── 기타 ───────────────────────────────────────────────────────────────────

export function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * 텍스트를 클립보드로 복사한다.
 * navigator.clipboard 는 안전 컨텍스트(https/localhost)에서만 되므로, 실패하면
 * 숨은 textarea + execCommand 로 폴백한다(사내 http 환경 대비).
 * @returns {Promise<boolean>} 성공 여부
 */
export async function copyToClipboard(text) {
  const s = String(text === null || text === undefined ? '' : text);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch (e) { /* 폴백으로 진행 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, s.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** 버튼을 잠시 잠그고 작업을 수행한다(중복 클릭 방지 + 진행 표시). */
export async function withBusy(btn, fn, busyLabel = '…') {
  if (!btn) return fn();
  const old = btn.textContent;
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try {
    return await fn();
  } finally {
    btn.disabled = wasDisabled;
    btn.textContent = old;
  }
}
