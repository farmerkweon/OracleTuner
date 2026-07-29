/**
 * 프로젝트 메타 — 저장소/홈페이지/문의 주소를 <b>한 곳</b>에서 관리한다.
 *
 * 푸터·도움말 등 여러 화면이 같은 주소를 쓰므로, 저장소 이름이 바뀌면 이 파일만 고치면 된다.
 */

export const PROJECT = {
  name: 'Oracle Tuner',
  /** 이 프로그램의 공개 저장소(MIT). 저장소를 다른 이름으로 만들었다면 여기만 바꾸면 된다. */
  repo: 'https://github.com/farmerkweon/OracleTuner',
  license: 'MIT License',
  licenseFile: 'https://github.com/farmerkweon/OracleTuner/blob/main/LICENSE',
  home: 'https://foxnail.kr',
  contact: 'foxnail.biz@gmail.com',
  year: '2026',

  /** 사용 중인 오픈소스 */
  openGrid: {
    name: 'Open Grid',
    repo: 'https://github.com/farmerkweon/OpenGrid',
    guide: 'https://foxnail.kr/open-grid/demo/v2/',
    license: 'MIT License'
  }
};

/** 푸터 등 정적 링크를 실제 주소로 채운다(data-link="repo|license|home" 속성). */
export function applyProjectLinks(root = document) {
  for (const node of root.querySelectorAll('[data-link]')) {
    const key = node.getAttribute('data-link');
    const url = key === 'repo' ? PROJECT.repo
      : key === 'license' ? PROJECT.licenseFile
      : key === 'home' ? PROJECT.home
      : key === 'og-repo' ? PROJECT.openGrid.repo
      : key === 'og-guide' ? PROJECT.openGrid.guide
      : null;
    if (url) node.setAttribute('href', url);
  }
}
