'use strict';
/**
 * PlantUML(MIT 변종) jar 내려받기 도우미.
 *
 * 표준 PlantUML 배포판은 GPL 이라 MIT 변종(plantuml-mit)을 쓴다. Maven Central 에
 * 정식 배포되므로 tools/fetch-driver.js 와 같은 방식(https.get + 리다이렉트 추적)으로
 * 받는다. 네트워크가 막힌 폐쇄망도 흔하므로, 실패하면 수동 배치 안내를 출력하고
 * 정상 종료한다(빌드 전체를 막지 않는다).
 *
 * 사용:
 *   node design/fetch-plantuml.js                 # 기본 버전
 *   node design/fetch-plantuml.js 1.2026.6         # 버전 지정
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'https://repo1.maven.org/maven2';
const GROUP = 'net/sourceforge/plantuml';
const ARTIFACT = 'plantuml-mit';
const DEFAULT_VERSION = '1.2026.6';

const VENDOR_DIR = path.join(__dirname, 'vendor');

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('리다이렉트가 너무 많습니다'));
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('타임아웃')));
    req.on('error', reject);
  });
}

/** vendor/ 아래 이미 jar 가 있으면 그 경로를 돌려준다(없으면 null). */
function findExisting() {
  if (!fs.existsSync(VENDOR_DIR)) return null;
  const jar = fs.readdirSync(VENDOR_DIR).find((f) => /^plantuml-mit.*\.jar$/i.test(f));
  return jar ? path.join(VENDOR_DIR, jar) : null;
}

async function main() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  const existing = findExisting();
  if (existing) {
    console.log(`[OK] 이미 있습니다: ${existing}`);
    return;
  }

  const version = process.argv[2] || DEFAULT_VERSION;
  const fileName = `${ARTIFACT}-${version}.jar`;
  const url = `${REPO}/${GROUP}/${ARTIFACT}/${version}/${fileName}`;
  const dest = path.join(VENDOR_DIR, fileName);

  console.log(`내려받는 중: ${url}`);
  try {
    const buf = await get(url);
    if (buf.length < 1000000) throw new Error(`받은 파일이 너무 작습니다(${buf.length} bytes)`);
    fs.writeFileSync(dest, buf);
    console.log(`[OK] 저장했습니다: ${dest} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  } catch (e) {
    console.error(`[FAIL] 내려받기 실패: ${e.message}`);
    console.error('');
    console.error('수동 배치 방법:');
    console.error(`  1) ${url} 를 브라우저로 내려받습니다.`);
    console.error(`  2) 파일을 ${VENDOR_DIR} 에 넣습니다.`);
    console.error('  3) node design/render.js 를 다시 실행합니다.');
    process.exitCode = 1;
  }
}

main();
