'use strict';
/**
 * SQL 라이브러리 — 작업 중인 SQL 을 이름 붙여 저장하고 목록에서 불러온다.
 *
 * <p>튜닝 이력(tuning-store)과 다르다. 이력은 "전/후 + 검증 결과"를 담은 <b>결과물</b>이고,
 * 라이브러리는 "자주 쓰는 원본 SQL"을 담는 <b>작업 재료함</b>이다. 그래서 파일도 따로 둔다
 * (<code>data/snippets/&lt;이름&gt;.sql</code>).
 *
 * <p>파일 첫머리에 메타데이터를 주석으로 남긴다. 이렇게 하면 저장 파일 자체가 그대로
 * 실행 가능한 .sql 이면서도 목록에 필요한 정보(설명·태그·수정시각)를 품는다.
 * <pre>
 *   --@ name: 주문 일별 집계
 *   --@ tags: 주문, 배치
 *   --@ desc: 야간 배치에서 자주 쓰는 집계 쿼리
 *   --@ updated: 2026-07-29T21:00:00.000Z
 *   &lt;본문 SQL&gt;
 * </pre>
 */

const fs = require('fs');
const path = require('path');
const P = require('./paths');
const logger = require('./logger');

const log = logger.forComponent('snippet-store');

/** 파일명으로 쓸 수 없는 문자를 정리한다(경로 탈출 방지 포함). */
function safeName(name) {
  const s = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\.+$/, '').slice(0, 120);
  if (!s) throw new Error('스니펫 이름이 비어 있습니다.');
  return s;
}

/**
 * 접속(scope)별 폴더명. SQL 은 특정 스키마·DB 에 종속되므로 접속마다 따로 보관한다.
 * 빈 값이면 공용함(_shared)에 담는다(접속 전에 작성해 둔 SQL 등).
 */
function safeScope(scope) {
  const s = String(scope || '').trim().replace(/[\\/:*?"<>|.]/g, '_').slice(0, 80);
  return s || '_shared';
}

function dirFor(scope) {
  const d = path.join(P.snippets, safeScope(scope));
  if (!P.isInside(P.snippets, d)) throw new Error('잘못된 경로입니다.');
  return d;
}

function fileFor(scope, name) {
  const f = path.join(dirFor(scope), `${safeName(name)}.sql`);
  if (!P.isInside(P.snippets, f)) throw new Error('잘못된 경로입니다.');
  return f;
}

const META_RE = /^--@\s*(\w+)\s*:\s*(.*)$/;

/** 파일 텍스트에서 메타 헤더와 본문을 분리한다. */
function parse(text) {
  const meta = { name: '', tags: [], desc: '', updated: null };
  const lines = String(text).split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(META_RE);
    if (!m) break;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'tags') meta.tags = val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [];
    else if (key === 'name') meta.name = val;
    else if (key === 'desc') meta.desc = val;
    else if (key === 'updated') meta.updated = val;
  }
  // 메타 다음의 빈 줄 한 개는 건너뛴다(본문 보기 좋게)
  if (lines[i] !== undefined && lines[i].trim() === '') i++;
  meta.sql = lines.slice(i).join('\n');
  return meta;
}

function serialize(rec) {
  const head = [
    `--@ name: ${rec.name}`,
    `--@ tags: ${(rec.tags || []).join(', ')}`,
    `--@ desc: ${(rec.desc || '').replace(/\n/g, ' ')}`,
    `--@ updated: ${rec.updated}`
  ].join('\n');
  return head + '\n\n' + String(rec.sql || '');
}

function preview(sql) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

/** 공용 스코프 — 어느 접속에서든 함께 보이는 SQL(데모·공통 쿼리 등). */
const SHARED = '_shared';

/**
 * 목록(본문 제외, 가벼운 요약). 수정시각 내림차순.
 *
 * <p>접속 스코프를 보고 있을 때는 <b>공용(_shared) 항목도 함께</b> 돌려준다.
 * 접속별로 나눠 관리하되(요구사항), 공용으로 둔 SQL 이 접속하는 순간 사라져 보이는
 * 혼란을 막기 위해서다. 공용 항목에는 shared=true 가 붙어 화면에서 구분된다.
 */
