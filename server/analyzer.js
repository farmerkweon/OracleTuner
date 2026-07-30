'use strict';
/**
 * SQL 튜닝 규칙 엔진.
 *
 * <p>세 갈래 입력을 쓰되, <b>없는 입력은 그냥 건너뛴다</b>(권한 제한 환경 대응).
 * <ol>
 *   <li><b>정적 분석</b> — SQL 문장만으로 판정. 항상 동작한다.</li>
 *   <li><b>실행계획</b> — EXPLAIN PLAN 이 되면 계획 기반 규칙이 추가된다.</li>
 *   <li><b>딕셔너리</b> — 컬럼 타입/통계/인덱스를 볼 수 있으면 정밀도가 올라간다
 *       (예: 암시적 형변환은 컬럼 타입을 알아야 확정할 수 있다).</li>
 * </ol>
 *
 * <p>각 지적(finding)은 <b>왜 문제인지</b>와 <b>어떻게 고치는지</b>를 함께 담는다.
 * 근거 없는 지적은 넣지 않는다 — 확정할 수 없으면 severity 를 낮추고 "확인 필요"로 표현한다.
 */

const T = require('../shared/sql-tokenizer');

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

/** 컬럼에 씌우면 인덱스를 못 타게 되는 대표 함수들. */
const NON_SARGABLE_FUNCS = new Set([
  'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'UPPER', 'LOWER', 'SUBSTR', 'SUBSTRB', 'TRIM', 'LTRIM', 'RTRIM',
  'NVL', 'NVL2', 'DECODE', 'TRUNC', 'ROUND', 'CEIL', 'FLOOR', 'ABS', 'INSTR', 'REPLACE', 'LPAD', 'RPAD',
  'CONCAT', 'LENGTH', 'LENGTHB', 'COALESCE', 'CAST', 'REGEXP_REPLACE', 'REGEXP_SUBSTR', 'INITCAP'
]);

/** 비교 연산자 */
const CMP_OPS = new Set(['=', '<', '>', '<=', '>=', '<>', '!=', '^=']);

/** 절 경계 키워드(최상위) */
const CLAUSE_ENDERS = new Set(['GROUP', 'ORDER', 'HAVING', 'CONNECT', 'START', 'UNION', 'MINUS', 'INTERSECT',
  'FETCH', 'OFFSET', 'FOR', 'MODEL', 'WITH']);

function finding(id, severity, category, title, detail, suggestion, extra) {
  return Object.assign({
    id, severity, category, title, detail, suggestion,
    line: null, snippet: null, autoFixable: false
  }, extra || {});
}

/**
 * 본 분석 진입점.
 * @param {object} input
 * @param {string} input.sql            분석할 SQL 한 문장
 * @param {object} [input.plan]         Plan.explain 결과 (rows/summary)
 * @param {object} [input.columnTypes]  {컬럼명대문자: 'NUMBER'|'VARCHAR2'|'DATE'|...}
 * @param {object} [input.tableStats]   {테이블명대문자: {num_rows, last_analyzed}}
 * @param {object} [input.indexes]      {테이블명대문자: [{index_name, columns}]}
 * @returns {{findings:Array, structure:object, score:number, summary:object}}
 */
function analyze(input) {
  const sql = String(input.sql || '');
  const structure = T.analyze(sql);
  const tokens = T.tokenize(sql);
  const m = T.meaningful(tokens, false);
  const ctx = {
    sql,
    tokens,
    m,
    structure,
    plan: input.plan || null,
    columnTypes: normalizeMap(input.columnTypes),
    tableStats: input.tableStats || {},
    indexes: input.indexes || {},
    findings: []
  };

  if (structure.unterminated) {
    ctx.findings.push(finding('SYNTAX_UNTERMINATED', 'high', 'syntax',
      '닫히지 않은 문자열 또는 주석이 있습니다',
      '따옴표나 블록주석(/* */)이 닫히지 않았습니다. 이 상태로는 실행/계획 조회가 실패합니다.',
      '따옴표와 주석의 짝을 맞추세요. 문자열 안의 작은따옴표는 두 번(\'\') 써서 이스케이프합니다.'));
  }

  staticRules(ctx);
  planRules(ctx);
  metaRules(ctx);

  ctx.findings.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    || String(a.id).localeCompare(String(b.id)));

  return {
    findings: ctx.findings,
    structure: publicStructure(structure),
    summary: summarize(ctx.findings),
    score: score(ctx.findings)
  };
}

function normalizeMap(o) {
  const out = {};
  if (!o) return out;
  for (const k of Object.keys(o)) out[String(k).toUpperCase()] = o[k];
  return out;
}

function publicStructure(s) {
  return {
    type: s.type,
    tables: s.tables,
    ctes: s.ctes,
    binds: s.binds,
    substitutions: s.substitutions,
    hints: s.hints.map((h) => h.text),
    subqueryCount: s.subqueryCount,
    maxDepth: s.maxDepth,
    flags: s.flags,
    commentCount: s.comments.length,
    selectStar: s.selectStar
  };
}

function summarize(findings) {
  const s = { high: 0, medium: 0, low: 0, info: 0, total: findings.length };
  for (const f of findings) s[f.severity] = (s[f.severity] || 0) + 1;
  return s;
}

/** 100점 만점 점수 — 절대적 지표가 아니라 "지적 밀도"의 대략적 요약이다. */
function score(findings) {
  let penalty = 0;
  for (const f of findings) {
    if (f.severity === 'high') penalty += 18;
    else if (f.severity === 'medium') penalty += 8;
    else if (f.severity === 'low') penalty += 3;
  }
  return Math.max(0, 100 - penalty);
}

