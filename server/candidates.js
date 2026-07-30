'use strict';
/**
 * 튜닝 후보 생성기 — "무엇을 시도해 볼 수 있는가"를 자동으로 만들어 낸다.
 *
 * <p><b>이 파일의 성격</b>: 튜닝 노하우를 코드로 옮긴 지식베이스다.
 * 사용자가 튜닝을 몰라도 되도록, 각 후보마다 <b>왜 이걸 시도하는지(rationale)</b>와
 * <b>어떤 상황에서 효과가 있는지(expectation)</b>를 함께 담는다.
 * 그리고 <b>어느 것이 정답인지는 추측하지 않는다</b> — 실제로 돌려보고 재서 결정한다.
 * 이 파일은 "가설"을 만들고, 판정은 토너먼트 실측이 한다.
 *
 * <p><b>위험도(risk) 표기</b>
 * <ul>
 *   <li>safe        — 결과 의미가 바뀌지 않는 변환(힌트 추가, 컬럼 명시, 동치 변환)</li>
 *   <li>semantic    — 결과가 달라질 수 있는 변환(UNION ALL, DISTINCT 제거 등).
 *                     그래서 반드시 결과 동일성 검증과 짝지어 제시한다.</li>
 *   <li>experimental— 옵티마이저 동작을 크게 흔드는 것(병렬, 파라미터 조정)</li>
 * </ul>
 *
 * <p>생성한 SQL 이 항상 문법적으로 유효하다고 보장하지 않는다. 유효하지 않으면
 * 토너먼트 1회전에서 실행 오류로 걸러지고, 사유가 그대로 사용자에게 표시된다.
 */

const T = require('../shared/sql-tokenizer');
const analyzer = require('./analyzer');

/** 후보 하나의 기본 골격. */
function cand(o) {
  return Object.assign({
    id: '',
    strategy: '',
    title: '',
    category: 'hint',
    risk: 'safe',
    riskNote: '',
    rationale: '',
    expectation: '',
    sql: '',
    changes: []
  }, o);
}

const RISK_LABEL = { safe: '안전', semantic: '의미변화 가능', experimental: '실험적' };

// ── 공용 도우미 ────────────────────────────────────────────────────────────