function list(scope, filter) {
  const own = listOne(scope, filter);
  if (safeScope(scope) === SHARED) return own;
  const shared = listOne(SHARED, filter).map((x) => ({ ...x, shared: true }));
  // 같은 이름이면 접속 전용이 우선(공용을 덮어쓴 것으로 본다)
  const names = new Set(own.map((x) => x.name));
  return own.concat(shared.filter((x) => !names.has(x.name)))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** 한 스코프 폴더만 읽는다. */
function listOne(scope, filter) {
  const dir = dirFor(scope);
  ensure(scope);
  const f = filter || {};
  let files;
  try {
    files = fs.readdirSync(dir).filter((x) => x.endsWith('.sql'));
  } catch (e) {
    return [];
  }
  const items = [];
  for (const fname of files) {
    try {
      const full = path.join(dir, fname);
      const text = fs.readFileSync(full, 'utf8');
      const meta = parse(text);
      const st = fs.statSync(full);
      const name = fname.replace(/\.sql$/, '');
      items.push({
        name,
        title: meta.name || name,
        tags: meta.tags,
        desc: meta.desc,
        preview: preview(meta.sql),
        lines: String(meta.sql).split('\n').length,
        updatedAt: meta.updated || st.mtime.toISOString(),
        size: st.size
      });
    } catch (e) {
      log.warn(`스니펫 읽기 실패: ${fname} (${e.message})`);
    }
  }
  let out = items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (f.q) {
    const q = String(f.q).toLowerCase();
    out = out.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      i.preview.toLowerCase().includes(q) ||
      (i.tags || []).some((t) => t.toLowerCase().includes(q)));
  }
  return out;
}

/**
 * 본문 포함 단건 조회.
 * 접속 스코프에 없으면 <b>공용(_shared)</b> 에서 찾는다(목록에 함께 보이므로 열 수도 있어야 한다).
 */
function get(scope, name) {
  const own = getOne(scope, name);
  if (own) return own;
  if (safeScope(scope) === SHARED) return null;
  const shared = getOne(SHARED, name);
  return shared ? { ...shared, shared: true } : null;
}

function getOne(scope, name) {
  ensure(scope);
  try {
    const text = fs.readFileSync(fileFor(scope, name), 'utf8');
    const meta = parse(text);
    return { name: safeName(name), title: meta.name || name, tags: meta.tags, desc: meta.desc, sql: meta.sql, updatedAt: meta.updated };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** 저장(신규/덮어쓰기). 이름을 바꾸면 옛 파일은 지운다. */
function save(scope, input) {
  ensure(scope);
  const name = safeName(input.name || input.title);
  const rec = {
    name,
    tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
    desc: input.desc || '',
    sql: input.sql || '',
    updated: new Date().toISOString()
  };
  const file = fileFor(scope, name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, serialize(rec), 'utf8');
  fs.renameSync(tmp, file);

  // 이름 변경(rename)인 경우 옛 파일 정리
  if (input.oldName && safeName(input.oldName) !== name) {
    try { fs.unlinkSync(fileFor(scope, input.oldName)); } catch (e) { /* 없으면 무시 */ }
  }
  log.info(`저장 스니펫 [${safeScope(scope)}] "${name}" (${rec.sql.length} chars)`);
  return { name, title: name, scope: safeScope(scope) };
}

/** 삭제. 접속 스코프에 없으면 공용에서 지운다(목록에 보이는 것을 지울 수 있어야 하므로). */
function remove(scope, name) {
  ensure(scope);
  const file = fileFor(scope, name);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    log.info(`삭제 스니펫 [${safeScope(scope)}] "${safeName(name)}"`);
    return true;
  }
  if (safeScope(scope) !== SHARED) {
    const sharedFile = fileFor(SHARED, name);
    if (fs.existsSync(sharedFile)) {
      fs.unlinkSync(sharedFile);
      log.info(`삭제 스니펫 [${SHARED}] "${safeName(name)}"`);
      return true;
    }
  }
  return false;
}

/** 접속별 폴더 목록(라이브러리가 어떤 접속의 SQL 들이 있는지 보여줄 때). */
function scopes() {
  try {
    return fs.readdirSync(P.snippets, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        let count = 0;
        try { count = fs.readdirSync(path.join(P.snippets, d.name)).filter((x) => x.endsWith('.sql')).length; } catch (e) { /* noop */ }
        return { scope: d.name, count };
      });
  } catch (e) {
    return [];
  }
}

function ensure(scope) {
  try { fs.mkdirSync(dirFor(scope), { recursive: true }); } catch (e) { /* 이미 있음 */ }
}

module.exports = { list, get, save, remove, scopes };