// ── 토큰 탐색 헬퍼 ──────────────────────────────────────────────────────────

function lineOf(ctx, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < ctx.sql.length; i++) if (ctx.sql.charCodeAt(i) === 10) line++;
  return line;
}

function snippet(ctx, start, end) {
  const from = Math.max(0, start - 20);
  const to = Math.min(ctx.sql.length, (end || start) + 40);
  return (from > 0 ? '…' : '') + ctx.sql.slice(from, to).replace(/\s+/g, ' ').trim() + (to < ctx.sql.length ? '…' : '');
}

function at(ctx, tok, f) {
  if (!tok) return f;
  f.line = tok.line;
  f.offset = tok.start;
  f.snippet = snippet(ctx, tok.start, tok.end);
  return f;
}

/** 최상위 WHERE 절 토큰 구간 [start,end) 를 찾는다. 없으면 null. */
function whereRange(m) {
  let start = -1;
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (t.type === 'keyword' && t.value.toUpperCase() === 'WHERE' && t.depth === 0) { start = i + 1; break; }
  }
  if (start < 0) return null;
  for (let i = start; i < m.length; i++) {
    const t = m[i];
    if (t.depth === 0 && t.type === 'keyword' && CLAUSE_ENDERS.has(t.value.toUpperCase())) {
      return { start, end: i };
    }
  }
  return { start, end: m.length };
}

/** 어느 깊이든 WHERE/ON 이후 조건식으로 볼 수 있는 토큰 구간들. */
function conditionRanges(m) {
  const ranges = [];
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (t.type !== 'keyword') continue;
    const up = t.value.toUpperCase();
    if (up !== 'WHERE' && up !== 'ON' && up !== 'HAVING') continue;
    const depth = t.depth;
    let end = m.length;
    for (let j = i + 1; j < m.length; j++) {
      const x = m[j];
      if (x.depth < depth) { end = j; break; }
      if (x.depth === depth && x.type === 'keyword') {
        const u = x.value.toUpperCase();
        if (CLAUSE_ENDERS.has(u) || u === 'WHERE') { end = j; break; }
      }
    }
    ranges.push({ start: i + 1, end });
  }
  return ranges;
}

function isColumnRef(tok) {
  return tok && (tok.type === 'identifier' || tok.type === 'quotedIdent');
}

// ── 1) 정적 규칙 ────────────────────────────────────────────────────────────

