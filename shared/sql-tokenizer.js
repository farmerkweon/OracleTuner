/**
 * Oracle SQL Tokenizer / Lightweight Parser
 * ------------------------------------------------------------------
 * 브라우저(하이라이팅)와 Node 서버(분석·문장분리)에서 **같은 코드**를 쓴다.
 * 설계 원칙:
 *   1) 절대 throw 하지 않는다. 깨진 SQL(닫히지 않은 주석/따옴표)도 토큰으로 소화한다.
 *   2) Oracle 고유 문법을 모두 인식한다:
 *      - `--` 라인주석, `/* *\/` 블록주석, `/*+ *\/` 힌트(주석과 구분)
 *      - 문자열 '' 이스케이프, N'' 국가문자셋, q'[]' q'{}' q'()' q'<>' q'!!' 대체인용
 *      - "따옴표 식별자"("" 이스케이프), 유니코드 식별자(한글 컬럼/테이블명)
 *      - 바인드 :name :1 :"Quoted", SQL*Plus 치환변수 &var &&var
 *   3) 위치정보(start/end/line/col)와 괄호깊이(depth)를 모든 토큰에 부여한다.
 *      → 서브쿼리 경계 판정, 캐럿 위치의 문장 추출, 하이라이팅에 그대로 쓴다.
 *
 * 반환 토큰 타입:
 *   ws lineComment blockComment hint string qstring quotedIdent number
 *   bind subst operator punct keyword function identifier unknown
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SqlTokenizer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 키워드 사전 ────────────────────────────────────────────────────────────
  var KEYWORDS = ('ACCESS ADD ALL ALTER AND ANY ARRAY AS ASC AT AUDIT AUTHID AUTOMATIC BEGIN BETWEEN BFILE BINARY_DOUBLE ' +
    'BINARY_FLOAT BLOB BODY BOOLEAN BOTH BREADTH BULK BY BYTE CACHE CALL CASCADE CASE CAST CHAR CHECK CLOB CLOSE CLUSTER ' +
    'COALESCE COLLECT COLUMN COMMENT COMMIT COMPRESS CONNECT CONSTANT CONSTRAINT CONTINUE CREATE CROSS CUBE CURRENT ' +
    'CURRENT_DATE CURRENT_TIMESTAMP CURSOR CYCLE DATE DAY DBTIMEZONE DEC DECIMAL DECLARE DEFAULT DEFERRED DEFINE DELETE ' +
    'DENSE_RANK DEPTH DESC DETERMINISTIC DIMENSION DIRECTORY DISABLE DISTINCT DOCUMENT DOUBLE DROP EACH ELSE ELSIF ENABLE ' +
    'END ESCAPE EXCEPT EXCEPTION EXCLUDE EXCLUSIVE EXECUTE EXISTS EXIT EXPLAIN EXTERNAL FALSE FETCH FILE FIRST FLOAT ' +
    'FOLLOWING FOR FORALL FORCE FOREIGN FROM FULL FUNCTION GOTO GRANT GROUP GROUPING HAVING HOUR IDENTIFIED IDENTITY IF ' +
    'IGNORE IMMEDIATE IN INCLUDE INCREMENT INDEX INDICES INITIAL INNER INOUT INSERT INSTEAD INT INTEGER INTERSECT INTERVAL ' +
    'INTO IS ISOLATION JOIN KEEP KEY LANGUAGE LAST LATERAL LEADING LEFT LEVEL LIKE LIMIT LOCAL LOCK LOG LONG LOOP MAIN ' +
    'MATCHED MATERIALIZED MAXVALUE MEASURES MERGE MINUS MINUTE MINVALUE MLSLABEL MODE MODEL MODIFY MONTH NATURAL NCHAR ' +
    'NCLOB NESTED NEW NEXT NO NOAUDIT NOCACHE NOCOMPRESS NOCOPY NOCYCLE NOLOGGING NONE NOT NOWAIT NULL NULLS NUMBER ' +
    'NUMERIC NVARCHAR2 OBJECT OF OFF OFFLINE OFFSET OLD ON ONLINE ONLY OPEN OPTION OR ORDER ORGANIZATION OTHERS OUT OUTER ' +
    'OVER PACKAGE PARALLEL PARTITION PCTFREE PIPELINED PIVOT PLS_INTEGER POSITIVE PRAGMA PRECEDING PRECISION PRESENT PRIOR ' +
    'PRIVATE PRIVILEGES PROCEDURE PUBLIC PURGE RAISE RANGE RAW READ REAL RECORD RECURSIVE REF REFERENCES REFRESH REJECT ' +
    'RELIES_ON RENAME REPLACE RESOURCE RESTRICT RESULT RESULT_CACHE RETURN RETURNING REVERSE REVOKE RIGHT ROLLBACK ROLLUP ' +
    'ROW ROWID ROWNUM ROWS SAMPLE SAVEPOINT SEARCH SECOND SEGMENT SELECT SEQUENCE SESSION SESSIONTIMEZONE SET SETS SHARE ' +
    'SHOW SIBLINGS SIGNTYPE SIMPLE_INTEGER SIZE SMALLINT SNAPSHOT SOME SPECIFICATION SQL SQLERRM START STATEMENT STATIC ' +
    'STORAGE STORE SUBPARTITION SUBTYPE SUCCESSFUL SYNONYM SYSDATE SYSTIMESTAMP TABLE TABLESPACE TEMPORARY THEN TIES TIME ' +
    'TIMESTAMP TO TRAILING TRANSACTION TRIGGER TRUE TRUNCATE TYPE UID UNBOUNDED UNDER UNION UNIQUE UNLIMITED UNPIVOT ' +
    'UNTIL UPDATE UPSERT UROWID USE USER USING VALIDATE VALUES VARCHAR VARCHAR2 VARIABLE VARRAY VARYING VIEW VIRTUAL ' +
    'WAIT WHEN WHENEVER WHERE WHILE WITH WITHIN WITHOUT WORK WRITE XML XMLTABLE YEAR ZONE').split(' ');

  var BUILTIN_FUNCS = ('ABS ACOS ADD_MONTHS APPROX_COUNT_DISTINCT ASCII ASCIISTR ASIN ATAN ATAN2 AVG BFILENAME BIN_TO_NUM ' +
    'BITAND CARDINALITY CEIL CHARTOROWID CHR COALESCE COLLECT COMPOSE CONCAT CONVERT CORR COS COSH COUNT COVAR_POP ' +
    'COVAR_SAMP CUME_DIST CURRENT_DATE CURRENT_TIMESTAMP DBTIMEZONE DECODE DECOMPOSE DENSE_RANK DEREF DUMP EMPTY_BLOB ' +
    'EMPTY_CLOB EXISTSNODE EXP EXTRACT EXTRACTVALUE FIRST_VALUE FLOOR FROM_TZ GREATEST GROUPING GROUPING_ID HEXTORAW ' +
    'INITCAP INSTR INSTRB JSON_ARRAY JSON_ARRAYAGG JSON_EXISTS JSON_OBJECT JSON_OBJECTAGG JSON_QUERY JSON_TABLE JSON_VALUE ' +
    'LAG LAST_DAY LAST_VALUE LEAD LEAST LENGTH LENGTHB LISTAGG LN LNNVL LOCALTIMESTAMP LOG LOWER LPAD LTRIM MAX MEDIAN MIN ' +
    'MOD MONTHS_BETWEEN NANVL NCHR NEW_TIME NEXT_DAY NLSSORT NLS_CHARSET_ID NLS_INITCAP NLS_LOWER NLS_UPPER NTILE NULLIF ' +
    'NUMTODSINTERVAL NUMTOYMINTERVAL NVL NVL2 ORA_HASH PERCENTILE_CONT PERCENTILE_DISC PERCENT_RANK POWER RANK RATIO_TO_REPORT ' +
    'RAWTOHEX REGEXP_COUNT REGEXP_INSTR REGEXP_LIKE REGEXP_REPLACE REGEXP_SUBSTR REMAINDER REPLACE ROUND ROW_NUMBER ROWIDTOCHAR ' +
    'RPAD RTRIM SESSIONTIMEZONE SIGN SIN SINH SOUNDEX SQRT STANDARD_HASH STATS_MODE STDDEV STDDEV_POP STDDEV_SAMP SUBSTR ' +
    'SUBSTRB SUM SYSDATE SYSTIMESTAMP SYS_CONNECT_BY_PATH SYS_CONTEXT SYS_GUID TAN TANH TO_BINARY_DOUBLE TO_BINARY_FLOAT ' +
    'TO_CHAR TO_CLOB TO_DATE TO_DSINTERVAL TO_LOB TO_MULTI_BYTE TO_NCHAR TO_NUMBER TO_SINGLE_BYTE TO_TIMESTAMP ' +
    'TO_TIMESTAMP_TZ TO_YMINTERVAL TRANSLATE TREAT TRIM TRUNC TZ_OFFSET UID UNISTR UPPER USER USERENV VAR_POP VAR_SAMP ' +
    'VARIANCE VSIZE WIDTH_BUCKET XMLAGG XMLCAST XMLELEMENT XMLFOREST XMLQUERY XMLSERIALIZE').split(' ');

  var KW_SET = Object.create(null);
  KEYWORDS.forEach(function (k) { KW_SET[k] = true; });
  var FN_SET = Object.create(null);
  BUILTIN_FUNCS.forEach(function (k) { FN_SET[k] = true; });

  /** PL/SQL 블록 시작을 알리는 키워드 — 이 경우 `;` 로 문장을 자르면 안 된다. */
  var PLSQL_STARTERS = ['DECLARE', 'BEGIN'];
  var PLSQL_DDL = ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'];

  // ── 문자 분류 (유니코드 안전) ──────────────────────────────────────────────
  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isSpace(c) { return c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v'; }
  /** 식별자 시작 문자: 영문/밑줄/유니코드(한글 등). Oracle 은 따옴표 없이도 한글 식별자를 허용한다. */
  function isIdentStart(c) {
    if (c === undefined) return false;
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') return true;
    return c.charCodeAt(0) > 127;
  }
  function isIdentPart(c) {
    if (c === undefined) return false;
    if (isIdentStart(c) || isDigit(c)) return true;
    return c === '$' || c === '#';
  }

  /** q'X ... X' 대체인용의 닫는 구분자. 괄호류는 짝을 맞춘다. */
  var Q_PAIR = { '[': ']', '(': ')', '{': '}', '<': '>' };

  /**
   * SQL 텍스트를 토큰 배열로 만든다. 어떤 입력에도 throw 하지 않는다.
   * @param {string} sql
   * @param {{skipWs?:boolean}} [opts] skipWs=true 면 공백 토큰을 생략(분석용)
   * @returns {Array<{type:string,value:string,start:number,end:number,line:number,col:number,depth:number,unterminated?:boolean}>}
   */
  function tokenize(sql, opts) {
    opts = opts || {};
    var out = [];
    if (typeof sql !== 'string' || sql.length === 0) return out;

    var i = 0, n = sql.length, line = 1, lineStart = 0, depth = 0;

    function push(type, start, end, extra) {
      var tok = {
        type: type,
        value: sql.slice(start, end),
        start: start,
        end: end,
        line: line,
        col: start - lineStart + 1,
        depth: depth
      };
      if (extra) for (var k in extra) tok[k] = extra[k];
      // 개행 카운트 갱신 (토큰 내부 개행 포함)
      for (var p = start; p < end; p++) {
        if (sql.charCodeAt(p) === 10) { line++; lineStart = p + 1; }
      }
      if (!(opts.skipWs && type === 'ws')) out.push(tok);
      return tok;
    }

    while (i < n) {
      var c = sql[i];

      // 공백
      if (isSpace(c)) {
        var s = i;
        while (i < n && isSpace(sql[i])) i++;
        push('ws', s, i);
        continue;
      }

      // 라인 주석 --
      if (c === '-' && sql[i + 1] === '-') {
        var s2 = i;
        i += 2;
        while (i < n && sql[i] !== '\n') i++;
        push('lineComment', s2, i);
        continue;
      }

      // 블록 주석 /* */ 및 힌트 /*+ */
      if (c === '/' && sql[i + 1] === '*') {
        var s3 = i;
        var isHint = sql[i + 2] === '+';
        i += 2;
        var closed = false;
        while (i < n) {
          if (sql[i] === '*' && sql[i + 1] === '/') { i += 2; closed = true; break; }
          i++;
        }
        if (!closed) i = n;
        push(isHint ? 'hint' : 'blockComment', s3, i, closed ? null : { unterminated: true });
        continue;
      }

      // 대체인용 q'...' / nq'...'  (대소문자 무관)
      var qMatch = matchQQuote(sql, i);
      if (qMatch) {
        var tk = push('qstring', i, qMatch.end, qMatch.closed ? null : { unterminated: true });
        i = qMatch.end;
        continue;
      }

      // 국가문자 문자열 N'...'
      if ((c === 'n' || c === 'N') && sql[i + 1] === "'") {
        var r = readQuoted(sql, i + 1, "'");
        push('string', i, r.end, r.closed ? null : { unterminated: true });
        i = r.end;
        continue;
      }

      // 일반 문자열 '...'  ('' 이스케이프)
      if (c === "'") {
        var r2 = readQuoted(sql, i, "'");
        push('string', i, r2.end, r2.closed ? null : { unterminated: true });
        i = r2.end;
        continue;
      }

      // 따옴표 식별자 "..."  ("" 이스케이프)
      if (c === '"') {
        var r3 = readQuoted(sql, i, '"');
        push('quotedIdent', i, r3.end, r3.closed ? null : { unterminated: true });
        i = r3.end;
        continue;
      }

      // 숫자 (.5, 1.2e-3, 1d, 1f)
      if (isDigit(c) || (c === '.' && isDigit(sql[i + 1]))) {
        var s4 = i;
        while (i < n && isDigit(sql[i])) i++;
        if (sql[i] === '.' && isDigit(sql[i + 1])) { i++; while (i < n && isDigit(sql[i])) i++; }
        else if (sql[i] === '.' && !isIdentStart(sql[i + 1]) && sql[i + 1] !== '.') { i++; }
        if (sql[i] === 'e' || sql[i] === 'E') {
          var save = i; i++;
          if (sql[i] === '+' || sql[i] === '-') i++;
          if (isDigit(sql[i])) { while (i < n && isDigit(sql[i])) i++; } else { i = save; }
        }
        if (sql[i] === 'f' || sql[i] === 'F' || sql[i] === 'd' || sql[i] === 'D') {
          if (!isIdentPart(sql[i + 1])) i++;
        }
        push('number', s4, i);
        continue;
      }

      // 바인드 변수 :name :1 :"Quoted"  /  PL/SQL 대입 := 는 operator
      if (c === ':') {
        if (sql[i + 1] === '=') { push('operator', i, i + 2); i += 2; continue; }
        var s5 = i, j = i + 1;
        if (sql[j] === '"') {
          var r4 = readQuoted(sql, j, '"');
          j = r4.end;
          push('bind', s5, j); i = j; continue;
        }
        if (isIdentStart(sql[j]) || isDigit(sql[j])) {
          while (j < n && isIdentPart(sql[j])) j++;
          push('bind', s5, j); i = j; continue;
        }
        push('punct', i, i + 1); i++; continue;
      }

      // SQL*Plus 치환변수 &var &&var
      if (c === '&') {
        var s6 = i, j2 = i + 1;
        if (sql[j2] === '&') j2++;
        if (isIdentStart(sql[j2])) {
          while (j2 < n && isIdentPart(sql[j2])) j2++;
          push('subst', s6, j2); i = j2; continue;
        }
        push('operator', i, i + 1); i++; continue;
      }

      // 식별자 / 키워드
      if (isIdentStart(c)) {
        var s7 = i;
        while (i < n && isIdentPart(sql[i])) i++;
        var word = sql.slice(s7, i);
        var up = word.toUpperCase();
        var type = 'identifier';
        if (KW_SET[up]) type = 'keyword';
        // 뒤에 '(' 가 오면 함수 호출로 본다 (키워드형 함수 제외를 위해 FN_SET 도 확인)
        var k = i;
        while (k < n && isSpace(sql[k])) k++;
        if (sql[k] === '(' && (FN_SET[up] || type === 'identifier')) type = 'function';
        else if (FN_SET[up] && type === 'identifier') type = 'function';
        push(type, s7, i);
        continue;
      }

      // 괄호 — 깊이 추적. '(' 자신은 바깥 깊이로 기록하고 이후를 +1 한다.
      if (c === '(') { push('punct', i, i + 1); depth++; i++; continue; }
      if (c === ')') { if (depth > 0) depth--; push('punct', i, i + 1); i++; continue; }

      // 다중문자 연산자
      var three = sql.substr(i, 3);
      if (three === '(+)') { push('operator', i, i + 3); i += 3; continue; }
      var two = sql.substr(i, 2);
      if (two === '||' || two === '=>' || two === '<=' || two === '>=' || two === '<>' ||
        two === '!=' || two === '^=' || two === '~=' || two === '**' || two === '..') {
        push('operator', i, i + 2); i += 2; continue;
      }
      if ('+-*/%=<>!^~'.indexOf(c) >= 0) { push('operator', i, i + 1); i++; continue; }
      if (',;.@'.indexOf(c) >= 0) { push('punct', i, i + 1); i++; continue; }

      push('unknown', i, i + 1);
      i++;
    }
    return out;
  }

  /** '...' 또는 "..." 를 읽는다. 같은 따옴표 2개는 이스케이프. 미종결이면 EOF까지. */
  function readQuoted(s, start, quote) {
    var i = start + 1, n = s.length;
    while (i < n) {
      if (s[i] === quote) {
        if (s[i + 1] === quote) { i += 2; continue; }
        return { end: i + 1, closed: true };
      }
      i++;
    }
    return { end: n, closed: false };
  }

  /** q'X..X' 대체인용 매칭. 아니면 null. */
  function matchQQuote(s, i) {
    var c = s[i];
    var p = i;
    if ((c === 'n' || c === 'N') && (s[i + 1] === 'q' || s[i + 1] === 'Q')) p = i + 1;
    else if (c !== 'q' && c !== 'Q') return null;
    if (s[p + 1] !== "'") return null;
    var delim = s[p + 2];
    if (delim === undefined) return null;
    var closeDelim = Q_PAIR[delim] || delim;
    var j = p + 3;
    while (j < s.length) {
      if (s[j] === closeDelim && s[j + 1] === "'") return { end: j + 2, closed: true };
      j++;
    }
    return { end: s.length, closed: false };
  }

  // ── 파생 유틸 ──────────────────────────────────────────────────────────────

  var COMMENT_TYPES = { lineComment: 1, blockComment: 1 };

  /** 주석 제거. keepHints=true(기본)면 /*+ ... *\/ 힌트는 남긴다. */
  function stripComments(sql, opts) {
    opts = opts || {};
    var keepHints = opts.keepHints !== false;
    var toks = tokenize(sql);
    var buf = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (COMMENT_TYPES[t.type]) { buf += ' '; continue; }
      if (t.type === 'hint' && !keepHints) { buf += ' '; continue; }
      buf += t.value;
    }
    return buf;
  }

  /** 의미 있는 토큰만 (공백/주석 제외). 힌트는 옵션. */
  function meaningful(toks, keepHint) {
    var r = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'ws' || COMMENT_TYPES[t.type]) continue;
      if (t.type === 'hint' && !keepHint) continue;
      r.push(t);
    }
    return r;
  }

  /**
   * 스크립트를 문장 단위로 분리한다.
   * - 문자열/주석 안의 `;` 는 무시 (토크나이저가 이미 분리해 두었다)
   * - PL/SQL 블록(DECLARE/BEGIN/CREATE ... PROCEDURE 등)은 `;` 로 자르지 않고
   *   단독 `/` 줄에서만 자른다.
   * @returns {Array<{sql:string,start:number,end:number,line:number,type:string}>}
   */
  function splitStatements(sql) {
    var toks = tokenize(sql);
    var stmts = [];
    var curStart = null;
    var sig = [];         // 현재 문장의 앞쪽 키워드들 (PL/SQL 판정용)
    var isPlsql = false;
    var blockDepth = 0;   // BEGIN..END 중첩

    function flush(endOffset, termLen) {
      if (curStart === null) return;
      var raw = sql.slice(curStart, endOffset);
      if (raw.trim().length > 0) {
        stmts.push({
          sql: raw,
          start: curStart,
          end: endOffset,
          line: lineOf(sql, curStart),
          type: classify(raw)
        });
      }
      curStart = null; sig = []; isPlsql = false; blockDepth = 0;
    }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'ws' || COMMENT_TYPES[t.type]) {
        // 주석이 문장 앞머리에 있으면 문장 시작으로 포함한다(주석까지 저장/실행 대상)
        if (curStart === null && !COMMENT_TYPES[t.type]) continue;
        if (curStart === null && COMMENT_TYPES[t.type]) { curStart = t.start; }
        continue;
      }
      if (curStart === null) curStart = t.start;

      var up = t.value.toUpperCase();

      if (t.type === 'keyword') {
        if (sig.length < 6) sig.push(up);
        if (!isPlsql) {
          if (PLSQL_STARTERS.indexOf(up) >= 0 && sig.length <= 2) isPlsql = true;
          else if (sig[0] === 'CREATE' && PLSQL_DDL.indexOf(up) >= 0) isPlsql = true;
        }
        if (isPlsql) {
          if (up === 'BEGIN') blockDepth++;
          else if (up === 'END') blockDepth = Math.max(0, blockDepth - 1);
        }
      }

      // 종결자 판정
      if (t.type === 'punct' && t.value === ';') {
        if (!isPlsql) { flush(t.end, 1); continue; }
        // PL/SQL: END; 로 블록이 모두 닫혔으면 문장 종료
        if (blockDepth === 0 && lastKeyword(toks, i) === 'END') { flush(t.end, 1); continue; }
        continue;
      }
      // 단독 `/` 줄 → SQL*Plus 실행 종결자
      if (t.type === 'operator' && t.value === '/' && isAloneOnLine(sql, t.start)) {
        flush(t.start, 1);
        continue;
      }
    }
    flush(sql.length, 0);
    return stmts;
  }

  function lastKeyword(toks, idx) {
    for (var i = idx - 1; i >= 0; i--) {
      var t = toks[i];
      if (t.type === 'ws' || COMMENT_TYPES[t.type]) continue;
      return t.value.toUpperCase();
    }
    return '';
  }

  function isAloneOnLine(sql, pos) {
    var i = pos - 1;
    while (i >= 0 && (sql[i] === ' ' || sql[i] === '\t')) i--;
    if (i >= 0 && sql[i] !== '\n' && sql[i] !== '\r') return false;
    var j = pos + 1;
    while (j < sql.length && (sql[j] === ' ' || sql[j] === '\t' || sql[j] === '\r')) j++;
    return j >= sql.length || sql[j] === '\n';
  }

  function lineOf(sql, offset) {
    var line = 1;
    for (var i = 0; i < offset && i < sql.length; i++) if (sql.charCodeAt(i) === 10) line++;
    return line;
  }

  /** 문장 종류를 대략 판정한다. */
  function classify(raw) {
    var toks = meaningful(tokenize(raw), false);
    if (!toks.length) return 'EMPTY';
    var first = toks[0].value.toUpperCase();
    if (first === 'WITH') {
      for (var i = 0; i < toks.length; i++) {
        var u = toks[i].value.toUpperCase();
        if (u === 'SELECT') return 'SELECT';
        if (u === 'INSERT' || u === 'UPDATE' || u === 'DELETE' || u === 'MERGE') return u;
      }
      return 'SELECT';
    }
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE'].indexOf(first) >= 0) return first;
    if (first === 'DECLARE' || first === 'BEGIN') return 'PLSQL';
    if (['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'COMMENT', 'ANALYZE', 'RENAME'].indexOf(first) >= 0) return 'DDL';
    if (['COMMIT', 'ROLLBACK', 'SAVEPOINT', 'SET', 'ALTER'].indexOf(first) >= 0) return 'TCL';
    if (first === 'EXPLAIN') return 'EXPLAIN';
    return 'OTHER';
  }

  /** 캐럿 오프셋이 속한 문장을 돌려준다. 없으면 null. */
  function statementAt(sql, offset) {
    var list = splitStatements(sql);
    for (var i = 0; i < list.length; i++) {
      if (offset >= list[i].start && offset <= list[i].end) return list[i];
    }
    return list.length ? list[list.length - 1] : null;
  }

  /** 바인드 변수 이름을 등장 순서대로(중복 제거) 돌려준다. */
  function extractBinds(sql) {
    var toks = tokenize(sql);
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].type !== 'bind') continue;
      var name = toks[i].value.slice(1).replace(/^"|"$/g, '');
      var key = name.toUpperCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ name: name, positional: /^\d+$/.test(name) });
    }
    return out;
  }

  /** SQL*Plus 치환변수 이름 목록. */
  function extractSubstitutions(sql) {
    var toks = tokenize(sql);
    var seen = Object.create(null), out = [];
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].type !== 'subst') continue;
      var nm = toks[i].value.replace(/^&+/, '');
      if (seen[nm.toUpperCase()]) continue;
      seen[nm.toUpperCase()] = true;
      out.push(nm);
    }
    return out;
  }

  /**
   * 정규화 지문(fingerprint). 리터럴을 `?` 로 치환하고 공백/대소문자를 통일한다.
   * 같은 형태의 SQL 인지 비교하거나 튜닝 이력 키로 쓴다.
   */
  function normalize(sql) {
    var toks = tokenize(sql);
    var parts = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      switch (t.type) {
        case 'ws': case 'lineComment': case 'blockComment': break;
        case 'hint': parts.push('/*+HINT*/'); break;
        case 'string': case 'qstring': case 'number': parts.push('?'); break;
        case 'bind': parts.push(':B'); break;
        case 'quotedIdent': parts.push(t.value); break;
        case 'keyword': case 'function': parts.push(t.value.toUpperCase()); break;
        case 'identifier': parts.push(t.value.toUpperCase()); break;
        default: parts.push(t.value);
      }
    }
    return parts.join(' ').replace(/\s+([,;)])/g, '$1').replace(/\(\s+/g, '(').trim();
  }

  /** 32비트 FNV-1a 해시(hex 8자리) — 지문 축약용. 암호용 아님. */
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function fingerprint(sql) { return hash32(normalize(sql)); }

  /**
   * 구조 분석 — 완전한 파서가 아니라 **튜닝 규칙이 필요로 하는 만큼만** 뽑는다.
   * 실패해도 부분 결과를 돌려준다(절대 throw 하지 않음).
   */
  function analyze(sql) {
    var res = {
      type: 'OTHER',
      hints: [],
      binds: extractBinds(sql),
      substitutions: extractSubstitutions(sql),
      ctes: [],
      tables: [],          // {schema,name,alias,depth,start,end,dblink}
      subqueryCount: 0,
      maxDepth: 0,
      flags: {},
      clauses: {},         // 최상위 절 위치 {select:{start},from:{},where:{}...}
      selectStar: false,
      unterminated: false,
      comments: []
    };
    var toks;
    try { toks = tokenize(sql); } catch (e) { return res; }

    var m = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.unterminated) res.unterminated = true;
      if (t.type === 'hint') res.hints.push({ text: t.value, start: t.start });
      if (COMMENT_TYPES[t.type]) res.comments.push({ text: t.value, start: t.start, line: t.line });
      if (t.depth > res.maxDepth) res.maxDepth = t.depth;
      if (t.type === 'ws' || COMMENT_TYPES[t.type] || t.type === 'hint') continue;
      m.push(t);
    }
    if (!m.length) return res;
    res.type = classify(sql);

    var f = res.flags;
    function setFlag(k) { f[k] = (f[k] || 0) + 1; }

    for (var k = 0; k < m.length; k++) {
      var tk = m[k];
      var up = tk.value.toUpperCase();
      var prev = m[k - 1], next = m[k + 1], next2 = m[k + 2];

      if (tk.type === 'punct' && tk.value === '(') {
        // 서브쿼리: '(' 다음이 SELECT 또는 WITH
        if (next && next.type === 'keyword' && (next.value.toUpperCase() === 'SELECT' || next.value.toUpperCase() === 'WITH')) {
          res.subqueryCount++;
        }
      }

      if (tk.type !== 'keyword' && tk.type !== 'function' && tk.type !== 'operator') continue;

      switch (up) {
        case 'SELECT':
          if (tk.depth === 0 && !res.clauses.select) res.clauses.select = { start: tk.start, line: tk.line };
          if (next && next.type === 'operator' && next.value === '*') { if (tk.depth === 0) res.selectStar = true; setFlag('selectStarAny'); }
          if (next && next.type === 'keyword' && next.value.toUpperCase() === 'DISTINCT') setFlag('distinct');
          break;
        case 'FROM':
          if (tk.depth === 0 && !res.clauses.from) res.clauses.from = { start: tk.start, line: tk.line };
          collectTables(m, k, res);
          break;
        case 'JOIN':
          collectTables(m, k, res, true);
          setFlag('ansiJoin');
          break;
        case 'UPDATE':
          if (k === 0) collectTables(m, k, res, true);
          break;
        case 'WHERE': if (tk.depth === 0 && !res.clauses.where) res.clauses.where = { start: tk.start, line: tk.line }; break;
        case 'GROUP': if (tk.depth === 0 && next && next.value.toUpperCase() === 'BY') res.clauses.group = { start: tk.start, line: tk.line }; setFlag('groupBy'); break;
        case 'HAVING': if (tk.depth === 0) res.clauses.having = { start: tk.start, line: tk.line }; setFlag('having'); break;
        case 'ORDER': if (next && next.value.toUpperCase() === 'BY') { if (tk.depth === 0) res.clauses.order = { start: tk.start, line: tk.line }; setFlag('orderBy'); } break;
        case 'CONNECT': if (next && next.value.toUpperCase() === 'BY') setFlag('connectBy'); break;
        case 'UNION': setFlag(next && next.value.toUpperCase() === 'ALL' ? 'unionAll' : 'union'); break;
        case 'MINUS': case 'INTERSECT': setFlag('setOp'); break;
        case 'EXISTS': setFlag(prev && prev.value.toUpperCase() === 'NOT' ? 'notExists' : 'exists'); break;
        case 'IN': setFlag(prev && prev.value.toUpperCase() === 'NOT' ? 'notIn' : 'in'); break;
        case 'LIKE': setFlag('like'); break;
        case 'ROWNUM': setFlag('rownum'); break;
        case 'WITH': if (k === 0) collectCtes(m, k, res); break;
        case 'DISTINCT': setFlag('distinct'); break;
        case 'CASE': setFlag('case'); break;
        case 'NULL': if (prev && prev.value.toUpperCase() === 'IS') setFlag('isNull'); break;
      }
      if (tk.type === 'operator' && tk.value === '(+)') setFlag('oracleOuterJoin');
    }
    if (!f.orderBy && res.type === 'SELECT') f.noOrderBy = 1;
    return res;
  }

  /** FROM / JOIN 뒤의 테이블 참조를 수집한다. */
  function collectTables(m, idx, res, single) {
    var i = idx + 1;
    while (i < m.length) {
      var t = m[i];
      if (t.type === 'punct' && t.value === '(') {
        // 인라인뷰 — 짝 맞춰 건너뛰고 별칭만 잡는다
        var d = 1, j = i + 1;
        while (j < m.length && d > 0) {
          if (m[j].type === 'punct' && m[j].value === '(') d++;
          else if (m[j].type === 'punct' && m[j].value === ')') d--;
          j++;
        }
        var ref = { name: '(inline view)', schema: null, alias: null, depth: t.depth, start: t.start, inline: true };
        if (j < m.length && (m[j].type === 'identifier' || m[j].type === 'quotedIdent')) ref.alias = m[j].value;
        res.tables.push(ref);
        i = j;
      } else if (t.type === 'identifier' || t.type === 'quotedIdent' || t.type === 'function') {
        var ref2 = { name: t.value, schema: null, alias: null, depth: t.depth, start: t.start };
        var j2 = i + 1;
        // schema.table
        if (j2 < m.length && m[j2].type === 'punct' && m[j2].value === '.') {
          var nx = m[j2 + 1];
          if (nx && (nx.type === 'identifier' || nx.type === 'quotedIdent')) {
            ref2.schema = ref2.name; ref2.name = nx.value; j2 += 2;
          }
        }
        // @dblink
        if (j2 < m.length && m[j2].type === 'punct' && m[j2].value === '@') {
          var lk = m[j2 + 1];
          if (lk) { ref2.dblink = lk.value; j2 += 2; }
        }
        // 별칭 (AS 생략 가능)
        var cand = m[j2];
        if (cand && cand.type === 'keyword' && cand.value.toUpperCase() === 'AS') { j2++; cand = m[j2]; }
        if (cand && (cand.type === 'identifier' || cand.type === 'quotedIdent')) { ref2.alias = cand.value; j2++; }
        res.tables.push(ref2);
        i = j2;
      } else { i++; continue; }

      // 콤마로 이어지면 계속, 아니면 종료
      var nt = m[i];
      if (!single && nt && nt.type === 'punct' && nt.value === ',') { i++; continue; }
      break;
    }
  }

  function collectCtes(m, idx, res) {
    var i = idx + 1;
    while (i < m.length) {
      var t = m[i];
      if (!(t.type === 'identifier' || t.type === 'quotedIdent')) break;
      var name = t.value;
      var j = i + 1;
      // 컬럼목록 (a,b,c) 건너뛰기
      if (m[j] && m[j].type === 'punct' && m[j].value === '(' && m[j + 1] && m[j + 1].value.toUpperCase() !== 'SELECT') {
        var d = 1; j++;
        while (j < m.length && d > 0) {
          if (m[j].type === 'punct' && m[j].value === '(') d++;
          else if (m[j].type === 'punct' && m[j].value === ')') d--;
          j++;
        }
      }
      if (m[j] && m[j].type === 'keyword' && m[j].value.toUpperCase() === 'AS') {
        res.ctes.push({ name: name, start: t.start });
        // 본문 건너뛰기
        var d2 = 0; j++;
        if (m[j] && m[j].value === '(') {
          d2 = 1; j++;
          while (j < m.length && d2 > 0) {
            if (m[j].type === 'punct' && m[j].value === '(') d2++;
            else if (m[j].type === 'punct' && m[j].value === ')') d2--;
            j++;
          }
        }
        if (m[j] && m[j].type === 'punct' && m[j].value === ',') { i = j + 1; continue; }
      }
      break;
    }
  }

  // ── 하이라이팅 ─────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 토큰 → CSS 클래스 (web/css/app.css 의 .sqlt-* 와 짝) */
  function cssClass(t) {
    switch (t.type) {
      case 'lineComment': case 'blockComment': return 'sqlt-comment';
      case 'hint': return 'sqlt-hint';
      case 'string': case 'qstring': return 'sqlt-string';
      case 'quotedIdent': return 'sqlt-qident';
      case 'number': return 'sqlt-number';
      case 'bind': return 'sqlt-bind';
      case 'subst': return 'sqlt-subst';
      case 'keyword': return 'sqlt-keyword';
      case 'function': return 'sqlt-func';
      case 'operator': return 'sqlt-op';
      case 'punct': return 'sqlt-punct';
      case 'identifier': return 'sqlt-ident';
      default: return 'sqlt-unknown';
    }
  }

  /** SQL 을 색상 span 이 붙은 HTML 로 만든다. 공백/개행은 그대로 보존한다. */
  function highlight(sql) {
    var toks = tokenize(sql);
    var html = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'ws') { html += escapeHtml(t.value); continue; }
      var cls = cssClass(t);
      if (t.unterminated) cls += ' sqlt-unterminated';
      html += '<span class="' + cls + '">' + escapeHtml(t.value) + '</span>';
    }
    return html;
  }

  // ── 포매터(간단 정렬) ──────────────────────────────────────────────────────
  var NEWLINE_BEFORE = ['SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'CONNECT', 'START',
    'UNION', 'MINUS', 'INTERSECT', 'VALUES', 'SET', 'INTO', 'MERGE', 'USING', 'WHEN', 'RETURNING', 'FETCH', 'OFFSET'];
  var NEWLINE_BEFORE_JOIN = ['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL'];

  /**
   * 가벼운 포매터. 완벽한 정렬이 아니라 "읽을 수 있게" 만드는 수준을 목표로 한다.
   * 주석·문자열·힌트는 원문 그대로 보존한다.
   */
  function format(sql, opts) {
    opts = opts || {};
    var indentUnit = opts.indent || '  ';
    var toks = tokenize(sql);
    var out = '';
    var depth = 0;
    var atLineStart = true;

    function nl() {
      if (!atLineStart) { out = out.replace(/[ \t]+$/, '') + '\n'; atLineStart = true; }
    }
    function indent() { if (atLineStart) { out += repeat(indentUnit, depth); atLineStart = false; } }
    function emit(s) { indent(); out += s; }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      var up = t.value.toUpperCase();

      if (t.type === 'ws') {
        if (t.value.indexOf('\n') >= 0) nl();
        else if (!atLineStart && !/[ \t]$/.test(out)) out += ' ';
        continue;
      }
      if (t.type === 'lineComment') { emit(t.value); nl(); continue; }
      if (t.type === 'blockComment' || t.type === 'hint') { emit(t.value); continue; }

      if (t.type === 'punct' && t.value === '(') { emit('('); depth++; continue; }
      if (t.type === 'punct' && t.value === ')') { depth = Math.max(0, depth - 1); nl(); emit(')'); continue; }
      if (t.type === 'punct' && t.value === ',') {
        out = out.replace(/[ \t]+$/, '');
        out += ',';
        nl();
        continue;
      }
      if (t.type === 'punct' && t.value === ';') { out = out.replace(/[ \t]+$/, ''); out += ';'; nl(); nl(); continue; }
      if (t.type === 'punct' && (t.value === '.' || t.value === '@')) { out = out.replace(/[ \t]+$/, ''); out += t.value; atLineStart = false; continue; }

      if (t.type === 'keyword') {
        if (NEWLINE_BEFORE.indexOf(up) >= 0 && t.depth === 0) { nl(); emit(up); out += ' '; continue; }
        if (NEWLINE_BEFORE_JOIN.indexOf(up) >= 0) { nl(); emit(up); out += ' '; continue; }
        if (up === 'AND' || up === 'OR') { nl(); emit(up); out += ' '; continue; }
        emit(up); out += ' '; continue;
      }
      // 앞 토큰이 '.' 이면 공백 없이 붙인다
      var prevCh = out.slice(-1);
      if (prevCh === '.' || prevCh === '@' || prevCh === '(') { indent(); out += t.value; }
      else { emit(t.value); }
      out += ' ';
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function repeat(s, n) { var r = ''; for (var i = 0; i < n; i++) r += s; return r; }

  return {
    tokenize: tokenize,
    meaningful: meaningful,
    stripComments: stripComments,
    splitStatements: splitStatements,
    statementAt: statementAt,
    classify: classify,
    extractBinds: extractBinds,
    extractSubstitutions: extractSubstitutions,
    normalize: normalize,
    fingerprint: fingerprint,
    hash32: hash32,
    analyze: analyze,
    highlight: highlight,
    cssClass: cssClass,
    escapeHtml: escapeHtml,
    format: format,
    KEYWORDS: KEYWORDS,
    FUNCTIONS: BUILTIN_FUNCS
  };
});
