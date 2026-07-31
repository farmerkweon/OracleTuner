'use strict';
/**
 * 데모 설치 CLI 진입점 (개발 편의용).
 *
 * ★ 본체는 server/demo-install.js 로 옮겼다 (2026-07-31).
 *   이유: 이 기능은 **런타임 코드**인데 빌드 도구 폴더인 tools/ 에 있었다.
 *   설치판 스테이징은 tools/ 를 담지 않으므로(담아서도 안 된다 — tools/publish 에는
 *   서버 접속 정보가 들어간다), 설치판에서 require('../tools/install-demo') 가
 *   MODULE_NOT_FOUND 로 죽었다.
 *   증상: "데모데이터 생성 안 먹힘", "샘플예제 버튼 눌러도 에러" (2026-07-31 실사용 보고).
 *
 * 사용: node tools/install-demo.js [접속스코프]
 */
const demo = require('../server/demo-install.js');
if (require.main === module) demo.main();
module.exports = demo;