function staticRules(ctx) {
  const { m, structure, findings } = ctx;
  const f = structure.flags || {};

  // SELECT *
  if (structure.selectStar) {
    findings.push(finding('SELECT_STAR', 'medium', 'io',
      'SELECT * 사용',
      '필요 없는 컬럼까지 읽고 전송합니다. 인덱스만 읽고 끝낼 수 있는 질의(커버링 인덱스)도 테이블 접근이 강제됩니다. ' +
      '또한 테이블 구조가 바뀌면 애플리케이션이 조용히 깨집니다.',
      '실제로 쓰는 컬럼만 나열하세요. [SELECT * 펼치기] 버튼으로 컬럼 목록을 자동 생성할 수 있습니다.',
      { autoFixable: true, fixAction: 'expandStar' }));
  }

  // 바인드 변수 없이 리터럴만 쓰는 경우
  const literals = ctx.tokens.filter((t) => t.type === 'string' || t.type === 'qstring' || t.type === 'number');
  if (structure.binds.length === 0 && literals.length >= 3 && structure.type !== 'DDL') {
    findings.push(at(ctx, literals[0], finding('NO_BIND_VARIABLES', 'medium', 'parse',
      `바인드 변수 없이 리터럴 ${literals.length}개 사용`,
      '값만 바뀌는 같은 형태의 SQL 이 매번 다른 문장으로 취급되어 하드파싱이 반복됩니다. ' +
      '라이브러리 캐시 경합(latch)과 CPU 사용이 늘고, 커서 공유가 되지 않습니다.',
      '값을 :bind 로 바꾸세요. 반대로 데이터 편중이 심한 컬럼은 리터럴이 유리할 수 있으니 판단이 필요합니다.')));
  }

  // 선행 와일드카드 LIKE
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (t.type !== 'keyword' || t.value.toUpperCase() !== 'LIKE') continue;
    const nx = m[i + 1];
    if (!nx) continue;
    // '%' || :b 형태(문자열 연결로 만든 선행 와일드카드)도 잡는다
    const leadingConcat = nx.type === 'string' && nx.value === "'%'" && m[i + 2] && m[i + 2].value === '||';
    if ((nx.type === 'string' && /^'%/.test(nx.value)) || leadingConcat) {
      findings.push(at(ctx, t, finding('LEADING_WILDCARD_LIKE', 'high', 'index',
        "LIKE '%...' — 선행 와일드카드",
        '패턴이 %로 시작하면 B*Tree 인덱스의 정렬 순서를 이용할 수 없어 전체 스캔이 됩니다. ' +
        '데이터가 커질수록 선형으로 느려집니다.',
        "가능하면 접두 검색(LIKE '값%')으로 바꾸세요. 본문 검색이 꼭 필요하면 Oracle Text 인덱스(CONTAINS) 또는 " +
        '역순 컬럼/검색어 테이블 등 별도 설계를 검토하세요.')));
    } else if (nx.type === 'bind') {
      findings.push(at(ctx, t, finding('LIKE_BIND_UNKNOWN', 'low', 'index',
        'LIKE 에 바인드 변수 사용 — 선행 와일드카드 여부 확인 필요',
        "바인드 값이 '%'로 시작하면 인덱스를 타지 못합니다. 실행 시점 값에 따라 성능이 크게 달라집니다.",
        '애플리케이션에서 앞쪽 % 를 붙이지 않도록 하거나, 붙는 경우를 별도 경로로 처리하세요.')));
    }
  }

  // 조건절 안의 컬럼 함수 적용 / 암시적 형변환
  for (const r of conditionRanges(m)) {
    scanCondition(ctx, r);
  }

  // NOT IN (서브쿼리)
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (t.type !== 'keyword' || t.value.toUpperCase() !== 'IN') continue;
    const prev = m[i - 1];
    const isNot = prev && prev.type === 'keyword' && prev.value.toUpperCase() === 'NOT';
    const nx = m[i + 1], nx2 = m[i + 2];
    const isSubquery = nx && nx.value === '(' && nx2 && nx2.type === 'keyword' &&
      ['SELECT', 'WITH'].includes(nx2.value.toUpperCase());
    if (isNot && isSubquery) {
      findings.push(at(ctx, t, finding('NOT_IN_SUBQUERY', 'high', 'semantics',
        'NOT IN (서브쿼리) 사용',
        '서브쿼리 결과에 NULL 이 하나라도 있으면 전체 결과가 0건이 됩니다(3치 논리). ' +
        '성능 면에서도 안티조인 최적화가 NOT EXISTS 보다 제한적입니다.',
        'NOT EXISTS 로 바꾸세요. 유지해야 한다면 서브쿼리에 IS NOT NULL 조건을 넣거나 대상 컬럼에 NOT NULL 제약이 있는지 확인하세요.')));
    } else if (isNot) {
      findings.push(at(ctx, t, finding('NOT_IN_LIST', 'low', 'index',
        'NOT IN 목록 조건',
        '부정 조건은 인덱스 범위 스캔으로 좁히기 어려워 대체로 전체 스캔이 됩니다.',
        '가능하면 긍정 조건(IN)으로 표현하거나, 제외 대상이 소수라면 필터 위치를 조정하세요.')));
    }
  }

  // UNION vs UNION ALL
  if (f.union) {
    findings.push(finding('UNION_DEDUP', 'medium', 'sort',
      'UNION 사용 — 중복 제거 정렬 비용',
      'UNION 은 결과를 합친 뒤 중복 제거를 위해 정렬(또는 해시)합니다. 큰 결과에서는 이 비용이 지배적일 수 있습니다.',
      '중복이 없거나 상관없다면 UNION ALL 로 바꾸세요. 중복 제거가 꼭 필요하면 각 분기에서 미리 줄이는 편이 낫습니다.'));
  }

  // DISTINCT
  if (f.distinct) {
    findings.push(finding('DISTINCT_USED', 'low', 'sort',
      'DISTINCT 사용',
      'DISTINCT 는 정렬/해시 비용을 유발합니다. 조인 때문에 행이 불어난 것을 뒤늦게 지우는 용도로 쓰이면 특히 비쌉니다.',
      '조인 조건이 빠져 행이 부풀지 않았는지 먼저 확인하세요. 존재 여부만 필요하면 EXISTS 로 바꾸는 편이 낫습니다.'));
  }

  // Oracle 전용 아우터 조인 (+)
  if (f.oracleOuterJoin) {
    findings.push(finding('LEGACY_OUTER_JOIN', 'info', 'style',
      'Oracle 전용 아우터 조인 (+) 사용',
      '(+) 표기는 제약이 많습니다(전체 아우터 조인 불가, OR/IN 과 함께 쓰기 어려움). 옵티마이저 변환도 ANSI 표기 쪽이 유리한 경우가 있습니다.',
      'LEFT/RIGHT OUTER JOIN ... ON 표기로 바꾸는 것을 권합니다.'));
  }

  // ROWNUM + ORDER BY 동일 레벨 — 결과가 틀린다
  const rownumTok = m.find((t) => t.type === 'keyword' && t.value.toUpperCase() === 'ROWNUM');
  if (rownumTok && (structure.clauses.order) && rownumTok.depth === 0) {
    findings.push(at(ctx, rownumTok, finding('ROWNUM_WITH_ORDER_BY', 'high', 'semantics',
      'ROWNUM 과 ORDER BY 를 같은 레벨에서 사용',
      'ROWNUM 은 정렬 <b>전에</b> 부여됩니다. 같은 레벨에서 쓰면 "정렬된 상위 N건"이 아니라 "아무 N건을 뽑아 정렬한 것"이 됩니다. ' +
      '성능이 아니라 결과가 틀리는 문제입니다.',
      '정렬을 인라인뷰로 감싸고 바깥에서 ROWNUM 을 거세요. 12c 이상이면 OFFSET/FETCH FIRST 구문이 더 명확합니다.')));
  }

  // WHERE 없는 UPDATE/DELETE
  if ((structure.type === 'UPDATE' || structure.type === 'DELETE') && !structure.clauses.where) {
    findings.push(finding('DML_NO_WHERE', 'high', 'safety',
      `WHERE 절 없는 ${structure.type}`,
      '테이블 전체가 대상이 됩니다. 실수라면 되돌리기 어렵습니다.',
      '조건을 반드시 확인하세요. 이 도구는 기본적으로 DML 실행 후 자동 롤백(안전모드)하지만, 운영 접속에서는 특히 조심하세요.'));
  }

  // 조인 조건 없는 다중 테이블 (카티션 위험)
  const topTables = structure.tables.filter((t) => t.depth === 0);
  if (topTables.length >= 2 && !f.ansiJoin) {
    const wr = whereRange(m);
    const eqCount = wr ? countJoinEqualities(m, wr) : 0;
    if (eqCount < topTables.length - 1) {
      findings.push(finding('POSSIBLE_CARTESIAN', 'high', 'join',
        `테이블 ${topTables.length}개에 조인 조건이 부족합니다`,
        `조인 조건이 최소 ${topTables.length - 1}개 필요한데 ${eqCount}개만 확인됩니다. ` +
        '카티션 곱이 발생하면 행수가 곱셈으로 늘어 응답이 사실상 돌아오지 않습니다.',
        '누락된 조인 조건을 추가하세요. 의도한 교차 조인이라면 CROSS JOIN 으로 명시해 의도를 남기세요.'));
    }
  }

  // SELECT 목록의 스칼라 서브쿼리
  scalarSubqueryInSelect(ctx);

  // 서브쿼리 중첩 깊이
  if (structure.maxDepth >= 4) {
    findings.push(finding('DEEP_NESTING', 'low', 'readability',
      `괄호 중첩 깊이 ${structure.maxDepth}`,
      '중첩이 깊으면 사람이 읽기 어렵고, 옵티마이저의 뷰 병합(view merging)도 예측하기 어려워집니다.',
      'WITH 절(CTE)로 단계를 나눠 이름을 붙이면 가독성과 재사용성이 함께 올라갑니다.'));
  }

  // HAVING 에 집계가 아닌 조건
  havingNonAggregate(ctx);

  // 힌트 점검
  for (const h of structure.hints) {
    const up = h.text.toUpperCase();
    if (up.includes('RULE')) {
      findings.push(finding('RULE_HINT', 'medium', 'hint',
        'RULE 힌트 사용',
        '규칙 기반 옵티마이저(RBO)는 Oracle 10g 이후 지원되지 않습니다. 예상과 다른 계획이 나올 수 있습니다.',
        '힌트를 제거하고 통계를 최신화한 뒤 비용 기반 옵티마이저(CBO)의 판단을 확인하세요.'));
    }
    if (/\/\*\+\s*\*\//.test(h.text)) {
      findings.push(finding('EMPTY_HINT', 'low', 'hint', '빈 힌트 블록',
        '내용이 없는 힌트 주석입니다.', '불필요하면 제거하세요.'));
    }
    if (up.includes('PARALLEL')) {
      findings.push(finding('PARALLEL_HINT', 'info', 'hint',
        'PARALLEL 힌트 사용',
        '병렬 처리는 단일 질의를 빠르게 하지만 시스템 전체 자원을 크게 소모합니다. OLTP 환경에서는 다른 세션에 영향을 줍니다.',
        '배치성 작업인지 확인하고, 동시 실행 건수를 고려해 병렬도를 정하세요.'));
    }
  }

  // WITH 절 없이 같은 서브쿼리 반복
  duplicateSubqueries(ctx);

  // 주석이 전혀 없는 긴 SQL
  if (ctx.sql.length > 800 && structure.comments.length === 0) {
    findings.push(finding('NO_COMMENTS', 'info', 'readability',
      '긴 SQL 에 주석이 없습니다',
      '나중에 이 SQL 을 고칠 사람이 의도를 알기 어렵습니다.',
      '조인 의도, 필터의 업무적 의미, 성능상 선택 이유를 짧게라도 남겨두세요.'));
  }
}

