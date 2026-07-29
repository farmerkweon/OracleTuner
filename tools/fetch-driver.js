'use strict';
/**
 * Oracle JDBC 드라이버(ojdbc) 내려받기 도우미.
 *
 * Oracle 은 ojdbc 를 Maven Central 에 공식 배포한다(그룹 com.oracle.database.jdbc).
 * 네트워크가 막힌 환경도 흔하므로, 실패하면 수동 배치 안내를 출력하고 정상 종료한다.
 *
 * 사용:
 *   node tools/fetch-driver.js              # ojdbc11 최신 기본 버전
 *   node tools/fetch-driver.js ojdbc8       # 아티팩트 지정
 *   node tools/fetch-driver.js ojdbc11 23.9.0.25.07
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const P = require('../server/paths');

const REPO = 'https://repo1.maven.org/maven2';
const GROUP = 'com/oracle/database/jdbc';

/** 아티팩트별 기본 버전 — 필요하면 인자로 덮어쓴다. */
const DEFAULT_VERSIONS = {
  ojdbc11: '23.9.0.25.07',
  ojdbc8: '23.9.0.25.07'
};

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

async function main() {
  P.ensureDirs();
  const artifact = process.argv[2] || 'ojdbc11';
  const version = process.argv[3] || DEFAULT_VERSIONS[artifact] || DEFAULT_VERSIONS.ojdbc11;
  const fileName = `${artifact}-${version}.jar`;
  const url = `${REPO}/${GROUP}/${artifact}/${version}/${fileName}`;
  const dest = path.join(P.javaLib, `${artifact}.jar`);

  console.log(`내려받는 중: ${url}`);
  try {
    const buf = await get(url);
    if (buf.length < 100000) throw new Error(`받은 파일이 너무 작습니다(${buf.length} bytes)`);
    fs.writeFileSync(dest, buf);
    console.log(`[OK] 저장했습니다: ${dest} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
    console.log('설정 > JDBC 드라이버에서 자동 탐색됩니다. 서버를 재시작하세요.');
  } catch (e) {
    console.error(`[FAIL] 내려받기 실패: ${e.message}`);
    console.error('');
    console.error('수동 배치 방법:');
    console.error(`  1) ${url} 를 브라우저로 내려받거나`);
    console.error('     Oracle 다운로드 페이지에서 ojdbc11.jar 를 구합니다.');
    console.error(`  2) 파일을 ${P.javaLib} 에 넣습니다(이름은 ojdbc11.jar 권장).`);
    console.error('  3) 서버 설정 화면에서 [드라이버 재탐색] 을 누릅니다.');
    process.exitCode = 1;
  }
}

main();