/** 토큰의 실제 참조명(별칭 우선). 힌트에 쓸 이름. */
function refOf(t) {
  const r = t.alias || t.name;
  return String(r || '').replace(/"/g, '');
}

/** 의미 있는 토큰 배열(공백·주석 제외). */
function mtok(sql) {
  return T.meaningful(T.tokenize(sql), false);
}

/** 토큰 구간의 원문을 그대로 잘라낸다. */
function slice(sql, from, to) {
  return sql.slice(from, to);
}

/** [start,end) 를 text 로 치환한 새 SQL. */
function splice(sql, start, end, text) {
  return sql.slice(0, start) + text + sql.slice(end);
}

/** 여러 치환을 뒤에서부터 적용(앞 치환이 뒤 위치를 밀지 않게). */
function spliceAll(sql, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = sql;
  for (const e of sorted) out = splice(out, e.start, e.end, e.text);
  return out;
}

/** 좌변 표현식(컬럼 참조)의 토큰 범위를 뒤로 훑어 찾는다. a.b 형태 지원. */
function lhsRange(m, idx) {
  // idx 는 연산자/키워드 위치. 그 앞의 표현식을 잡는다.
  let end = idx;
  let i = idx - 1;
  if (i < 0) return null;
  if (!(m[i].type === 'identifier' || m[i].type === 'quotedIdent')) return null;
  let start = i;
  if (i - 2 >= 0 && m[i - 1].value === '.' && (m[i - 2].type === 'identifier' || m[i - 2].type === 'quotedIdent')) {
    start = i - 2;
  }
  return { startTok: start, endTok: end - 1, start: m[start].start, end: m[end - 1].end };
}

/** 괄호 짝 맞춰 닫는 위치(토큰 인덱스)를 찾는다. openIdx 는 '(' 토큰 인덱스. */
function matchParen(m, openIdx) {
  let d = 0;
  for (let i = openIdx; i < m.length; i++) {
    if (m[i].type === 'punct' && m[i].value === '(') d++;
    else if (m[i].type === 'punct' && m[i].value === ')') {
      d--;
      if (d === 0) return i;
    }
  }
  return -1;
}

// ── 메인 ───────────────────────────────────────────────────────────────────

/**
 * 튜닝 후보를 만든다.
 *
 * @param {object} input
 * @param {string} input.sql              원본 SQL(한 문장)
 * @param {object} [input.meta]           {indexes:{TABLE:[{index_name,columns}]}, columnTypes:{}, tableStats:{}}
 * @param {string[]} [input.resultColumns] describeQuery 로 얻은 결과 컬럼명(SELECT * 펼치기에 사용)
 * @param {object} [input.plan]           원본 실행계획(있으면 계획 기반 후보를 더 만든다)
 * @param {object} [input.options]        {maxCandidates, includeExperimental}
 * @param {number|null} [input.dbMajorVersion] 접속 DB 의 메이저 버전(예: 11, 19). 모르면 null —
 *   버전 미상일 때는 12c+ 전제 후보(FETCH FIRST 등)를 그대로 만든다(회귀 방지).
 * @returns {{candidates:Array, skipped:Array, structure:object}}
 */
function generate(input) {
  const sql = stripSemi(String(input.sql || ''));
  const options = input.options || {};
  const maxCandidates = options.maxCandidates || 16;
  const includeExperimental = options.includeExperimental !== false;

  const ctx = {
    sql,
    structure: T.analyze(sql),
    m: mtok(sql),
    meta: input.meta || {},
    plan: input.plan || null,
    resultColumns: input.resultColumns || [],
    dbMajorVersion: (input.dbMajorVersion === null || input.dbMajorVersion === undefined)
      ? null
      : Number(input.dbMajorVersion),
    out: [],
    skipped: []
  };

  if (ctx.structure.type !== 'SELECT') {
    ctx.skipped.push({
      reason: `${ctx.structure.type} 문장은 반복 실행 비교가 위험해 후보 생성을 제한합니다.`,
      detail: '조회(SELECT)가 아니면 실행할 때마다 데이터가 바뀌므로 공정한 비교가 어렵습니다.'
    });
  }

  // 1) 구조 리라이트 — 대체로 효과가 크고 근거가 분명하다. 먼저 생성한다.
  rewriteDatePredicate(ctx);
  rewriteTruncPredicate(ctx);
  rewriteNvlPredicate(ctx);
  rewriteImplicitConversion(ctx);
  rewriteUpperPredicate(ctx);
  rewriteNotInToNotExists(ctx);
  rewriteInToExists(ctx);
  rewriteUnionAll(ctx);
  rewriteDropDistinct(ctx);
  rewriteExpandStar(ctx);
  rewriteRownumToFetchFirst(ctx);
  rewriteDropOrderBy(ctx);

  // 2) 힌트 — 스키마 정보 없이도 만들 수 있어 최후의 보루가 된다.
  hintAccessPath(ctx);
  hintJoinMethod(ctx);
  hintJoinOrder(ctx);
  hintOptimizerMode(ctx);
  hintSubqueryTransform(ctx);
  hintViewMerge(ctx);
  hintCteMaterialize(ctx);
  hintOrExpansion(ctx);
  if (includeExperimental) hintExperimental(ctx);

  // 중복 SQL 제거(다른 전략이 글자까지 똑같은 문장을 만들 수 있다).
  // ⚠ 여기서 T.normalize 를 쓰면 안 된다 — 그 함수는 지문 비교용이라 힌트와 리터럴을
  //   일부러 지운다. 그걸 키로 쓰면 서로 다른 힌트 후보가 전부 같은 것으로 뭉개진다.
  const seen = new Set([dedupKey(sql)]);
  const unique = [];
  for (const c of ctx.out) {
    const key = dedupKey(c.sql);
    if (seen.has(key)) {
      ctx.skipped.push({ reason: `${c.title} — 원본과 같거나 다른 후보와 중복되어 제외`, id: c.id });
      continue;
    }
    seen.add(key);
    unique.push(c);
  }

  const limited = unique.slice(0, maxCandidates);
  if (unique.length > limited.length) {
    ctx.skipped.push({
      reason: `후보 ${unique.length}개 중 상위 ${limited.length}개만 실행합니다(설정: 최대 ${maxCandidates}개).`,
      detail: '후보가 많을수록 측정 시간이 선형으로 늘어납니다. 필요하면 최대 후보 수를 늘리세요.'
    });
  }

  return { candidates: limited, skipped: ctx.skipped, structure: ctx.structure, total: unique.length };
}

function stripSemi(s) {
  let x = String(s || '').trim();
  while (x.endsWith(';')) x = x.slice(0, -1).trim();
  return x;
}

/** 중복 판정용 키 — 공백만 정규화하고 나머지는 원문 그대로 본다. */
function dedupKey(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

/**
 * DB 버전 문자열에서 메이저 버전(정수)만 뽑는다. 순수 함수.
 *
 * 지원 입력 예:
 *  - "11.2"                                                     → 11
 *  - "19.0"                                                     → 19
 *  - "Oracle Database 11g Enterprise Edition Release 11.2.0.4.0" → 11
 *  - null / undefined / 숫자를 못 찾는 문자열                    → null
 */
function parseDbMajorVersion(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const s = String(v).trim();
  if (!s) return null;
  // "11.2", "19.0.0", "Release 11.2.0.4.0" 같은 major.minor(.*) 패턴을 우선한다.
  const dotted = s.match(/(\d{1,3})(?:\.\d+){1,}/);
  if (dotted) {
    const n = Number(dotted[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // "11g", "19c" 같은 Oracle 마케팅 버전 표기(점 표기가 없는 경우)만 보조로 허용한다.
  const marketing = s.match(/\b(\d{1,3})[gc]\b/i);
  if (marketing) {
    const n = Number(marketing[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
//  구조 리라이트
// ══════════════════════════════════════════════════════════════════════════

/**
 * TO_CHAR(날짜컬럼, '형식') = '리터럴'  →  범위 조건
 *
 * 튜닝에서 가장 자주 만나고 효과도 큰 패턴이다. 컬럼을 함수로 감싸면 그 컬럼의
 * 인덱스를 쓸 수 없다. 같은 의미의 <b>범위 조건</b>으로 바꾸면 인덱스 범위 스캔이 가능해진다.
 */
function rewriteDatePredicate(ctx) {
  const { m, sql } = ctx;
  const edits = [];
  const changes = [];

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'function' && t.value.toUpperCase() === 'TO_CHAR')) continue;
    if (!(m[i + 1] && m[i + 1].value === '(')) continue;
    const close = matchParen(m, i + 1);
    if (close < 0) continue;

    // TO_CHAR( <expr> , '<fmt>' )
    let commaIdx = -1;
    for (let j = i + 2; j < close; j++) {
      if (m[j].type === 'punct' && m[j].value === ',' && m[j].depth === m[i + 1].depth + 1) { commaIdx = j; break; }
    }
    if (commaIdx < 0) continue;
    const fmtTok = m[commaIdx + 1];
    if (!fmtTok || fmtTok.type !== 'string' || commaIdx + 2 !== close) continue;

    const op = m[close + 1];
    const valTok = m[close + 2];
    if (!op || op.type !== 'operator' || op.value !== '=') continue;
    if (!valTok || valTok.type !== 'string') continue;

    const fmt = fmtTok.value.slice(1, -1).toUpperCase();
    const val = valTok.value.slice(1, -1);
    const range = dateRange(fmt, val);
    if (!range) continue;

    const colText = slice(sql, m[i + 2].start, m[commaIdx - 1].end);
    const replacement =
      `(${colText} >= TO_DATE('${range.from}','YYYYMMDD') AND ${colText} < TO_DATE('${range.to}','YYYYMMDD'))`;

    edits.push({ start: t.start, end: valTok.end, text: replacement });
    changes.push(`TO_CHAR(${colText},'${fmt}') = '${val}' → ${colText} 범위 조건`);
  }

  if (!edits.length) return;
  ctx.out.push(cand({
    id: 'RW_DATE_RANGE',
    strategy: 'DATE_FUNCTION_TO_RANGE',
    title: '날짜 함수 조건 → 범위 조건',
    category: 'rewrite',
    risk: 'safe',
    rationale:
      '컬럼을 TO_CHAR 로 감싸면 옵티마이저가 원본 값의 정렬 순서를 알 수 없어 그 컬럼의 인덱스를 쓸 수 없습니다. ' +
      '같은 의미를 부등호 범위로 표현하면 인덱스 범위 스캔이 가능해집니다.',
    expectation:
      '해당 날짜 컬럼에 인덱스가 있고 조회 구간이 전체의 일부라면 효과가 큽니다. ' +
      '인덱스가 없거나 대부분의 행을 읽는 질의라면 차이가 없을 수 있습니다.',
    sql: spliceAll(sql, edits),
    changes
  }));
}

/** 형식 문자열 + 값 → [시작, 끝) 범위(YYYYMMDD). 지원하지 않는 형식이면 null. */
function dateRange(fmt, val) {
  const digits = String(val).replace(/[^0-9]/g, '');
  const norm = String(fmt).replace(/[^A-Z]/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, mo, d) => `${y}${pad(mo)}${pad(d)}`;

  try {
    if (norm === 'YYYY' && digits.length === 4) {
      const y = Number(digits);
      return { from: ymd(y, 1, 1), to: ymd(y + 1, 1, 1) };
    }
    if (norm === 'YYYYMM' && digits.length === 6) {
      const y = Number(digits.slice(0, 4));
      const mo = Number(digits.slice(4, 6));
      const ny = mo === 12 ? y + 1 : y;
      const nm = mo === 12 ? 1 : mo + 1;
      return { from: ymd(y, mo, 1), to: ymd(ny, nm, 1) };
    }
    if (norm === 'YYYYMMDD' && digits.length === 8) {
      const y = Number(digits.slice(0, 4));
      const mo = Number(digits.slice(4, 6));
      const d = Number(digits.slice(6, 8));
      const next = new Date(Date.UTC(y, mo - 1, d + 1));
      return {
        from: ymd(y, mo, d),
        to: ymd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
      };
    }
  } catch (e) { /* 계산 실패 시 후보를 만들지 않는다 */ }
  return null;
}

/**
 * TRUNC(날짜컬럼) = X  →  컬럼 >= X AND 컬럼 < X + 1
 * 위와 같은 이유의 변환이며, 오른쪽 표현식을 그대로 재사용하므로 리터럴 해석이 필요 없다.
 */
function rewriteTruncPredicate(ctx) {
  const { m, sql } = ctx;
  const edits = [];
  const changes = [];

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'function' && t.value.toUpperCase() === 'TRUNC')) continue;
    if (!(m[i + 1] && m[i + 1].value === '(')) continue;
    const close = matchParen(m, i + 1);
    if (close < 0) continue;
    // 두 번째 인자(포맷)가 있으면 일 단위 절삭이 아닐 수 있으므로 이 건만 건너뛴다
    let hasFormatArg = false;
    for (let j = i + 2; j < close; j++) {
      if (m[j].type === 'punct' && m[j].value === ',' && m[j].depth === m[i + 1].depth + 1) { hasFormatArg = true; break; }
    }
    if (hasFormatArg) continue;
    const op = m[close + 1];
    if (!op || op.type !== 'operator' || op.value !== '=') continue;

    // 오른쪽 표현식의 끝 찾기.
    // ⚠ 토큰의 depth 로 판단하면 TRUNC(SYSDATE) 같은 함수 호출의 닫는 괄호에서 잘린다.
    //   (여는 괄호는 바깥 깊이로 기록되기 때문) 그래서 여기서는 <b>괄호 균형</b>을 직접 센다.
    let end = close + 2;
    let depth = 0;
    const stopWords = new Set(['AND', 'OR', 'GROUP', 'ORDER', 'HAVING', 'CONNECT', 'START',
      'UNION', 'MINUS', 'INTERSECT', 'FETCH', 'OFFSET']);
    while (end < m.length) {
      const x = m[end];
      if (x.type === 'punct' && x.value === '(') { depth++; end++; continue; }
      if (x.type === 'punct' && x.value === ')') {
        if (depth === 0) break;   // 우리를 감싸고 있던 괄호 → 표현식 끝
        depth--; end++; continue;
      }
      if (depth === 0) {
        if (x.type === 'keyword' && stopWords.has(x.value.toUpperCase())) break;
        if (x.type === 'punct' && (x.value === ',' || x.value === ';')) break;
      }
      end++;
    }
    if (end <= close + 2) continue;

    const colText = slice(sql, m[i + 2].start, m[close - 1].end);
    const rhsText = slice(sql, m[close + 2].start, m[end - 1].end).trim();
    const replacement = `(${colText} >= ${rhsText} AND ${colText} < ${rhsText} + 1)`;
    edits.push({ start: t.start, end: m[end - 1].end, text: replacement });
    changes.push(`TRUNC(${colText}) = ${rhsText} → 하루 범위 조건`);
  }

  if (!edits.length) return;
  ctx.out.push(cand({
    id: 'RW_TRUNC_RANGE',
    strategy: 'TRUNC_TO_RANGE',
    title: 'TRUNC(날짜) 조건 → 하루 범위 조건',
    category: 'rewrite',
    risk: 'safe',
    riskNote: '오른쪽 값이 자정(00:00:00)일 때 완전히 동치입니다. 시각이 붙어 있으면 결과가 달라질 수 있어 검증에서 확인합니다.',
    rationale:
      'TRUNC 로 컬럼을 감싸면 인덱스를 쓸 수 없습니다. "그날 0시 이상 다음날 0시 미만"으로 바꾸면 ' +
      '의미는 같으면서 인덱스 범위 스캔이 가능해집니다.',
    expectation: '날짜 컬럼에 인덱스가 있는 대량 테이블에서 효과가 큽니다.',
    sql: spliceAll(sql, edits),
    changes
  }));
}

/**
 * NVL(컬럼, X) = Y 형태 정리.
 *  - X == Y : (컬럼 = Y OR 컬럼 IS NULL)   ← 인덱스 사용 가능 경로가 생긴다
 *  - X != Y : 컬럼 = Y                      ← NULL 이면 어차피 거짓이므로 NVL 이 불필요
 */
function rewriteNvlPredicate(ctx) {
  const { m, sql } = ctx;
  const edits = [];
  const changes = [];

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'function' && t.value.toUpperCase() === 'NVL')) continue;
    if (!(m[i + 1] && m[i + 1].value === '(')) continue;
    const close = matchParen(m, i + 1);
    if (close < 0) continue;
    let commaIdx = -1;
    for (let j = i + 2; j < close; j++) {
      if (m[j].type === 'punct' && m[j].value === ',' && m[j].depth === m[i + 1].depth + 1) { commaIdx = j; break; }
    }
    if (commaIdx < 0) continue;
    const op = m[close + 1];
    const rhs = m[close + 2];
    if (!op || op.value !== '=' || !rhs) continue;
    if (!['string', 'number', 'bind'].includes(rhs.type)) continue;
    if (commaIdx + 2 !== close) continue; // NVL 의 두 번째 인자는 단일 토큰만 지원

    const colText = slice(sql, m[i + 2].start, m[commaIdx - 1].end);
    const defText = m[commaIdx + 1].value;
    const rhsText = rhs.value;
    const same = defText === rhsText;
    const replacement = same
      ? `(${colText} = ${rhsText} OR ${colText} IS NULL)`
      : `${colText} = ${rhsText}`;
    edits.push({ start: t.start, end: rhs.end, text: replacement });
    changes.push(same
      ? `NVL(${colText},${defText}) = ${rhsText} → (${colText} = ${rhsText} OR ${colText} IS NULL)`
      : `NVL(${colText},${defText}) = ${rhsText} → ${colText} = ${rhsText} (NVL 불필요)`);
  }

  if (!edits.length) return;
  ctx.out.push(cand({
    id: 'RW_NVL',
    strategy: 'NVL_DECOMPOSE',
    title: 'NVL 조건 분해 — 인덱스 사용 경로 확보',
    category: 'rewrite',
    risk: 'safe',
    rationale:
      'NVL 도 컬럼을 감싸는 함수라 인덱스를 무력화합니다. NULL 여부를 조건으로 분리하면 ' +
      '컬럼에 대한 등가 조건이 드러나 인덱스를 탈 수 있습니다.',
    expectation:
      '기본값과 비교값이 같은 경우, NULL 인 행이 적다면 큰 효과가 납니다. ' +
      '(B*Tree 인덱스는 전부 NULL 인 키를 저장하지 않으므로 IS NULL 쪽은 여전히 스캔일 수 있습니다.)',
    sql: spliceAll(sql, edits),
    changes
  }));
}