/** 조건절 하나를 훑으며 sargability / 형변환 문제를 찾는다. */
function scanCondition(ctx, range) {
  const { m, findings, columnTypes } = ctx;
  for (let i = range.start; i < range.end; i++) {
    const t = m[i];

    // 1) 컬럼에 함수 적용:  FUNC ( ... col ... )  <cmp>
    if (t.type === 'function' && NON_SARGABLE_FUNCS.has(t.value.toUpperCase()) && m[i + 1] && m[i + 1].value === '(') {
      // 괄호 닫는 위치 찾기
      let d = 1, j = i + 2, hasColumn = false;
      while (j < range.end && d > 0) {
        if (m[j].value === '(') d++;
        else if (m[j].value === ')') d--;
        else if (isColumnRef(m[j]) && !(m[j + 1] && m[j + 1].value === '(')) hasColumn = true;
        j++;
      }
      const after = m[j];
      const isCompared = after && ((after.type === 'operator' && CMP_OPS.has(after.value)) ||
        (after.type === 'keyword' && ['LIKE', 'BETWEEN', 'IN'].includes(after.value.toUpperCase())));
      if (hasColumn && isCompared) {
        findings.push(at(ctx, t, finding('FUNCTION_ON_COLUMN', 'high', 'index',
          `조건절에서 컬럼에 ${t.value.toUpperCase()}() 적용`,
          '컬럼을 함수로 감싸면 그 컬럼의 일반 인덱스를 사용할 수 없습니다(옵티마이저가 원본 값의 순서를 알 수 없기 때문). ' +
          '조건이 아무리 선택적이어도 전체 스캔으로 떨어집니다.',
          '함수를 반대편(상수 쪽)으로 옮기세요. 예: TO_CHAR(dt,\'YYYYMMDD\')=\'20260101\' → dt >= TO_DATE(\'20260101\',\'YYYYMMDD\') AND dt < TO_DATE(\'20260102\',\'YYYYMMDD\'). ' +
          '변형이 불가능하면 함수기반 인덱스(FBI) 생성을 검토하세요.')));
      }
    }

    // 2) 암시적 형변환:  col = '문자열'  인데 col 이 숫자형 / 그 반대
    if (t.type === 'operator' && CMP_OPS.has(t.value)) {
      const left = m[i - 1], right = m[i + 1];
      const colTok = isColumnRef(left) ? left : (isColumnRef(right) ? right : null);
      const litTok = (left && (left.type === 'string' || left.type === 'number')) ? left
        : ((right && (right.type === 'string' || right.type === 'number')) ? right : null);
      if (colTok && litTok && Object.keys(columnTypes).length) {
        const colName = String(colTok.value).replace(/"/g, '').toUpperCase();
        const type = columnTypes[colName];
        if (type) {
          const isNum = /NUMBER|INTEGER|FLOAT|BINARY_(FLOAT|DOUBLE)/.test(type);
          const isChar = /CHAR|CLOB/.test(type);
          const isDate = /DATE|TIMESTAMP/.test(type);
          if (isNum && litTok.type === 'string') {
            findings.push(at(ctx, colTok, finding('IMPLICIT_CONVERSION_NUM', 'high', 'index',
              `숫자 컬럼 ${colName} 을(를) 문자 리터럴과 비교`,
              `${colName} 의 타입은 ${type} 인데 문자열과 비교하고 있습니다. Oracle 은 문자 쪽을 숫자로 바꾸므로 ` +
              '이 경우는 인덱스가 유지되지만, 변환 실패 시 ORA-01722 가 런타임에 터집니다.',
              '리터럴에서 따옴표를 빼세요. 반대로 컬럼이 문자형인데 숫자와 비교하면 컬럼 쪽이 변환되어 인덱스를 잃습니다.')));
          } else if (isChar && litTok.type === 'number') {
            findings.push(at(ctx, colTok, finding('IMPLICIT_CONVERSION_CHAR', 'high', 'index',
              `문자 컬럼 ${colName} 을(를) 숫자와 비교 — 인덱스 무효화`,
              `${colName} 의 타입은 ${type} 입니다. 문자 컬럼과 숫자를 비교하면 Oracle 은 ` +
              `TO_NUMBER(${colName}) 처럼 <b>컬럼 쪽</b>을 변환합니다. 결과적으로 함수를 씌운 것과 같아 인덱스를 쓰지 못합니다.`,
              `리터럴을 따옴표로 감싸 문자로 맞추세요: ${colName} = '값'`)));
          } else if (isDate && litTok.type === 'string') {
            findings.push(at(ctx, colTok, finding('DATE_STRING_COMPARE', 'medium', 'semantics',
              `날짜 컬럼 ${colName} 을(를) 문자열과 직접 비교`,
              'NLS_DATE_FORMAT 세션 설정에 따라 해석이 달라집니다. 다른 환경에서 결과가 달라지거나 ORA-01861 이 납니다.',
              `TO_DATE 로 형식을 명시하세요: ${colName} >= TO_DATE('2026-01-01','YYYY-MM-DD')`)));
          }
        }
      }
    }

    // 3) 컬럼 || 문자열 형태의 연결 비교
    if (t.type === 'operator' && t.value === '||') {
      const prev = m[i - 1];
      if (isColumnRef(prev)) {
        let k = i;
        while (k < range.end && !(m[k].type === 'operator' && CMP_OPS.has(m[k].value))) k++;
        if (k < range.end) {
          findings.push(at(ctx, prev, finding('CONCAT_IN_PREDICATE', 'medium', 'index',
            '조건절에서 컬럼 연결(||) 후 비교',
            '연결 연산도 컬럼을 가공하는 것이라 해당 컬럼 인덱스를 쓸 수 없습니다.',
            '각 컬럼을 따로 비교하도록 조건을 분리하세요.')));
        }
      }
    }

    // 4) 부정 조건
    if (t.type === 'operator' && (t.value === '<>' || t.value === '!=' || t.value === '^=')) {
      const prev = m[i - 1];
      if (isColumnRef(prev)) {
        findings.push(at(ctx, t, finding('NEGATIVE_PREDICATE', 'low', 'index',
          '부등호(<>) 조건',
          '"같지 않다"는 인덱스로 범위를 좁힐 수 없어 대체로 전체 스캔이 됩니다.',
          '제외 대상이 소수라면 그대로 두어도 됩니다. 선택도가 높다면 긍정 조건(IN)으로 뒤집을 수 있는지 검토하세요.')));
      }
    }

    // 5) OR 로 이어진 같은 컬럼 비교 → IN 권장
    if (t.type === 'keyword' && t.value.toUpperCase() === 'OR') {
      const l = m[i - 3], ll = m[i - 2], r = m[i + 1], rr = m[i + 2];
      if (isColumnRef(l) && isColumnRef(r) && String(l.value).toUpperCase() === String(r.value).toUpperCase()
        && ll && rr && ll.value === '=' && rr.value === '=') {
        findings.push(at(ctx, t, finding('OR_SAME_COLUMN', 'low', 'style',
          '같은 컬럼에 대한 OR 비교',
          '같은 컬럼의 등가 비교를 OR 로 나열하면 옵티마이저가 concatenation 으로 풀어 여러 번 접근할 수 있습니다.',
          'IN (값1, 값2, ...) 으로 묶으면 의도가 분명하고 계획도 단순해집니다.')));
      }
    }
  }
}

/** 조인 등가조건 개수를 센다(별칭.컬럼 = 별칭.컬럼 형태). */
function countJoinEqualities(m, range) {
  let n = 0;
  for (let i = range.start; i < range.end; i++) {
    const t = m[i];
    if (!(t.type === 'operator' && t.value === '=')) continue;
    const lDot = m[i - 2] && m[i - 2].value === '.';
    const rDot = m[i + 2] && m[i + 2].value === '.';
    if (lDot && rDot) n++;
  }
  return n;
}

function scalarSubqueryInSelect(ctx) {
  const { m, findings } = ctx;
  let selIdx = -1;
  for (let i = 0; i < m.length; i++) {
    if (m[i].type === 'keyword' && m[i].value.toUpperCase() === 'SELECT' && m[i].depth === 0) { selIdx = i; break; }
  }
  if (selIdx < 0) return;
  for (let i = selIdx + 1; i < m.length; i++) {
    const t = m[i];
    if (t.depth === 0 && t.type === 'keyword' && t.value.toUpperCase() === 'FROM') break;
    if (t.value === '(' && m[i + 1] && m[i + 1].type === 'keyword' && m[i + 1].value.toUpperCase() === 'SELECT') {
      findings.push(at(ctx, t, finding('SCALAR_SUBQUERY_IN_SELECT', 'medium', 'join',
        'SELECT 목록의 스칼라 서브쿼리',
        '바깥 결과 행마다 서브쿼리가 실행될 수 있습니다(스칼라 서브쿼리 캐싱이 듣지 않으면 행수만큼 반복). ' +
        '행이 많아질수록 비용이 선형으로 커집니다.',
        '아우터 조인으로 바꾸거나, 분석함수(윈도우 함수)로 한 번에 계산할 수 있는지 검토하세요.')));
      break;
    }
  }
}

function havingNonAggregate(ctx) {
  const { m, findings } = ctx;
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (!(t.type === 'keyword' && t.value.toUpperCase() === 'HAVING')) continue;
    let hasAgg = false;
    for (let j = i + 1; j < m.length && m[j].depth >= t.depth; j++) {
      const x = m[j];
      if (x.depth === t.depth && x.type === 'keyword' && CLAUSE_ENDERS.has(x.value.toUpperCase())) break;
      if (x.type === 'function' && /^(COUNT|SUM|AVG|MIN|MAX|STDDEV|VARIANCE|LISTAGG)$/i.test(x.value)) hasAgg = true;
    }
    if (!hasAgg) {
      findings.push(at(ctx, t, finding('HAVING_WITHOUT_AGGREGATE', 'medium', 'io',
        'HAVING 에 집계함수 조건이 없습니다',
        'HAVING 은 그룹을 만든 <b>뒤에</b> 걸리는 필터입니다. 집계와 무관한 조건이면 그룹핑 대상 행을 먼저 줄일 기회를 놓칩니다.',
        '집계와 무관한 조건은 WHERE 로 내리세요. 읽는 행 자체가 줄어 훨씬 유리합니다.')));
    }
  }
}

