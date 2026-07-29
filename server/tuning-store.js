'use strict';
/**
 * 튜닝 이력 저장소 (파일 기반).
 *
 * <p>DB 를 쓰지 않는다 — 튜닝 대상 DB 에 흔적을 남기지 않아야 하고, 사내 반출/공유가
 * 파일 복사만으로 되어야 하기 때문이다. 한 건이 한 파일(`data/tunings/<id>.json`)이라
 * 동시 수정 충돌이 사실상 없고, 형상관리(git)에 그대로 올릴 수 있다.
 *
 * <p>목록 조회용 인덱스(`index.json`)는 <b>캐시일 뿐</b>이다. 없거나 깨지면 디렉터리를
 * 다시 훑어 복구한다(멱등). 정본은 언제나 개별 파일이다.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('./paths');
const T = require('../shared/sql-tokenizer');
const logger = require('./logger');

const log = logger.forComponent('tuning-store');
const INDEX_FILE = path.join(P.tunings, 'index.json');

function newId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `T${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${crypto.randomBytes(2).toString('hex')}`;
}

function fileFor(id) {
  if (!/^[A-Za-z0-9_\-.]+$/.test(String(id))) throw new Error(`잘못된 튜닝 ID: ${id}`);
  return path.join(P.tunings, `${id}.json`);
}

function writeAtomic(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** 목록 표시에 필요한 만큼만 뽑는다(본문 SQL·계획은 제외해 목록이 가벼워지게). */
function toSummary(rec) {
  const beforeSql = (rec.before && rec.before.sql) || '';
  const afterSql = (rec.after && rec.after.sql) || '';
  const v = rec.verification || {};
  const perf = (rec.metrics && rec.metrics.delta) || {};
  const ref = rec.sqlRef || {};
  return {
    id: rec.id,
    title: rec.title || '(제목 없음)',
    status: rec.status || 'draft',
    tags: rec.tags || [],
    // 이 튜닝이 어느 저장 SQL(라이브러리 항목)의 이력인지 — 접속(scope)별로 관리된다
    sqlName: ref.name || '',
    sqlTitle: ref.title || '',
    sqlScope: ref.scope || '',
    connectionName: rec.connectionName || '',
    schema: rec.schema || '',
    sqlType: rec.sqlType || T.classify(beforeSql),
    fingerprint: rec.fingerprint || '',
    beforePreview: preview(beforeSql),
    afterPreview: preview(afterSql),
    hasAfter: !!afterSql,
    findingCount: (rec.findings || []).length,
    highCount: (rec.findings || []).filter((f) => f.severity === 'high').length,
    verdict: v.verdict || null,
    improvementPct: perf.improvementPct !== undefined ? perf.improvementPct : null,
    beforeMedianMs: perf.beforeMedianMs !== undefined ? perf.beforeMedianMs : null,
    afterMedianMs: perf.afterMedianMs !== undefined ? perf.afterMedianMs : null,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    note: rec.note || ''
  };
}

function preview(sql) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

/** 디렉터리를 훑어 인덱스를 다시 만든다. */
function rebuildIndex() {
  P.ensureDirs();
  const items = [];
  let files = [];
  try {
    files = fs.readdirSync(P.tunings).filter((f) => f.endsWith('.json') && f !== 'index.json');
  } catch (e) {
    log.error(`튜닝 디렉터리 읽기 실패: ${e.message}`);
    return [];
  }
  for (const f of files) {
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(P.tunings, f), 'utf8'));
      if (rec && rec.id) items.push(toSummary(rec));
    } catch (e) {
      log.warn(`손상된 튜닝 파일 건너뜀: ${f} (${e.message})`);
    }
  }
  items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  try {
    writeAtomic(INDEX_FILE, { version: 1, rebuiltAt: new Date().toISOString(), items });
  } catch (e) {
    log.warn(`인덱스 저장 실패(무시하고 진행): ${e.message}`);
  }
  return items;
}

function readIndex() {
  try {
    const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    if (idx && Array.isArray(idx.items)) return idx.items;
  } catch (e) { /* 없으면 재생성 */ }
  return rebuildIndex();
}

/**
 * 목록 조회.
 * @param {{q?:string, status?:string, tag?:string, connectionId?:string, limit?:number}} [filter]
 */
