/**
 * 아이콘 — Open Grid 내장 아이콘(Bootstrap Icons, MIT)을 그대로 활용한다.
 *
 * <p>이모지(📄) 대신 Open Grid 의 {@link renderIcon} 을 써서 그리드 UI 와 아이콘 톤을 통일한다.
 * 64개 role(add, delete, edit, copy, refresh, search, chart.bar, settings, help …)이 내장돼 있고,
 * 그 밖의 Bootstrap 아이콘 이름(save, file, folder, play …)도 대체로 렌더된다.
 *
 * <p>사용법
 * <ul>
 *   <li>정적: HTML 요소에 <code>data-icon="add"</code> 를 달면 {@link applyIcons} 가 채운다.
 *       텍스트가 함께 있으면 아이콘을 <b>앞에</b> 붙인다.</li>
 *   <li>동적: {@link icon}(role) 이 SVG 문자열을 돌려준다.</li>
 * </ul>
 */

import { renderIcon } from '/vendor/open-grid/open-grid.js';

const cache = new Map();

/** role → SVG 문자열. 실패하면 빈 문자열(레이아웃이 깨지지 않게). */
export function icon(role, size = 16) {
  const key = `${role}@${size}`;
  if (cache.has(key)) return cache.get(key);
  let svg = '';
  try {
    const out = renderIcon(role, { size });
    svg = typeof out === 'string' ? out : (out && out.outerHTML) || '';
  } catch (e) {
    svg = '';
  }
  cache.set(key, svg);
  return svg;
}

/** 아이콘 + 텍스트를 담은 버튼 내용 HTML. */
export function iconLabel(role, label, size = 15) {
  const svg = icon(role, size);
  return `<span class="ic">${svg}</span>${label ? `<span class="ic-label">${label}</span>` : ''}`;
}

/** data-icon 속성이 붙은 요소를 실제 아이콘으로 채운다. 텍스트는 보존하고 앞에 아이콘을 넣는다. */
export function applyIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    // 이미 아이콘이 들어 있으면 건너뛴다. 단, 언어 변경으로 applyDom 이 textContent 를
    // 다시 써서 .ic 가 사라진 경우엔 다시 감싼다(재실행 가능).
    if (node.querySelector(':scope > .ic')) continue;
    const role = node.getAttribute('data-icon');
    const size = Number(node.getAttribute('data-icon-size')) || 15;
    const svg = icon(role, size);
    if (!svg) continue;
    const text = node.textContent.trim();
    node.innerHTML = `<span class="ic">${svg}</span>` + (text ? `<span class="ic-label">${text}</span>` : '');
    node.classList.add('has-icon');
  }
}