function duplicateSubqueries(ctx) {
  const { tokens, sql, findings } = ctx;
  const subs = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'punct' || t.value !== '(') continue;
    let j = i + 1;
    while (j < tokens.length && (tokens[j].type === 'ws' || tokens[j].type === 'lineComment' || tokens[j].type === 'blockComment')) j++;
    if (!(tokens[j] && tokens[j].type === 'keyword' && tokens[j].value.toUpperCase() === 'SELECT')) continue;
    // 짝 괄호 찾기
    let depth = 1, k = i + 1;
    while (k < tokens.length && depth > 0) {
      if (tokens[k].type === 'punct' && tokens[k].value === '(') depth++;
      else if (tokens[k].type === 'punct' && tokens[k].value === ')') depth--;
      k++;
    }
    const text = sql.slice(t.start, tokens[k - 1] ? tokens[k - 1].end : sql.length);
    // 너무 짧은 서브쿼리((SELECT 1 FROM dual) 류)는 중복이어도 문제 삼지 않는다.
    if (text.length >= 25) subs.push({ tok: t, norm: T.normalize(text) });
  }
  const seen = new Map();
  for (const s of subs) {
    const c = seen.get(s.norm);
    if (c) { c.count++; } else { seen.set(s.norm, { count: 1, tok: s.tok }); }
  }
  for (const [, v] of seen) {
    if (v.count >= 2) {
      findings.push(at(ctx, v.tok, finding('DUPLICATE_SUBQUERY', 'medium', 'io',
        `동일한 서브쿼리가 ${v.count}번 반복됩니다`,
        '같은 결과를 여러 번 계산합니다. 옵티마이저가 항상 공통 부분식을 인식하지는 않습니다.',
        'WITH 절(CTE)로 한 번만 계산하고 이름으로 참조하세요. 필요하면 /*+ MATERIALIZE */ 힌트로 임시 결과 고정을 검토합니다.')));
    }
  }
}