function list(filter) {
  const f = filter || {};
  let items = readIndex();
  if (f.q) {
    const q = String(f.q).toLowerCase();
    items = items.filter((i) =>
      String(i.title).toLowerCase().includes(q) ||
      String(i.beforePreview).toLowerCase().includes(q) ||
      String(i.afterPreview).toLowerCase().includes(q) ||
      String(i.note).toLowerCase().includes(q) ||
      (i.tags || []).some((t) => String(t).toLowerCase().includes(q)));
  }
  if (f.status) items = items.filter((i) => i.status === f.status);
  if (f.tag) items = items.filter((i) => (i.tags || []).includes(f.tag));
  // 특정 SQL(라이브러리 항목)의 이력만 — 접속(scope)과 이름이 함께 맞아야 한다
  if (f.sqlName) items = items.filter((i) => i.sqlName === f.sqlName && (!f.scope || i.sqlScope === f.scope));
  if (f.scope && !f.sqlName) items = items.filter((i) => i.sqlScope === f.scope);
  if (f.limit) items = items.slice(0, Number(f.limit));
  return items;
}

/** 접속(scope) 안에서 SQL 이름별 튜닝 이력 건수. SQL 목록에 배지로 표시한다. */
function countsBySql(scope) {
  const counts = {};
  for (const i of readIndex()) {
    if (!i.sqlName) continue;
    if (scope && i.sqlScope !== scope) continue;
    counts[i.sqlName] = (counts[i.sqlName] || 0) + 1;
  }
  return counts;
}

function get(id) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(id), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * 저장(신규/갱신). 부분 갱신을 지원한다 — 넘어온 키만 덮어쓴다.
 * 감사 추적을 위해 변경 이력(history)을 누적한다.
 */
function save(input) {
  P.ensureDirs();
  const now = new Date().toISOString();
  const id = input.id || newId();
  const prev = input.id ? get(input.id) : null;

  const rec = Object.assign({
    id,
    title: '',
    status: 'draft',
    tags: [],
    connectionId: '',
    connectionName: '',
    schema: '',
    before: { sql: '', plan: null, metrics: null },
    after: { sql: '', plan: null, metrics: null },
    metrics: null,
    verification: null,
    findings: [],
    note: '',
    createdAt: now,
    history: []
  }, prev || {});

  for (const k of Object.keys(input)) {
    if (k === 'id' || k === 'history' || k === 'createdAt') continue;
    rec[k] = input[k];
  }

  rec.updatedAt = now;
  rec.sqlType = T.classify((rec.before && rec.before.sql) || '');
  rec.fingerprint = rec.before && rec.before.sql ? T.fingerprint(rec.before.sql) : '';

  const action = prev ? 'update' : 'create';
  rec.history = (prev ? prev.history || [] : []).concat([{
    ts: now,
    action,
    status: rec.status,
    note: input.historyNote || ''
  }]).slice(-100);
  delete rec.historyNote;

  writeAtomic(fileFor(id), rec);
  rebuildIndex();
  log.info(`${action} 튜닝 ${id} (${rec.title || '제목없음'}) status=${rec.status}`);
  return rec;
}

function remove(id) {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return false;
  // 지우기 전에 백업 한 부를 남긴다 — 실수로 지운 튜닝은 되살릴 수 있어야 한다
  try {
    const trash = path.join(P.tunings, '.trash');
    fs.mkdirSync(trash, { recursive: true });
    fs.copyFileSync(file, path.join(trash, `${id}.${Date.now()}.json`));
  } catch (e) {
    log.warn(`백업 실패(삭제는 계속): ${e.message}`);
  }
  fs.unlinkSync(file);
  rebuildIndex();
  log.info(`삭제 튜닝 ${id}`);
  return true;
}