/** 문자 컬럼과 숫자 리터럴 비교 → 리터럴을 문자로 맞춰 컬럼 쪽 형변환을 없앤다. */
function rewriteImplicitConversion(ctx) {
  const types = ctx.meta.columnTypes || {};
  if (!Object.keys(types).length) return;
  const { m, sql } = ctx;
  const edits = [];
  const changes = [];

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'operator' && ['=', '<', '>', '<=', '>=', '<>', '!='].includes(t.value))) continue;
    const left = m[i - 1], right = m[i + 1];
    let colTok = null, litTok = null;
    if ((left && (left.type === 'identifier' || left.type === 'quotedIdent')) && right && right.type === 'number') {
      colTok = left; litTok = right;
    } else if ((right && (right.type === 'identifier' || right.type === 'quotedIdent')) && left && left.type === 'number') {
      colTok = right; litTok = left;
    }
    if (!colTok || !litTok) continue;
    const type = types[String(colTok.value).replace(/"/g, '').toUpperCase()];
    if (!type || !/CHAR|CLOB/.test(String(type).toUpperCase())) continue;

    edits.push({ start: litTok.start, end: litTok.end, text: `'${litTok.value}'` });
    changes.push(`${colTok.value} ${t.value} ${litTok.value} → ${colTok.value} ${t.value} '${litTok.value}' (형변환 제거)`);
  }

  if (!edits.length) return;
  ctx.out.push(cand({
    id: 'RW_IMPLICIT_CONV',
    strategy: 'FIX_IMPLICIT_CONVERSION',
    title: '암시적 형변환 제거 — 문자 컬럼에 문자 리터럴',
    category: 'rewrite',
    risk: 'safe',
    rationale:
      '문자 컬럼을 숫자와 비교하면 Oracle 은 TO_NUMBER(컬럼) 처럼 <b>컬럼 쪽</b>을 변환합니다. ' +
      '함수를 씌운 것과 같아져 인덱스를 쓰지 못하고, 변환할 수 없는 값이 섞이면 ORA-01722 로 실패하기도 합니다.',
    expectation: '해당 컬럼에 인덱스가 있으면 전체 스캔이 인덱스 스캔으로 바뀌어 효과가 큽니다.',
    sql: spliceAll(sql, edits),
    changes
  }));
}

/** UPPER(col) = '대문자리터럴' → col = '리터럴' (데이터가 이미 대문자인 경우에만 동치) */
function rewriteUpperPredicate(ctx) {
  const { m, sql } = ctx;
  const edits = [];
  const changes = [];

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'function' && ['UPPER', 'LOWER'].includes(t.value.toUpperCase()))) continue;
    if (!(m[i + 1] && m[i + 1].value === '(')) continue;
    const close = matchParen(m, i + 1);
    if (close < 0) continue;
    const op = m[close + 1], rhs = m[close + 2];
    if (!op || op.value !== '=' || !rhs || rhs.type !== 'string') continue;
    const colText = slice(sql, m[i + 2].start, m[close - 1].end);
    edits.push({ start: t.start, end: m[close].end, text: colText });
    changes.push(`${t.value.toUpperCase()}(${colText}) = ${rhs.value} → ${colText} = ${rhs.value}`);
  }

  if (!edits.length) return;
  ctx.out.push(cand({
    id: 'RW_DROP_CASE_FN',
    strategy: 'DROP_CASE_FUNCTION',
    title: '대소문자 변환 함수 제거 시도',
    category: 'rewrite',
    risk: 'semantic',
    riskNote: '데이터에 대소문자가 섞여 있으면 결과가 줄어듭니다. 결과 동일성 검증으로 반드시 확인하세요.',
    rationale:
      'UPPER/LOWER 로 컬럼을 감싸면 인덱스를 쓸 수 없습니다. 데이터가 이미 한쪽 표기로 통일되어 있다면 ' +
      '함수를 없애도 결과가 같고 인덱스를 탈 수 있습니다.',
    expectation:
      '결과가 동일하다고 검증되면 채택하세요. 다르다면 함수기반 인덱스(CREATE INDEX ... ON t (UPPER(col)))가 정공법입니다.',
    sql: spliceAll(sql, edits),
    changes
  }));
}

