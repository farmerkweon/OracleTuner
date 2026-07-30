'use strict';
/**
 * .puml 소스(design/src/*.puml) + 로케일 번역표(labels.json) → 로케일별 SVG(web/design/*.svg).
 *
 * 도움말 "설계 보기" 탭은 런타임에 렌더하지 않는다 — 빌드 시점(개발자 PC)에 이 스크립트로
 * SVG 를 만들어 web/design/ 에 커밋해 두고, 앱은 그 이미지만 <img> 로 보여준다. 폐쇄망
 * 사용자에게는 PlantUML/Java 가 없을 수 있으므로 이 방식만 성립한다.
 *
 * 총괄이 실측 검증한 렌더 경로만 쓴다:
 *   java -jar <plantuml-mit.jar> -tsvg -Playout=smetana <file.puml>
 * 이 머신에 Graphviz(dot) 가 없어서 PlantUML 내장 smetana 레이아웃을 강제한다
 * (.puml 안에도 !pragma layout smetana 를 넣어 이중 안전).
 *
 * 로케일마다 폰트를 다르게 지정한다 — PlantUML 이 글자 폭을 재서 상자 크기를 정하므로
 * 글리프 없는 폰트면 레이아웃이 깨진다(ja/zh 두부(□□□) 현상).
 *
 * Docker 는 이 개발 머신에 없다. docker 가 있는 환경을 위한 폴백 경로만 마련해 둔다
 * (우선순위 낮음 — jar 를 못 찾을 때만 시도한다).
 *
 * 사용: node design/render.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC_DIR = path.join(__dirname, 'src');
const OUT_DIR = path.join(__dirname, '..', 'web', 'design');
const VENDOR_DIR = path.join(__dirname, 'vendor');
const TMP_DIR = path.join(VENDOR_DIR, '.tmp');

const LOCALES = ['ko', 'en', 'ja', 'zh'];

/** PlantUML 이 글자 폭을 측정해 상자 크기를 정하므로, 글리프 있는 폰트를 로케일별로 지정한다. */
const FONTS = {
  ko: 'Malgun Gothic',
  ja: 'Yu Gothic',
  zh: 'Microsoft YaHei',
  en: 'Segoe UI'
};

const labels = JSON.parse(fs.readFileSync(path.join(__dirname, 'labels.json'), 'utf8'));

/** src/*.puml 안의 ${라벨키} 를 labels.json 의 로케일 번역으로 치환한다. */
function substitute(src, locale) {
  return src.replace(/\$\{([^}]+)\}/g, (m, key) => {
    const entry = labels[key];
    if (!entry || typeof entry[locale] !== 'string') {
      throw new Error(`labels.json 에 없는 키: "${key}" (${locale})`);
    }
    return entry[locale];
  });
}

/** !pragma layout smetana 바로 다음 줄에 로케일 폰트 지정을 끼워 넣는다. */
function injectFont(src, locale) {
  const font = FONTS[locale];
  if (!src.includes('!pragma layout smetana')) {
    throw new Error('!pragma layout smetana 가 없는 .puml 입니다.');
  }
  return src.replace(
    '!pragma layout smetana',
    `!pragma layout smetana\nskinparam defaultFontName ${font}`
  );
}

function findJar() {
  if (!fs.existsSync(VENDOR_DIR)) return null;
  const jar = fs.readdirSync(VENDOR_DIR).find((f) => /^plantuml-mit.*\.jar$/i.test(f));
  return jar ? path.join(VENDOR_DIR, jar) : null;
}

function hasDocker() {
  const r = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

/** 총괄이 실측 검증한 렌더 경로. */
function renderWithJava(jar, tmpFile) {
  const r = spawnSync('java', ['-jar', jar, '-tsvg', '-Playout=smetana', tmpFile], {
    cwd: path.dirname(tmpFile),
    encoding: 'utf8'
  });
  if (r.status !== 0) {
    throw new Error(`java 렌더 실패(exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 500)}`);
  }
}

/** Docker 폴백 — 이 개발 머신에는 docker 가 없다(있는 환경을 위한 경로만). */
function renderWithDocker(tmpFile) {
  const dir = path.dirname(tmpFile);
  const base = path.basename(tmpFile);
  const r = spawnSync('docker', [
    'run', '--rm', '-v', `${dir}:/data`, 'plantuml/plantuml',
    '-tsvg', '-Playout=smetana', `/data/${base}`
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`docker 렌더 실패(exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 500)}`);
  }
}

function render(tmpFile) {
  const jar = findJar();
  if (jar) return renderWithJava(jar, tmpFile);
  if (hasDocker()) return renderWithDocker(tmpFile);
  throw new Error(
    `PlantUML jar 를 찾을 수 없습니다(${VENDOR_DIR}). ` +
    'node design/fetch-plantuml.js 를 먼저 실행하거나 jar 를 수동으로 넣으세요.'
  );
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.puml'));
  if (!files.length) {
    console.error(`[FAIL] ${SRC_DIR} 에 .puml 파일이 없습니다.`);
    process.exitCode = 1;
    return;
  }

  let ok = 0, fail = 0;
  for (const file of files) {
    const name = file.replace(/\.puml$/, '');
    const rawSrc = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    for (const locale of LOCALES) {
      const tmpFile = path.join(TMP_DIR, `${name}.${locale}.puml`);
      try {
        const src = injectFont(substitute(rawSrc, locale), locale);
        fs.writeFileSync(tmpFile, src, 'utf8');
        render(tmpFile);
        const svgTmp = tmpFile.replace(/\.puml$/, '.svg');
        const svgOut = path.join(OUT_DIR, `${name}.${locale}.svg`);
        fs.copyFileSync(svgTmp, svgOut);
        console.log(`[OK] ${name}.${locale}.svg`);
        ok++;
      } catch (e) {
        console.error(`[FAIL] ${name}.${locale}: ${e.message}`);
        fail++;
      }
    }
  }

  console.log(`완료: ${ok}개 생성, ${fail}개 실패 (총 ${files.length * LOCALES.length}개 대상)`);
  if (fail > 0) process.exitCode = 1;
}

main();