/** 태그 목록(빈도순). */
function tags() {
  const counts = new Map();
  for (const i of readIndex()) {
    for (const t of (i.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

// ── 내보내기 ───────────────────────────────────────────────────────────────

/** 사람이 읽는 보고서(Markdown). 리뷰 요청·인수인계에 그대로 쓴다. */
function toMarkdown(rec) {
  const L = [];
  const v = rec.verification || {};
  const d = (rec.metrics && rec.metrics.delta) || {};

  L.push(`# 튜닝 보고서: ${rec.title || rec.id}`);
  L.push('');
  L.push(`- ID: \`${rec.id}\``);
  L.push(`- 상태: ${statusLabel(rec.status)}`);
  L.push(`- 접속: ${rec.connectionName || '-'} / 스키마: ${rec.schema || '-'}`);
  L.push(`- 작성: ${rec.createdAt} · 수정: ${rec.updatedAt}`);
  if (rec.tags && rec.tags.length) L.push(`- 태그: ${rec.tags.map((t) => `\`${t}\``).join(' ')}`);
  L.push('');

  if (d.improvementPct !== undefined && d.improvementPct !== null) {
    L.push('## 성능 요약');
    L.push('');
    L.push('| 항목 | 튜닝 전 | 튜닝 후 | 개선 |');
    L.push('|---|---:|---:|---:|');
    L.push(`| 응답시간(중앙값) | ${fmtMs(d.beforeMedianMs)} | ${fmtMs(d.afterMedianMs)} | ${fmtPct(d.improvementPct)} |`);
    for (const s of (d.stats || [])) {
      L.push(`| ${s.name} | ${fmtNum(s.before)} | ${fmtNum(s.after)} | ${fmtPct(s.improvementPct)} |`);
    }
    L.push('');
  }

  if (v.verdict) {
    L.push('## 결과 동일성 검증');
    L.push('');
    L.push(`- 판정: **${v.verdictLabel || v.verdict}**`);
    L.push(`- 행수: 전 ${v.beforeRowCount} / 후 ${v.afterRowCount}`);
    if (v.beforeHash) L.push(`- 지문(순서포함): \`${short(v.beforeHash.ordered)}\` → \`${short((v.afterHash || {}).ordered)}\``);
    if (v.beforeHash) L.push(`- 지문(집합): \`${short(v.beforeHash.unordered)}\` → \`${short((v.afterHash || {}).unordered)}\``);
    if (v.note) L.push(`- 비고: ${v.note}`);
    L.push('');
  }

  L.push('## 튜닝 전 SQL');
  L.push('');
  L.push('```sql');
  L.push((rec.before && rec.before.sql) || '');
  L.push('```');
  L.push('');

  if (rec.after && rec.after.sql) {
    L.push('## 튜닝 후 SQL');
    L.push('');
    L.push('```sql');
    L.push(rec.after.sql);
    L.push('```');
    L.push('');
  }

  if (rec.findings && rec.findings.length) {
    L.push('## 진단 결과');
    L.push('');
    for (const f of rec.findings) {
      L.push(`### [${sevLabel(f.severity)}] ${f.title}`);
      L.push('');
      if (f.line) L.push(`- 위치: ${f.line}번째 줄`);
      L.push(`- 내용: ${stripHtml(f.detail)}`);
      L.push(`- 조치: ${stripHtml(f.suggestion)}`);
      L.push('');
    }
  }

  if (rec.before && rec.before.plan && rec.before.plan.text) {
    L.push('## 실행계획 (튜닝 전)');
    L.push('');
    L.push('```');
    L.push(rec.before.plan.text);
    L.push('```');
    L.push('');
  }
  if (rec.after && rec.after.plan && rec.after.plan.text) {
    L.push('## 실행계획 (튜닝 후)');
    L.push('');
    L.push('```');
    L.push(rec.after.plan.text);
    L.push('```');
    L.push('');
  }

  if (rec.note) {
    L.push('## 메모');
    L.push('');
    L.push(rec.note);
    L.push('');
  }
  return L.join('\n');
}

/** 실행 가능한 .sql 파일 형태(주석에 요약을 담는다). */
function toSqlFile(rec) {
  const d = (rec.metrics && rec.metrics.delta) || {};
  const v = rec.verification || {};
  const L = [];
  L.push('/* ============================================================');
  L.push(` * 튜닝: ${rec.title || rec.id}`);
  L.push(` * ID: ${rec.id}`);
  L.push(` * 작성: ${rec.createdAt}`);
  if (d.improvementPct !== undefined && d.improvementPct !== null) {
    L.push(` * 성능: ${fmtMs(d.beforeMedianMs)} → ${fmtMs(d.afterMedianMs)} (${fmtPct(d.improvementPct)})`);
  }
  if (v.verdict) L.push(` * 결과 동일성: ${v.verdictLabel || v.verdict}`);
  if (rec.note) L.push(` * 메모: ${String(rec.note).replace(/\*\//g, '* /')}`);
  L.push(' * ============================================================ */');
  L.push('');
  L.push('-- [BEFORE]');
  L.push('/*');
  L.push(String((rec.before && rec.before.sql) || '').replace(/\*\//g, '* /'));
  L.push('*/');
  L.push('');
  L.push('-- [AFTER]');
  L.push(String((rec.after && rec.after.sql) || (rec.before && rec.before.sql) || ''));
  L.push('');
  return L.join('\n');
}

function statusLabel(s) {
  return { draft: '작성중', verified: '검증완료', applied: '적용됨', rejected: '보류' }[s] || s;
}

function sevLabel(s) {
  return { high: '높음', medium: '보통', low: '낮음', info: '참고' }[s] || s;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '');
}

function short(h) {
  return h ? String(h).slice(0, 16) : '-';
}

function fmtMs(v) {
  return (v === null || v === undefined) ? '-' : `${Number(v).toFixed(1)} ms`;
}

function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  return `${n > 0 ? '▼ ' : n < 0 ? '▲ ' : ''}${Math.abs(n).toFixed(1)}%`;
}

function fmtNum(v) {
  return (v === null || v === undefined) ? '-' : Number(v).toLocaleString('ko-KR');
}

module.exports = { list, get, save, remove, tags, rebuildIndex, toMarkdown, toSqlFile, toSummary, countsBySql };