/** NOT IN (서브쿼리) → NOT EXISTS (상관 서브쿼리) */
function rewriteNotInToNotExists(ctx) {
  const r = convertInSubquery(ctx, true);
  if (!r) return;
  ctx.out.push(cand({
    id: 'RW_NOT_EXISTS',
    strategy: 'NOT_IN_TO_NOT_EXISTS',
    title: 'NOT IN (서브쿼리) → NOT EXISTS',
    category: 'rewrite',
    risk: 'semantic',
    riskNote:
      'NULL 처리가 달라집니다. 서브쿼리 결과에 NULL 이 있으면 NOT IN 은 0건을 내지만 NOT EXISTS 는 정상 동작합니다. ' +
      '대개 NOT EXISTS 쪽이 의도한 결과이지만, 판정은 검증 결과를 보고 하세요.',
    rationale:
      'NOT IN 은 3치 논리 때문에 옵티마이저가 안티조인으로 변환하기 어렵습니다. ' +
      'NOT EXISTS 는 해시 안티조인으로 풀리는 경우가 많아 대량 데이터에서 훨씬 빠릅니다.',
    expectation: '서브쿼리 대상이 큰 테이블일수록 차이가 큽니다.',
    sql: r.sql,
    changes: r.changes
  }));
}

/** IN (서브쿼리) → EXISTS (상관 서브쿼리) */
function rewriteInToExists(ctx) {
  const r = convertInSubquery(ctx, false);
  if (!r) return;
  ctx.out.push(cand({
    id: 'RW_EXISTS',
    strategy: 'IN_TO_EXISTS',
    title: 'IN (서브쿼리) → EXISTS',
    category: 'rewrite',
    risk: 'safe',
    rationale:
      'IN 과 EXISTS 는 같은 결과를 내지만 옵티마이저가 고르는 변환 경로가 다릅니다. ' +
      '어느 쪽이 빠른지는 데이터 분포에 따라 달라지므로 실제로 재보는 것이 정답입니다.',
    expectation:
      '바깥 결과가 적고 서브쿼리 대상이 클 때 EXISTS 가 유리한 경우가 많습니다. 반대 상황이면 IN 이 낫습니다.',
    sql: r.sql,
    changes: r.changes
  }));
}

/**
 * `<lhs> [NOT] IN ( SELECT <sel> FROM ... )` 를 `[NOT] EXISTS (...)` 로 바꾼다.
 * 서브쿼리 본문은 그대로 두고 상관 조건만 주입한다.
 */
function convertInSubquery(ctx, wantNot) {
  const { m, sql } = ctx;
  const edits = [];
  const changes = [];

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'keyword' && t.value.toUpperCase() === 'IN')) continue;
    const prev = m[i - 1];
    const isNot = !!(prev && prev.type === 'keyword' && prev.value.toUpperCase() === 'NOT');
    if (isNot !== wantNot) continue;

    const open = m[i + 1];
    if (!open || open.value !== '(') continue;
    const first = m[i + 2];
    if (!(first && first.type === 'keyword' && first.value.toUpperCase() === 'SELECT')) continue;
    const close = matchParen(m, i + 1);
    if (close < 0) continue;

    const lhs = lhsRange(m, isNot ? i - 1 : i);
    if (!lhs) continue;
    const lhsText = slice(sql, lhs.start, lhs.end);

    const subDepth = open.depth + 1;

    // 서브쿼리의 SELECT 목록(단일 컬럼만 지원)
    let selStart = i + 3;
    if (m[selStart] && m[selStart].type === 'keyword' && ['DISTINCT', 'ALL', 'UNIQUE'].includes(m[selStart].value.toUpperCase())) selStart++;
    let fromIdx = -1;
    for (let j = selStart; j < close; j++) {
      if (m[j].depth === subDepth && m[j].type === 'keyword' && m[j].value.toUpperCase() === 'FROM') { fromIdx = j; break; }
      if (m[j].depth === subDepth && m[j].type === 'punct' && m[j].value === ',') { fromIdx = -2; break; } // 다중 컬럼 → 미지원
    }
    if (fromIdx < 0) continue;
    if (m[selStart] && m[selStart].type === 'operator' && m[selStart].value === '*') continue;

    let selEnd = fromIdx - 1;
    // 별칭(AS x / x)이 붙어 있으면 상관 조건에서는 떼어낸다
    if (m[selEnd] && (m[selEnd].type === 'identifier' || m[selEnd].type === 'quotedIdent') && selEnd - 1 >= selStart) {
      const before = m[selEnd - 1];
      if (before && before.type === 'keyword' && before.value.toUpperCase() === 'AS') selEnd -= 2;
      else if (before && (before.type === 'identifier' || before.type === 'quotedIdent' || before.value === ')')) selEnd -= 1;
    }
    if (selEnd < selStart) continue;
    const selText = slice(sql, m[selStart].start, m[selEnd].end).trim();

    // 상관 조건을 넣을 위치 찾기
    const clauseStops = new Set(['GROUP', 'HAVING', 'ORDER', 'CONNECT', 'START', 'UNION', 'MINUS', 'INTERSECT', 'FETCH', 'OFFSET', 'MODEL']);
    let whereIdx = -1, stopIdx = close;
    for (let j = fromIdx + 1; j < close; j++) {
      if (m[j].depth !== subDepth || m[j].type !== 'keyword') continue;
      const up = m[j].value.toUpperCase();
      if (up === 'WHERE' && whereIdx < 0) { whereIdx = j; continue; }
      if (clauseStops.has(up)) { stopIdx = j; break; }
    }

    const corr = `(${selText}) = (${lhsText})`;
    if (whereIdx >= 0) {
      edits.push({ start: m[whereIdx].end, end: m[whereIdx].end, text: ` ${corr} AND` });
    } else {
      const at = stopIdx < close ? m[stopIdx].start : m[close].start;
      edits.push({ start: at, end: at, text: ` WHERE ${corr} ` });
    }

    // `<lhs> [NOT] IN` → `[NOT] EXISTS`
    const startTok = isNot ? m[i - 1] : m[i];
    edits.push({
      start: lhs.start,
      end: m[i].end,
      text: isNot ? 'NOT EXISTS' : 'EXISTS'
    });
    changes.push(`${lhsText} ${isNot ? 'NOT ' : ''}IN (…) → ${isNot ? 'NOT ' : ''}EXISTS (… WHERE ${corr})`);
  }

  if (!edits.length) return null;
  return { sql: spliceAll(sql, edits), changes };
}

/** UNION → UNION ALL */
function rewriteUnionAll(ctx) {
  const { m, sql } = ctx;
  const edits = [];
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'keyword' && t.value.toUpperCase() === 'UNION')) continue;
    const nx = m[i + 1];
    if (nx && nx.type === 'keyword' && nx.value.toUpperCase() === 'ALL') continue;
    edits.push({ start: t.start, end: t.end, text: 'UNION ALL' });
  }
  if (!edits.length) return;
  ctx.out.push(cand({
    id: 'RW_UNION_ALL',
    strategy: 'UNION_TO_UNION_ALL',
    title: 'UNION → UNION ALL (중복 제거 생략)',
    category: 'rewrite',
    risk: 'semantic',
    riskNote: '분기 사이에 중복 행이 있으면 결과 건수가 늘어납니다. 검증에서 행수 차이로 바로 드러납니다.',
    rationale:
      'UNION 은 합친 뒤 중복을 지우기 위해 전체를 정렬(또는 해시)합니다. 큰 결과에서는 이 비용이 지배적입니다. ' +
      '분기끼리 겹치는 행이 애초에 없다면 UNION ALL 이 같은 결과를 훨씬 싸게 냅니다.',
    expectation: '결과 행수가 그대로면 그대로 채택해도 안전합니다. 정렬 단계가 통째로 사라집니다.',
    sql: spliceAll(sql, edits),
    changes: [`UNION ${edits.length}곳 → UNION ALL`]
  }));
}

/** 최상위 DISTINCT 제거 */
function rewriteDropDistinct(ctx) {
  const { m, sql } = ctx;
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'keyword' && t.value.toUpperCase() === 'SELECT' && t.depth === 0)) continue;
    const nx = m[i + 1];
    if (!(nx && nx.type === 'keyword' && nx.value.toUpperCase() === 'DISTINCT')) return;
    ctx.out.push(cand({
      id: 'RW_DROP_DISTINCT',
      strategy: 'DROP_DISTINCT',
      title: 'DISTINCT 제거 시도',
      category: 'rewrite',
      risk: 'semantic',
      riskNote: '중복 행이 실제로 있으면 결과 건수가 늘어납니다. 검증에서 바로 확인됩니다.',
      rationale:
        'DISTINCT 는 정렬/해시 비용을 유발합니다. 조인 키가 유일해 애초에 중복이 생기지 않는데도 ' +
        '"혹시 몰라서" 붙여 둔 경우가 많습니다. 그렇다면 그냥 비용만 내는 셈입니다.',
      expectation: '결과 행수가 같으면 DISTINCT 가 불필요했다는 뜻입니다. 정렬 단계가 사라집니다.',
      sql: splice(sql, nx.start, nx.end, '').replace(/[ \t]{2,}/g, ' '),
      changes: ['최상위 DISTINCT 제거']
    }));
    return;
  }
}

