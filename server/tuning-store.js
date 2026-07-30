'use strict';
/**
 * 튜닝 이력 저장소 — 파사드.
 *
 * <p>실제 저장은 server/repo/(json-file.js|sqlite.js) 가 한다(팩토리: server/repo/index.js).
 * 이 파일은 ID 생성, 기본값 병합, 변경 이력(history) 누적, 목록 필터링, 태그 집계,
 * Markdown/.sql 내보내기처럼 <b>저장 방식과 무관한 업무 로직</b>만 담당한다 — 그래서
 * 백엔드가 파일이든 SQLite 든 이 파일과 그 위(server/api.js)는 손댈 필요가 없다.
 *
 * <p>공개 함수 시그니처는 이관 전과 동일하다.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const T = require('../shared/sql-tokenizer');
const logger = require('./logger');
const repo = require('./repo');

const log = logger.forComponent('tuning-store');

function newId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `T${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${crypto.randomBytes(2).toString('hex')}`;
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

const tuningRepo = repo.createTuningRepo({ paths: P, log, toSummary });

function rebuildIndex() {
  return tuningRepo.rebuildIndex();
}

/**
 * 목록 조회.
 * @param {{q?:string, status?:string, tag?:string, connectionId?:string, limit?:number}} [filter]
 */
function list(filter) {
  const f = filter || {};
  let items = tuningRepo.listSummaries();
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
  for (const i of tuningRepo.listSummaries()) {
    if (!i.sqlName) continue;
    if (scope && i.sqlScope !== scope) continue;
    counts[i.sqlName] = (counts[i.sqlName] || 0) + 1;
  }
  return counts;
}

function get(id) {
  return tuningRepo.get(id);
}

/**
 * 저장(신규/갱신). 부분 갱신을 지원한다 — 넘어온 키만 덮어쓴다.
 * 감사 추적을 위해 변경 이력(history)을 누적한다.
 */
function save(input) {
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

  tuningRepo.save(rec);
  tuningRepo.rebuildIndex();
  log.info(`${action} 튜닝 ${id} (${rec.title || '제목없음'}) status=${rec.status}`);
  return rec;
}

/**
 * 삭제. 지우기 전에 휴지통에 백업 한 부를 남긴다(실수로 지운 튜닝은 되살릴 수 있어야 한다).
 * 이 안전장치는 저장 백엔드가 무엇이든(파일이든 SQLite 든) 동일하게 동작해야 하므로
 * repo 가 아니라 파사드에 둔다 — repo.get() 으로 레코드를 읽어 휴지통 파일로 써낸다.
 */
function remove(id) {
  const rec = get(id);
  if (!rec) return false;
  try {
    const trash = path.join(P.tunings, '.trash');
    fs.mkdirSync(trash, { recursive: true });
    fs.writeFileSync(path.join(trash, `${id}.${Date.now()}.json`), JSON.stringify(rec, null, 2), 'utf8');
  } catch (e) {
    log.warn(`백업 실패(삭제는 계속): ${e.message}`);
  }
  const ok = tuningRepo.remove(id);
  tuningRepo.rebuildIndex();
  if (ok) log.info(`삭제 튜닝 ${id}`);
  return ok;
}

/** 태그 목록(빈도순). */
function tags() {
  const counts = new Map();
  for (const i of tuningRepo.listSummaries()) {
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