// ── 2) 실행계획 규칙 ────────────────────────────────────────────────────────

function planRules(ctx) {
  const plan = ctx.plan;
  if (!plan || !plan.available || !Array.isArray(plan.rows) || plan.rows.length === 0) return;
  const rows = plan.rows;
  const findings = ctx.findings;
  const stats = ctx.tableStats || {};

  for (const r of rows) {
    const op = String(r.opFull || '').toUpperCase();
    const objName = r.object_name ? String(r.object_name) : '';
    const card = numOf(r.cardinality);
    const cost = numOf(r.cost);

    if (op.startsWith('TABLE ACCESS FULL')) {
      const st = stats[objName.toUpperCase()];
      const rowsNum = st ? numOf(st.num_rows) : null;
      const big = rowsNum !== null && rowsNum > 10000;
      findings.push(finding('PLAN_FULL_SCAN', big ? 'high' : 'medium', 'plan',
        `전체 테이블 스캔: ${objName}`,
        `계획 ${r.id}단계에서 ${objName} 을(를) 전부 읽습니다.` +
        (rowsNum !== null ? ` 통계상 행수 ${fmt(rowsNum)}건.` : ' (행수 통계를 확인할 수 없습니다.)') +
        ' 소량 테이블이면 전체 스캔이 오히려 유리할 수 있으니 무조건 나쁜 것은 아닙니다.',
        '조건 컬럼에 인덱스가 있는지, 조건이 sargable 한지(컬럼에 함수/형변환이 걸리지 않았는지) 확인하세요. ' +
        '읽는 비율이 큰 질의라면 전체 스캔이 정답일 수 있습니다.',
        { planId: r.id, object: objName }));
    }
    if (op.includes('MERGE JOIN CARTESIAN')) {
      findings.push(finding('PLAN_CARTESIAN', 'high', 'plan',
        '카티션 조인이 계획에 있습니다',
        `계획 ${r.id}단계가 MERGE JOIN CARTESIAN 입니다. 조인 조건이 없거나 옵티마이저가 조건을 쓰지 못한 상태로, ` +
        '행수가 곱셈으로 늘어납니다.',
        '조인 조건 누락을 먼저 확인하세요. 조건이 있는데도 나온다면 통계 부정확이나 형변환으로 조건이 무력화된 경우입니다.',
        { planId: r.id }));
    }
    if (op.includes('INDEX FULL SCAN')) {
      findings.push(finding('PLAN_INDEX_FULL_SCAN', 'medium', 'plan',
        `인덱스 전체 스캔: ${objName}`,
        '인덱스를 처음부터 끝까지 읽습니다. 정렬을 피하려고 선택되는 경우가 많지만, 범위 스캔보다 훨씬 많이 읽습니다.',
        '선행 컬럼에 대한 등가 조건이 있는지 확인하세요. 인덱스 컬럼 순서가 조건과 맞지 않을 때 자주 나타납니다.',
        { planId: r.id, object: objName }));
    }
    if (op.includes('INDEX SKIP SCAN')) {
      findings.push(finding('PLAN_INDEX_SKIP_SCAN', 'low', 'plan',
        `인덱스 스킵 스캔: ${objName}`,
        '복합 인덱스의 선행 컬럼 조건이 없어 값마다 건너뛰며 읽습니다. 선행 컬럼의 고유값이 적을 때만 효율적입니다.',
        '조건 컬럼을 선행에 둔 인덱스를 만들거나, 인덱스 컬럼 순서를 재검토하세요.',
        { planId: r.id, object: objName }));
    }
    if (op.includes('SORT ORDER BY') && card > 100000) {
      findings.push(finding('PLAN_LARGE_SORT', 'medium', 'plan',
        `대량 정렬: 예상 ${fmt(card)}행`,
        'PGA 를 넘으면 임시 테이블스페이스로 디스크 정렬이 발생해 급격히 느려집니다.',
        '정렬 순서와 같은 인덱스를 이용하면 정렬 자체를 없앨 수 있습니다. 상위 N건만 필요하면 12c 이상에서는 ' +
          'FETCH FIRST 로, 11g 이하에서는 인라인뷰로 감싸고 바깥에서 ROWNUM 을 걸어 줄이세요.',
        { planId: r.id }));
    }
    if (op.includes('REMOTE')) {
      findings.push(finding('PLAN_REMOTE', 'medium', 'plan',
        'DB 링크를 통한 원격 접근',
        '원격 실행 구간은 로컬 옵티마이저가 제어하지 못하고, 네트워크로 행을 옮기는 비용이 큽니다.',
        '원격 쪽에서 필터가 수행되는지(driving site) 확인하고, 필요하면 /*+ DRIVING_SITE(t) */ 로 지정하세요.',
        { planId: r.id }));
    }
    if (op.includes('NESTED LOOPS') && card > 100000) {
      findings.push(finding('PLAN_NL_LARGE', 'medium', 'plan',
        `대량 행에 대한 중첩 루프 조인 (예상 ${fmt(card)}행)`,
        '중첩 루프는 바깥 행마다 안쪽을 탐색합니다. 바깥 행이 많으면 반복 횟수가 그대로 비용이 됩니다.',
        '대량 조인은 해시 조인이 유리한 경우가 많습니다. 통계가 정확한지 확인하고, 필요하면 USE_HASH 힌트로 비교해 보세요.',
        { planId: r.id }));
    }
    if (cost > 100000) {
      findings.push(finding('PLAN_HIGH_COST', 'info', 'plan',
        `높은 예상 비용: ${fmt(cost)}`,
        `계획 ${r.id}단계의 비용 추정치가 매우 큽니다. 비용은 상대 지표이므로 절대값보다 단계 간 비교가 중요합니다.`,
        '가장 비싼 단계부터 확인하세요. 실제 실행 통계(A-Rows)와 예상치가 크게 다르면 통계 갱신이 먼저입니다.',
        { planId: r.id }));
    }
  }

  // 예상 행수가 전부 1 → 통계 부재 의심
  const cardOnes = rows.filter((r) => numOf(r.cardinality) === 1).length;
  if (rows.length >= 4 && cardOnes >= rows.length - 1) {
    findings.push(finding('PLAN_SUSPICIOUS_CARDINALITY', 'medium', 'plan',
      '예상 행수가 대부분 1건 — 통계 부재가 의심됩니다',
      '옵티마이저가 모든 단계에서 1건을 예상하고 있습니다. 통계가 없어 기본값으로 추정하는 전형적인 모습입니다.',
      'DBMS_STATS.GATHER_TABLE_STATS 로 통계를 수집한 뒤 계획을 다시 확인하세요.'));
  }

  // 요약 지표 안내
  const sum = plan.summary || {};
  if (sum.fullScans > 0 && sum.indexScans === 0) {
    findings.push(finding('PLAN_NO_INDEX_USED', 'info', 'plan',
      '인덱스를 전혀 사용하지 않는 계획',
      `전체 스캔 ${sum.fullScans}건, 인덱스 접근 0건입니다.`,
      '조건 컬럼에 인덱스가 있는지 확인하세요. 없다면 인덱스 후보를 검토하고, 있는데 못 쓰면 sargability 문제입니다.'));
  }
}