/** SELECT * → 컬럼 명시 */
function rewriteExpandStar(ctx) {
  if (!ctx.structure.selectStar) return;
  if (!ctx.resultColumns || !ctx.resultColumns.length) {
    ctx.skipped.push({ reason: 'SELECT * 펼치기 — 결과 컬럼 목록을 얻지 못해 건너뜀', id: 'RW_EXPAND_STAR' });
    return;
  }
  const r = analyzer.expandStar(ctx.sql, ctx.resultColumns, { perLine: true });
  if (!r.ok) {
    ctx.skipped.push({ reason: `SELECT * 펼치기 실패: ${r.error}`, id: 'RW_EXPAND_STAR' });
    return;
  }
  ctx.out.push(cand({
    id: 'RW_EXPAND_STAR',
    strategy: 'EXPAND_SELECT_STAR',
    title: 'SELECT * → 컬럼 명시',
    category: 'rewrite',
    risk: 'safe',
    rationale:
      '필요 없는 컬럼까지 읽고 네트워크로 보냅니다. 특히 인덱스만 읽고 끝낼 수 있는 질의도 ' +
      '테이블 접근이 강제되어 커버링 인덱스의 이점을 잃습니다.',
    expectation:
      '컬럼 수가 많거나 LOB 컬럼이 섞여 있으면 인출 시간이 눈에 띄게 줄어듭니다. ' +
      '컬럼이 적으면 차이가 거의 없습니다.',
    sql: r.sql,
    changes: [`컬럼 ${r.expanded}개 명시`]
  }));
}

/** WHERE ROWNUM <= n + ORDER BY → ORDER BY ... FETCH FIRST n ROWS ONLY */
function rewriteRownumToFetchFirst(ctx) {
  const { m, sql, structure } = ctx;
  if (!structure.clauses.order) return;

  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'keyword' && t.value.toUpperCase() === 'ROWNUM' && t.depth === 0)) continue;
    const op = m[i + 1], num = m[i + 2];
    if (!op || !(op.type === 'operator' && ['<=', '<'].includes(op.value))) continue;
    if (!num || num.type !== 'number') continue;
    const n = op.value === '<' ? Number(num.value) - 1 : Number(num.value);
    if (!(n > 0)) continue;

    // 조건 제거 — 인접한 AND 까지 함께 지운다
    let start = t.start, end = num.end;
    const prev = m[i - 1], next = m[i + 3];
    if (prev && prev.type === 'keyword' && prev.value.toUpperCase() === 'AND') start = prev.start;
    else if (next && next.type === 'keyword' && next.value.toUpperCase() === 'AND') end = next.end;
    else if (prev && prev.type === 'keyword' && prev.value.toUpperCase() === 'WHERE') start = prev.start;

    const removed = splice(sql, start, end, ' ').replace(/\s+$/, '');

    // DB 메이저 버전이 11 이하로 확인된 경우에만 FETCH FIRST(12.1+ 전용, ORA-00933 위험)를 피한다.
    // 버전이 미상(null)이면 기존 동작(FETCH FIRST)을 그대로 유지한다 — 회귀 방지.
    const is11gOrOlder = typeof ctx.dbMajorVersion === 'number' && ctx.dbMajorVersion > 0 && ctx.dbMajorVersion <= 11;

    if (is11gOrOlder) {
      const inlineSql = `SELECT * FROM (\n${removed}\n) WHERE ROWNUM <= ${n}`;
      ctx.out.push(cand({
        id: 'RW_ROWNUM_INLINEVIEW',
        strategy: 'FIX_ROWNUM_TOPN_INLINEVIEW',
        title: 'ROWNUM 상위 N건 → 인라인뷰 정렬 후 ROWNUM (결과 정확성 교정)',
        category: 'rewrite',
        risk: 'semantic',
        riskNote:
          '원본과 결과가 <b>달라지는 것이 정상</b>입니다. ROWNUM 은 정렬 전에 붙으므로 원본은 ' +
          '"정렬된 상위 N건"이 아니라 "아무 N건을 뽑아 정렬한 것"이었기 때문입니다.',
        rationale:
          'ROWNUM 은 정렬보다 먼저 평가됩니다. 같은 레벨에서 ORDER BY 와 함께 쓰면 의도한 상위 N건이 나오지 않습니다. ' +
          `접속한 DB 가 ${ctx.dbMajorVersion} 버전(12c 미만)이라 FETCH FIRST 를 쓸 수 없어, 정렬을 인라인뷰로 ` +
          '감싸고 바깥에서 ROWNUM 을 거는 방식으로 같은 정확성 교정 효과를 냅니다.',
        expectation:
          '성능보다 <b>정확성</b>을 위한 후보입니다. 검증이 "결과 다름"으로 나오면 원본이 틀렸던 것이니 이 안을 채택하세요.',
        sql: inlineSql,
        changes: [`WHERE ROWNUM ${op.value} ${num.value} 제거 → 인라인뷰로 감싸고 바깥에서 WHERE ROWNUM <= ${n} 추가(11g 이하 호환)`]
      }));
      return;
    }

    const next2 = removed + `\nFETCH FIRST ${n} ROWS ONLY`;

    ctx.out.push(cand({
      id: 'RW_FETCH_FIRST',
      strategy: 'ROWNUM_TO_FETCH_FIRST',
      title: 'ROWNUM 상위 N건 → FETCH FIRST (결과 정확성 교정)',
      category: 'rewrite',
      risk: 'semantic',
      riskNote:
        '원본과 결과가 <b>달라지는 것이 정상</b>입니다. ROWNUM 은 정렬 전에 붙으므로 원본은 ' +
        '"정렬된 상위 N건"이 아니라 "아무 N건을 뽑아 정렬한 것"이었기 때문입니다.',
      rationale:
        'ROWNUM 은 정렬보다 먼저 평가됩니다. 같은 레벨에서 ORDER BY 와 함께 쓰면 의도한 상위 N건이 나오지 않습니다. ' +
        'FETCH FIRST(12c 이상)는 정렬 후 상위 N건을 정확히 집어냅니다.',
      expectation:
        '성능보다 <b>정확성</b>을 위한 후보입니다. 검증이 "결과 다름"으로 나오면 원본이 틀렸던 것이니 이 안을 채택하세요.',
      sql: next2,
      changes: [`WHERE ROWNUM ${op.value} ${num.value} 제거 → FETCH FIRST ${n} ROWS ONLY 추가`]
    }));
    return;
  }
}

/** 최상위 ORDER BY 제거 — 정렬 비용이 얼마나 되는지 측정하기 위한 후보 */
function rewriteDropOrderBy(ctx) {
  const { m, sql, structure } = ctx;
  if (!structure.clauses.order) return;
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'keyword' && t.value.toUpperCase() === 'ORDER' && t.depth === 0)) continue;
    if (!(m[i + 1] && m[i + 1].value.toUpperCase() === 'BY')) continue;
    // ORDER BY 이후를 통째로 잘라낸다(최상위이므로 뒤에 오는 건 FETCH/OFFSET 정도)
    ctx.out.push(cand({
      id: 'RW_DROP_ORDER_BY',
      strategy: 'DROP_ORDER_BY',
      title: 'ORDER BY 제거 — 정렬 비용 측정',
      category: 'rewrite',
      risk: 'semantic',
      riskNote: '행 순서가 보장되지 않습니다. 화면 정렬을 애플리케이션이 하거나 순서가 필요 없을 때만 채택하세요.',
      rationale:
        '정렬이 전체 응답시간에서 차지하는 비중을 재기 위한 후보입니다. ' +
        '정렬을 뺐을 때 크게 빨라진다면, 정렬 순서와 같은 인덱스를 만들어 정렬 자체를 없애는 방향이 정답입니다.',
      expectation:
        '이 후보가 압도적으로 빠르면 "정렬이 병목"이라는 진단이 확정됩니다. ' +
        '그때는 ORDER BY 컬럼 순서와 같은 인덱스 생성을 검토하세요.',
      sql: sql.slice(0, t.start).replace(/\s+$/, ''),
      changes: ['최상위 ORDER BY 절 제거']
    }));
    return;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  힌트 후보 — 스키마 권한이 없어도 만들 수 있다
// ══════════════════════════════════════════════════════════════════════════

function realTables(ctx) {
  return (ctx.structure.tables || []).filter((t) => !t.inline && t.name && t.name !== '(inline view)');
}

