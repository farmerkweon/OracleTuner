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

/**
 * Open Grid 에 등록된 role 은 64개뿐이다(DEFAULT_ICON_ROLES). 거기 없는 이름을 주면
 * renderIcon 은 예외를 던지지도 빈 문자열을 주지도 않고 <b>그림이 없는 빈 &lt;svg&gt; 껍데기</b>를
 * 돌려준다. 그래서 아래 `if (!svg)` 가드가 통과돼 버렸고, 라벨이 없는 아이콘 전용 버튼
 * (#btn-sql-save, #btn-wb-dock-save — role 'save')이 화면에서 <b>완전히 빈 상자</b>가 됐다.
 * (QA 라운드에서 총괄이 육안으로 발견 — "무엇인지 알 수 없는 컨트롤"은 결함이다.)
 *
 * <p>지우기에는 기능이 살아 있는 버튼(현재 SQL 저장)이므로, 미등록 role 은 여기서 직접 채운다.
 * Bootstrap Icons(MIT) 와 같은 16x16 격자·같은 선 굵기로 그렸다.
 */
const LOCAL_ICONS = {
  save: '<path fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" d="M2.15 1.6h9.05l2.7 2.7v10.1a.5.5 0 0 1-.5.5H2.65a.5.5 0 0 1-.5-.5V2.1a.5.5 0 0 1 .5-.5z"/>'
      + '<path fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" d="M4.6 1.6v4.3h6.1V1.6M4.6 14.4V9.7h6.8v4.7"/>',
  play: '<path d="M4.6 3.1v9.8l8.2-4.9z"/>'
};

const wrapSvg = (body, size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" fill="currentColor">${body}</svg>`;

/** 그려지는 요소가 하나라도 들어 있는지 — "빈 껍데기 svg" 를 실패로 판정하기 위한 검사. */
const hasDrawable = (s) => /<(path|circle|rect|polygon|polyline|line|ellipse)\b/.test(s);

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
  if (!hasDrawable(svg)) svg = LOCAL_ICONS[role] ? wrapSvg(LOCAL_ICONS[role], size) : '';
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