// ── 3) 메타데이터 규칙 ─────────────────────────────────────────────────────

function metaRules(ctx) {
  const { structure, tableStats, indexes, findings } = ctx;
  for (const t of structure.tables) {
    if (t.inline) continue;
    const name = String(t.name || '').replace(/"/g, '').toUpperCase();
    const st = tableStats[name];
    if (st) {
      if (!st.last_analyzed) {
        findings.push(finding('STATS_MISSING', 'medium', 'stats',
          `${name}: 통계가 수집된 적이 없습니다`,
          '옵티마이저가 행수·분포를 모른 채 기본값으로 추정합니다. 잘못된 조인 순서나 접근 경로가 선택되기 쉽습니다.',
          `EXEC DBMS_STATS.GATHER_TABLE_STATS(USER, '${name}');`));
      } else {
        const age = daysSince(st.last_analyzed);
        if (age !== null && age > 30) {
          findings.push(finding('STATS_STALE', 'low', 'stats',
            `${name}: 통계가 ${age}일 전 것입니다`,
            `마지막 분석: ${st.last_analyzed}. 그 사이 데이터가 크게 변했다면 추정이 실제와 어긋납니다.`,
            '데이터 변동이 컸다면 통계를 다시 수집하세요.'));
        }
      }
    }
    const idx = indexes[name];
    if (idx && idx.length === 0) {
      findings.push(finding('NO_INDEX', 'info', 'index',
        `${name}: 인덱스가 없습니다`,
        '이 테이블에는 인덱스가 하나도 없어 모든 접근이 전체 스캔입니다.',
        '자주 쓰는 조건 컬럼에 인덱스를 검토하세요. 다만 소량 테이블이면 그대로 두는 편이 낫습니다.'));
    }
  }
}

function numOf(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function fmt(n) {
  return Number(n).toLocaleString('ko-KR');
}

function daysSince(dateStr) {
  const d = new Date(String(dateStr).replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ── 자동 리라이트 ──────────────────────────────────────────────────────────

/**
 * `SELECT *` 를 실제 컬럼 목록으로 펼친다.
 * 컬럼 이름은 describeQuery(실행 없이 결과 구조만) 로 얻은 것을 쓰므로
 * 딕셔너리 권한이 없어도 동작한다.
 */
function expandStar(sql, columnNames, opts) {
  const options = opts || {};
  const perLine = options.perLine !== false;
  if (!Array.isArray(columnNames) || columnNames.length === 0) {
    return { ok: false, sql, error: '펼칠 컬럼 목록이 비어 있습니다.' };
  }
  const toks = T.tokenize(sql);
  // 최상위 SELECT 바로 뒤의 '*' 를 찾는다(힌트/DISTINCT 는 건너뛴다)
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(t.type === 'keyword' && t.value.toUpperCase() === 'SELECT' && t.depth === 0)) continue;
    let j = i + 1;
    while (j < toks.length && ['ws', 'hint', 'lineComment', 'blockComment'].includes(toks[j].type)) j++;
    if (toks[j] && toks[j].type === 'keyword' && ['DISTINCT', 'ALL', 'UNIQUE'].includes(toks[j].value.toUpperCase())) {
      j++;
      while (j < toks.length && ['ws', 'lineComment', 'blockComment'].includes(toks[j].type)) j++;
    }
    if (toks[j] && toks[j].type === 'operator' && toks[j].value === '*') {
      const quoted = columnNames.map((c) => (/^[A-Za-z_][A-Za-z0-9_$#]*$/.test(c) ? c : `"${c}"`));
      const sep = perLine ? '\n     , ' : ', ';
      const replacement = quoted.join(sep);
      const next = sql.slice(0, toks[j].start) + replacement + sql.slice(toks[j].end);
      return { ok: true, sql: next, expanded: columnNames.length };
    }
  }
  return { ok: false, sql, error: '최상위 SELECT * 를 찾지 못했습니다(별칭.* 형태는 지원하지 않습니다).' };
}

/** 첫 DML 키워드 뒤에 힌트를 넣는다(기존 힌트가 있으면 합친다). */
function addHint(sql, hint) {
  const h = String(hint || '').replace(/^\/\*\+?|\*\/$/g, '').trim();
  if (!h) return { ok: false, sql, error: '힌트 내용이 비어 있습니다.' };
  const toks = T.tokenize(sql);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'keyword') continue;
    const up = t.value.toUpperCase();
    if (!['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(up)) continue;
    let j = i + 1;
    while (j < toks.length && toks[j].type === 'ws') j++;
    if (toks[j] && toks[j].type === 'hint') {
      const inner = toks[j].value.replace(/^\/\*\+/, '').replace(/\*\/$/, '').trim();
      if (inner.toUpperCase().includes(h.toUpperCase())) return { ok: true, sql, note: '이미 같은 힌트가 있습니다.' };
      const merged = `/*+ ${h} ${inner} */`;
      return { ok: true, sql: sql.slice(0, toks[j].start) + merged + sql.slice(toks[j].end) };
    }
    return { ok: true, sql: sql.slice(0, t.end) + ` /*+ ${h} */` + sql.slice(t.end) };
  }
  return { ok: false, sql, error: '힌트를 넣을 위치(SELECT/INSERT/UPDATE/DELETE/MERGE)를 찾지 못했습니다.' };
}

module.exports = { analyze, expandStar, addHint };