/**
 * 최상위 질의 블록의 테이블만.
 * 조인 방식·조인 순서 힌트는 <b>같은 질의 블록</b> 안에서만 의미가 있다.
 * 서브쿼리 안의 별칭을 섞어 넣으면 힌트가 통째로 무시된다(오류도 안 나서 더 위험하다).
 */
function topTables(ctx) {
  return realTables(ctx).filter((t) => t.depth === 0);
}

function pushHint(ctx, o) {
  const r = analyzer.addHint(ctx.sql, o.hint);
  if (!r.ok) {
    ctx.skipped.push({ reason: `${o.title} — 힌트 삽입 실패: ${r.error}`, id: o.id });
    return;
  }
  ctx.out.push(cand({
    ...o,
    category: 'hint',
    sql: r.sql,
    changes: [`힌트 추가: /*+ ${o.hint} */`]
  }));
}

/** 접근 경로 힌트 — 전체 스캔 강제 / 특정 인덱스 사용 */
function hintAccessPath(ctx) {
  const tables = realTables(ctx);
  if (!tables.length) return;
  const indexes = ctx.meta.indexes || {};

  // (1) 인덱스가 파악되면 인덱스별 후보를 만든다 — 가장 근거가 분명한 힌트
  let made = 0;
  for (const t of tables) {
    const list = indexes[String(t.name).replace(/"/g, '').toUpperCase()] || [];
    for (const idx of list.slice(0, 2)) {
      if (made >= 4) break;
      const name = idx.index_name || idx.INDEX_NAME;
      if (!name) continue;
      made++;
      pushHint(ctx, {
        id: `H_INDEX_${refOf(t)}_${name}`,
        strategy: 'INDEX_HINT',
        title: `INDEX(${refOf(t)} ${name}) — 이 인덱스로 접근`,
        risk: 'safe',
        hint: `INDEX(${refOf(t)} ${name})`,
        rationale:
          `${t.name} 의 인덱스 ${name}(${idx.columns || '컬럼 미확인'}) 을 강제로 쓰게 합니다. ` +
          '옵티마이저가 통계 부정확 때문에 인덱스를 외면하는 경우, 이 힌트로 실제 성능을 확인할 수 있습니다.',
        expectation:
          '조건이 이 인덱스의 선행 컬럼을 포함할 때 효과가 있습니다. ' +
          '읽는 행 비율이 크면 오히려 느려질 수 있으니 실측으로 판단하세요.'
      });
    }
  }

  // (2) 전체 스캔 강제 — "인덱스를 타는 게 오히려 손해"인 경우를 확인
  const first = tables[0];
  pushHint(ctx, {
    id: `H_FULL_${refOf(first)}`,
    strategy: 'FULL_SCAN_HINT',
    title: `FULL(${refOf(first)}) — 전체 스캔 강제`,
    risk: 'safe',
    hint: `FULL(${refOf(first)})`,
    rationale:
      '테이블의 상당 부분을 읽는 질의라면 인덱스로 한 건씩 찾아가는 것보다 통째로 읽는 편이 빠릅니다. ' +
      '인덱스 접근은 블록을 여러 번 흩어 읽지만 전체 스캔은 멀티블록으로 한 번에 읽기 때문입니다.',
    expectation:
      '읽는 비율이 대략 5~20%를 넘으면 전체 스캔이 유리해지는 구간이 옵니다. ' +
      '이 후보가 더 빠르면 "인덱스를 쓰는 게 손해"라는 뜻입니다.'
  });

  // (3) 인덱스 고속 전체 스캔 — 필요한 컬럼이 인덱스에 다 있을 때
  const withIdx = tables.find((t) => (indexes[String(t.name).replace(/"/g, '').toUpperCase()] || []).length);
  if (withIdx) {
    const list = indexes[String(withIdx.name).replace(/"/g, '').toUpperCase()];
    const name = list[0].index_name || list[0].INDEX_NAME;
    if (name) {
      pushHint(ctx, {
        id: `H_INDEX_FFS_${refOf(withIdx)}`,
        strategy: 'INDEX_FFS_HINT',
        title: `INDEX_FFS(${refOf(withIdx)} ${name}) — 인덱스 고속 전체 스캔`,
        risk: 'safe',
        hint: `INDEX_FFS(${refOf(withIdx)} ${name})`,
        rationale:
          '필요한 컬럼이 모두 인덱스 안에 있으면 테이블을 아예 안 읽고 인덱스만 멀티블록으로 훑을 수 있습니다. ' +
          '테이블보다 인덱스가 훨씬 작으므로 읽는 양이 크게 줄어듭니다.',
        expectation: 'SELECT 목록과 조건 컬럼이 모두 그 인덱스에 포함될 때만 효과가 납니다.'
      });
    }
  }
}

/** 조인 방식 힌트 */
function hintJoinMethod(ctx) {
  const tables = topTables(ctx);
  if (tables.length < 2) return;
  const refs = tables.slice(0, 3).map(refOf);
  const target = refs.slice(1).join(' ');

  pushHint(ctx, {
    id: 'H_USE_HASH',
    strategy: 'USE_HASH',
    title: `USE_HASH(${target}) — 해시 조인`,
    risk: 'safe',
    hint: `USE_HASH(${target})`,
    rationale:
      '해시 조인은 작은 쪽으로 메모리에 해시 테이블을 만든 뒤 큰 쪽을 한 번만 훑습니다. ' +
      '대량 데이터를 통째로 조인할 때 가장 유리한 방식입니다.',
    expectation: '양쪽 모두 행이 많고 조인 결과도 많을 때 효과가 큽니다. 소량 조인에는 오히려 손해입니다.'
  });

  pushHint(ctx, {
    id: 'H_USE_NL',
    strategy: 'USE_NL',
    title: `USE_NL(${target}) — 중첩 루프 조인`,
    risk: 'safe',
    hint: `USE_NL(${target})`,
    rationale:
      '중첩 루프는 바깥 행마다 안쪽을 인덱스로 찍어 봅니다. 바깥 행이 적으면 가장 빠릅니다.',
    expectation:
      '선행 조건으로 바깥 결과가 수십~수백 건으로 줄고, 안쪽 조인 컬럼에 인덱스가 있을 때 강력합니다.'
  });
}

/** 조인 순서 힌트 */
function hintJoinOrder(ctx) {
  const tables = topTables(ctx);
  if (tables.length < 2) return;
  const refs = tables.slice(0, 3).map(refOf);

  pushHint(ctx, {
    id: 'H_LEADING_FWD',
    strategy: 'LEADING',
    title: `LEADING(${refs.join(' ')}) — 이 순서로 조인`,
    risk: 'safe',
    hint: `LEADING(${refs.join(' ')})`,
    rationale:
      '조인 순서는 성능을 좌우합니다. 중간 결과를 최대한 일찍 줄이는 순서가 좋습니다. ' +
      '통계가 부정확하면 옵티마이저가 엉뚱한 순서를 고르기도 합니다.',
    expectation: '선택도가 높은(많이 걸러내는) 테이블을 먼저 두는 순서가 대개 유리합니다.'
  });

  const rev = [...refs].reverse();
  pushHint(ctx, {
    id: 'H_LEADING_REV',
    strategy: 'LEADING',
    title: `LEADING(${rev.join(' ')}) — 역순으로 조인`,
    risk: 'safe',
    hint: `LEADING(${rev.join(' ')})`,
    rationale: '반대 순서도 함께 재서 어느 쪽이 실제로 유리한지 확인합니다. 추측 대신 측정으로 정합니다.',
    expectation: '두 순서의 차이가 크다면 조인 순서가 이 질의의 핵심 변수라는 뜻입니다.'
  });
}

/** 옵티마이저 목표 힌트 */
function hintOptimizerMode(ctx) {
  pushHint(ctx, {
    id: 'H_FIRST_ROWS',
    strategy: 'FIRST_ROWS',
    title: 'FIRST_ROWS(100) — 첫 화면 응답 최적화',
    risk: 'safe',
    hint: 'FIRST_ROWS(100)',
    rationale:
      '기본값(ALL_ROWS)은 <b>전체 결과를 다 뽑는</b> 총 비용을 최소화합니다. ' +
      '화면에 앞부분만 보여 주는 조회라면 "첫 N건이 빨리 나오는" 계획이 체감상 훨씬 빠릅니다.',
    expectation:
      '페이징 조회, 목록 화면처럼 앞부분만 필요한 경우에 씁니다. ' +
      '전체를 집계하는 배치에는 오히려 나쁩니다.'
  });

  pushHint(ctx, {
    id: 'H_ALL_ROWS',
    strategy: 'ALL_ROWS',
    title: 'ALL_ROWS — 전체 처리량 최적화',
    risk: 'safe',
    hint: 'ALL_ROWS',
    rationale: '전체 결과를 모두 뽑는 총 비용을 최소화하도록 지시합니다(기본 동작을 명시).',
    expectation: '세션 파라미터가 FIRST_ROWS 로 바뀌어 있는 환경에서 되돌리는 효과가 있습니다.'
  });
}

/** 서브쿼리 변환 제어 */
function hintSubqueryTransform(ctx) {
  if (!ctx.structure.subqueryCount) return;
  pushHint(ctx, {
    id: 'H_UNNEST',
    strategy: 'UNNEST',
    title: 'UNNEST — 서브쿼리를 조인으로 풀기',
    risk: 'safe',
    hint: 'UNNEST',
    rationale:
      '서브쿼리를 조인으로 펼치면 옵티마이저가 조인 순서·방식을 함께 최적화할 수 있습니다. ' +
      '반복 실행되던 서브쿼리가 한 번의 조인으로 바뀝니다.',
    expectation: '상관 서브쿼리가 바깥 행마다 반복되고 있었다면 효과가 큽니다.'
  });
  pushHint(ctx, {
    id: 'H_NO_UNNEST',
    strategy: 'NO_UNNEST',
    title: 'NO_UNNEST — 서브쿼리를 그대로 두기',
    risk: 'safe',
    hint: 'NO_UNNEST',
    rationale:
      '반대로, 서브쿼리가 아주 적은 행만 걸러 내는 필터라면 조인으로 펼치지 않고 ' +
      '필터로 남겨 두는 편이 쌉니다.',
    expectation: '서브쿼리가 소수의 행만 반환하는 존재 확인용일 때 유리합니다.'
  });
}

/** 뷰 병합 제어 */
function hintViewMerge(ctx) {
  const hasInline = (ctx.structure.tables || []).some((t) => t.inline);
  if (!hasInline) return;
  pushHint(ctx, {
    id: 'H_PUSH_PRED',
    strategy: 'PUSH_PRED',
    title: 'PUSH_PRED — 조건을 인라인뷰 안으로 밀어넣기',
    risk: 'safe',
    hint: 'PUSH_PRED',
    rationale:
      '바깥 조건이 인라인뷰 안으로 들어가면 뷰가 만들어 내는 중간 결과 자체가 줄어듭니다. ' +
      '먼저 걸러내고 나중에 조인하는 것이 항상 유리합니다.',
    expectation: '인라인뷰가 큰 집합을 만든 뒤 바깥에서 걸러내고 있었다면 효과가 큽니다.'
  });
  pushHint(ctx, {
    id: 'H_NO_MERGE',
    strategy: 'NO_MERGE',
    title: 'NO_MERGE — 인라인뷰를 따로 처리',
    risk: 'safe',
    hint: 'NO_MERGE',
    rationale:
      '인라인뷰를 바깥과 합치지 않고 독립적으로 먼저 처리합니다. 뷰 안에서 집계로 행이 크게 줄어드는 경우 ' +
      '먼저 줄여 놓고 조인하는 편이 낫습니다.',
    expectation: '뷰 안 집계 결과가 작을 때 유리합니다.'
  });
}

/** WITH 절(CTE) 처리 방식 */
function hintCteMaterialize(ctx) {
  if (!ctx.structure.ctes || !ctx.structure.ctes.length) return;
  pushHint(ctx, {
    id: 'H_MATERIALIZE',
    strategy: 'MATERIALIZE',
    title: 'MATERIALIZE — WITH 절 결과를 임시 테이블로 고정',
    risk: 'safe',
    hint: 'MATERIALIZE',
    rationale:
      'WITH 절을 여러 번 참조하면 그때마다 다시 계산될 수 있습니다. 한 번 계산해 임시 테이블에 담아 두면 ' +
      '반복 계산이 사라집니다.',
    expectation: 'WITH 결과를 2회 이상 참조하고, 그 계산이 비쌀 때 효과가 큽니다.'
  });
  pushHint(ctx, {
    id: 'H_INLINE_CTE',
    strategy: 'INLINE',
    title: 'INLINE — WITH 절을 본문에 펼치기',
    risk: 'safe',
    hint: 'INLINE',
    rationale:
      '반대로 WITH 결과가 작고 조건이 밀려 들어갈 수 있다면, 펼쳐서 함께 최적화하는 편이 낫습니다. ' +
      '임시 테이블을 만드는 쓰기 비용도 없어집니다.',
    expectation: 'WITH 를 한 번만 참조하는 경우 대개 유리합니다.'
  });
}

/** OR 조건 확장 */
function hintOrExpansion(ctx) {
  const hasOr = ctx.m.some((t) => t.type === 'keyword' && t.value.toUpperCase() === 'OR');
  if (!hasOr) return;
  pushHint(ctx, {
    id: 'H_USE_CONCAT',
    strategy: 'USE_CONCAT',
    title: 'USE_CONCAT — OR 조건을 분기로 나눠 각각 인덱스 사용',
    risk: 'safe',
    hint: 'USE_CONCAT',
    rationale:
      'OR 로 묶인 조건은 하나의 인덱스로 한 번에 훑기 어렵습니다. 각 분기를 따로 인덱스로 처리한 뒤 ' +
      '결과를 합치면(UNION ALL 과 유사) 각각 인덱스를 탈 수 있습니다.',
    expectation: '서로 다른 컬럼에 대한 OR 조건이고 각 컬럼에 인덱스가 있을 때 효과가 큽니다.'
  });
}

/** 실험적 후보 — 효과가 클 수 있지만 부작용도 크다 */
function hintExperimental(ctx) {
  pushHint(ctx, {
    id: 'H_PARALLEL',
    strategy: 'PARALLEL',
    title: 'PARALLEL(4) — 4 병렬 처리',
    risk: 'experimental',
    riskNote:
      '단일 질의는 빨라지지만 CPU·I/O 를 여러 배로 씁니다. 동시 사용자가 많은 OLTP 환경에서는 ' +
      '다른 세션까지 느려질 수 있습니다. 배치성 작업에만 쓰세요.',
    hint: 'PARALLEL(4)',
    rationale: '대량 스캔·집계를 여러 프로세스가 나눠 처리합니다. 읽을 양 자체는 줄지 않고 나눠서 동시에 처리합니다.',
    expectation: '대용량 전체 스캔·집계 배치에서 벽시계 시간이 크게 줄어듭니다. 소량 조회에는 오히려 오버헤드입니다.'
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  순위 매기기
// ══════════════════════════════════════════════════════════════════════════

const LOGICAL_READ_KEYS = ['session logical reads', 'consistent gets'];

/**
 * 토너먼트 실측 결과에 순위를 매기고 권고문을 만든다.
 *
 * <p><b>판정 원칙</b>
 * <ol>
 *   <li>결과가 다르면(DIFFERENT) 아무리 빨라도 <b>순위에서 제외</b>한다. 따로 모아 사유와 함께 보여준다.</li>
 *   <li>1차 기준은 <b>논리적 읽기(부하)</b>다. 시간은 장비 상태에 흔들리지만 읽은 블록 수는 거의 결정적이다.
 *       세션 통계를 볼 수 없는 환경이면 시간만으로 판정하되 그 사실을 밝힌다.</li>
 *   <li>측정 편차가 큰 후보는 감점하고 "편차 큼"으로 표시한다. 우연히 한 번 빨랐던 것을 1등으로 올리지 않는다.</li>
 * </ol>
 *
 * @param {object} tournament Java 토너먼트 결과
 * @param {Array} candidates  생성 시의 후보 메타(설명·위험도)
 * @param {object} [plans]    {후보ID: explain 결과}
 */
function rank(tournament, candidates, plans) {
  const metaById = new Map(candidates.map((c) => [c.id, c]));
  const planById = plans || {};
  const base = tournament.baseline || {};
  const baseAgg = base.aggregate || {};
  const baseMedian = median(baseAgg, 'totalMs');
  const baseLr = medianStat(baseAgg, LOGICAL_READ_KEYS);
  const basePlanCost = costOf(planById.__baseline);

  const ranked = [];
  const rejected = [];
  const failed = [];

  for (const r of (tournament.candidates || [])) {
    const meta = metaById.get(r.id) || {};
    const row = {
      id: r.id,
      title: meta.title || r.id,
      strategy: meta.strategy || '',
      category: meta.category || '',
      risk: meta.risk || 'safe',
      riskLabel: RISK_LABEL[meta.risk || 'safe'],
      riskNote: meta.riskNote || '',
      rationale: meta.rationale || '',
      expectation: meta.expectation || '',
      changes: meta.changes || [],
      sql: r.sql || meta.sql || '',
      rowCount: r.rowCount,
      runs: r.runs || []
    };

    if (!r.ok) {
      row.error = r.error;
      row.ora = r.ora;
      row.reason = '실행 오류로 비교에서 제외되었습니다.';
      failed.push(row);
      continue;
    }

    const agg = r.aggregate || {};
    const delta = r.delta || {};
    const v = r.verification || {};

    row.verdict = v.verdict || 'SKIPPED';
    row.verdictLabel = v.verdictLabel || '';
    row.medianMs = median(agg, 'totalMs');
    row.execMedianMs = median(agg, 'executeMs');
    row.timeImprovePct = delta.improvementPct !== undefined ? delta.improvementPct : null;
    row.speedup = delta.speedup !== undefined ? delta.speedup : null;

    const lr = medianStat(agg, LOGICAL_READ_KEYS);
    row.logicalReads = lr;
    row.logicalReadImprovePct = (baseLr !== null && lr !== null && baseLr > 0)
      ? round1((baseLr - lr) / baseLr * 100) : null;

    const pr = medianStat(agg, ['physical reads']);
    row.physicalReads = pr;

    row.planCost = costOf(planById[r.id]);
    row.planCostImprovePct = (basePlanCost && row.planCost !== null && basePlanCost > 0)
      ? round1((basePlanCost - row.planCost) / basePlanCost * 100) : null;

    // 안정성 — 회차 간 편차
    const t = agg.totalMs || {};
    row.spreadPct = (t.median > 0 && t.max !== undefined && t.min !== undefined)
      ? round1((t.max - t.min) / t.median * 100) : null;
    row.unstable = row.spreadPct !== null && row.spreadPct > 60;

    if (row.verdict === 'DIFFERENT') {
      row.reason = '원본과 결과가 다릅니다. 성능과 무관하게 그대로 적용할 수 없습니다.';
      row.diff = v.diff || null;
      rejected.push(row);
      continue;
    }

    // 종합 개선율 — 해석 가능한 % 를 그대로 쓴다(가공된 0~100 점수보다 정직하다)
    const hasLr = row.logicalReadImprovePct !== null;
    let score = hasLr
      ? (0.6 * row.logicalReadImprovePct + 0.4 * (row.timeImprovePct || 0))
      : (row.timeImprovePct || 0);
    row.scoreBasis = hasLr ? '논리읽기 60% + 응답시간 40%' : '응답시간 100% (세션 통계 없음)';

    if (row.verdict === 'SAME_SET') score -= 5;      // 순서가 달라진 위험
    if (row.unstable) score -= 5;                     // 측정 편차가 큼
    if (row.risk === 'experimental') score -= 3;      // 부작용 감안

    row.score = round1(score);
    row.grade = gradeOf(row.score, row.verdict, row.risk);
    ranked.push(row);
  }

  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => { r.rank = i + 1; });

  return {
    baseline: {
      medianMs: baseMedian,
      logicalReads: baseLr,
      planCost: basePlanCost,
      rowCount: base.rowCount,
      runs: base.runs || []
    },
    ranked,
    rejected,
    failed,
    statsAvailable: baseLr !== null,
    recommendation: recommend(ranked, rejected, failed, baseMedian, baseLr)
  };
}

function gradeOf(score, verdict, risk) {
  if (score >= 30 && verdict === 'IDENTICAL' && risk === 'safe') return 'strong';
  if (score >= 30) return 'good';
  if (score >= 10) return 'moderate';
  if (score > -5) return 'marginal';
  return 'worse';
}

const GRADE_LABEL = {
  strong: '강력 권고',
  good: '권고',
  moderate: '검토 권고',
  marginal: '차이 미미',
  worse: '역효과'
};

/** 사용자가 읽을 최종 권고문. 튜닝을 몰라도 판단할 수 있게 쓴다. */
function recommend(ranked, rejected, failed, baseMedian, baseLr) {
  if (!ranked.length) {
    return {
      grade: 'none',
      gradeLabel: '채택 가능한 후보 없음',
      headline: '원본을 유지하세요.',
      body: rejected.length
        ? `실행에 성공한 후보는 있었지만 ${rejected.length}건 모두 원본과 결과가 달라 채택할 수 없습니다. ` +
          '결과가 달라지는 변환은 업무 의미를 확인한 뒤에만 쓸 수 있습니다.'
        : '유효한 후보를 만들지 못했습니다. 인덱스 추가나 데이터 모델 변경처럼 SQL 밖의 조치가 필요할 수 있습니다.',
      cautions: []
    };
  }

  const top = ranked[0];
  const cautions = [];

  if (top.verdict === 'SAME_SET') {
    cautions.push('결과 행 집합은 같지만 <b>순서가 다릅니다</b>. 호출하는 쪽이 순서에 의존한다면 ORDER BY 를 명시하세요.');
  }
  if (top.verdict === 'INCONCLUSIVE') {
    cautions.push('결과 동일성을 확인하지 못했습니다. 적용 전에 별도로 결과를 대조하세요.');
  }
  if (top.risk === 'semantic') {
    cautions.push(`이 변환은 의미가 달라질 수 있는 종류입니다. ${top.riskNote || ''}`);
  }
  if (top.risk === 'experimental') {
    cautions.push(`실험적 후보입니다. ${top.riskNote || ''}`);
  }
  if (top.unstable) {
    cautions.push(`회차 간 측정 편차가 ${top.spreadPct}% 로 큽니다. 반복 횟수를 늘려 다시 재보는 것을 권합니다.`);
  }
  if (baseLr === null) {
    cautions.push('세션 통계(V$MYSTAT) 를 볼 수 없어 <b>시간만으로</b> 판정했습니다. 장비 부하에 따라 흔들릴 수 있으니 반복 횟수를 늘려 확인하세요.');
  }
  if (failed.length) {
    cautions.push(`후보 ${failed.length}건은 실행 오류로 비교하지 못했습니다(목록 아래에 사유가 있습니다).`);
  }

  const parts = [];
  if (top.logicalReadImprovePct !== null) {
    parts.push(`논리적 읽기 ${fmtPct(top.logicalReadImprovePct)}`);
  }
  if (top.timeImprovePct !== null) {
    parts.push(`응답시간 ${fmtPct(top.timeImprovePct)}`);
  }
  if (top.planCostImprovePct !== null) {
    parts.push(`옵티마이저 비용 ${fmtPct(top.planCostImprovePct)}`);
  }

  let headline;
  if (top.grade === 'worse') {
    headline = '원본이 가장 낫습니다. 후보 중 개선된 것이 없습니다.';
  } else if (top.grade === 'marginal') {
    headline = `차이가 크지 않습니다(${fmtPct(top.score)}). 원본 유지를 권합니다.`;
  } else {
    headline = `1순위: ${top.title} — ${parts.join(', ')} 개선`;
  }

  const body = top.grade === 'worse' || top.grade === 'marginal'
    ? 'SQL 문장을 바꾸는 것만으로는 한계가 있어 보입니다. 인덱스 추가, 통계 재수집, 데이터 모델 조정처럼 ' +
      '문장 밖의 조치를 검토하세요. [진단] 탭의 지적사항이 그 실마리입니다.'
    : `${top.rationale}\n\n적용 근거: ${top.verdict === 'IDENTICAL'
        ? '원본과 결과가 완전히 같은 것을 확인했습니다.'
        : top.verdictLabel}. ` +
      `측정은 워밍업을 제외하고 원본과 번갈아 실행한 중앙값입니다.`;

  return {
    grade: top.grade,
    gradeLabel: GRADE_LABEL[top.grade],
    topId: top.id,
    headline,
    body,
    cautions,
    runnerUps: ranked.slice(1, 3).map((r) => ({ id: r.id, title: r.title, score: r.score }))
  };
}

// ── 계산 도우미 ────────────────────────────────────────────────────────────

function median(agg, key) {
  const m = (agg || {})[key];
  return m && typeof m.median === 'number' ? m.median : null;
}

function medianStat(agg, keys) {
  const sm = (agg || {}).statsMedian || {};
  for (const k of keys) {
    if (typeof sm[k] === 'number') return sm[k];
  }
  return null;
}

function costOf(plan) {
  if (!plan || !plan.available || !plan.summary) return null;
  const c = plan.summary.totalCost;
  return typeof c === 'number' && c > 0 ? c : null;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  return `${n >= 0 ? '' : '+'}${Math.abs(n).toFixed(1)}%${n >= 0 ? ' 감소' : ' 증가'}`;
}

module.exports = { generate, rank, RISK_LABEL, GRADE_LABEL, parseDbMajorVersion };
