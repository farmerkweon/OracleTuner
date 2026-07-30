'use strict';
/**
 * SQL 라이브러리 — 작업 중인 SQL 을 이름 붙여 저장하고 목록에서 불러온다. 파사드.
 *
 * <p>튜닝 이력(tuning-store)과 다르다. 이력은 "전/후 + 검증 결과"를 담은 <b>결과물</b>이고,
 * 라이브러리는 "자주 쓰는 원본 SQL"을 담는 <b>작업 재료함</b>이다.
 *
 * <p>이름·스코프 정제(경로 탈출 방지 포함), 공용(_shared) 폴백/병합, 이름변경 시 옛 항목
 * 정리 같은 업무 로직은 여기 남는다. 실제 저장은 server/repo/(json-file.js|sqlite.js) 가
 * 한다(팩토리: server/repo/index.js). 공개 함수 시그니처는 이관 전과 동일하다.
 */

const P = require('./paths');
const logger = require('./logger');
const repo = require('./repo');

const log = logger.forComponent('snippet-store');

/** 공용 스코프 — 어느 접속에서든 함께 보이는 SQL(데모·공통 쿼리 등). */
const SHARED = '_shared';

/** 파일명으로 쓸 수 없는 문자를 정리한다(경로 탈출 방지 포함). */
function safeName(name) {
  const s = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\.+$/, '').slice(0, 120);
  if (!s) throw new Error('스니펫 이름이 비어 있습니다.');
  return s;
}

/**
 * 접속(scope)별 이름. SQL 은 특정 스키마·DB 에 종속되므로 접속마다 따로 보관한다.
 * 빈 값이면 공용함(_shared)에 담는다(접속 전에 작성해 둔 SQL 등).
 */
function safeScope(scope) {
  const s = String(scope || '').trim().replace(/[\\/:*?"<>|.]/g, '_').slice(0, 80);
  return s || SHARED;
}

function preview(sql) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

const snippetRepo = repo.createSnippetRepo({ paths: P, log });

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

/** 한 스코프만 읽는다. */
function listOne(scope, filter) {
  const f = filter || {};
  const raw = snippetRepo.list(safeScope(scope));
  let out = raw.map((meta) => ({
    name: meta.name,
    title: meta.title || meta.name,
    tags: meta.tags || [],
    desc: meta.desc || '',
    preview: preview(meta.sql),
    lines: String(meta.sql || '').split('\n').length,
    updatedAt: meta.updatedAt
  })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
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
  const meta = snippetRepo.get(safeScope(scope), safeName(name));
  if (!meta) return null;
  return { name: meta.name, title: meta.title || meta.name, tags: meta.tags || [], desc: meta.desc || '', sql: meta.sql || '', updatedAt: meta.updatedAt };
}

/** 저장(신규/덮어쓰기). 이름을 바꾸면 옛 파일은 지운다. */
function save(scope, input) {
  const s = safeScope(scope);
  const name = safeName(input.name || input.title);
  const rec = {
    title: name,
    tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(',').map((x) => x.trim()).filter(Boolean),
    desc: input.desc || '',
    sql: input.sql || '',
    updatedAt: new Date().toISOString()
  };
  snippetRepo.save(s, name, rec);

  // 이름 변경(rename)인 경우 옛 항목 정리
  if (input.oldName && safeName(input.oldName) !== name) {
    try { snippetRepo.remove(s, safeName(input.oldName)); } catch (e) { /* 없으면 무시 */ }
  }
  log.info(`저장 스니펫 [${s}] "${name}" (${rec.sql.length} chars)`);
  return { name, title: name, scope: s };
}

/** 삭제. 접속 스코프에 없으면 공용에서 지운다(목록에 보이는 것을 지울 수 있어야 하므로). */
function remove(scope, name) {
  const s = safeScope(scope);
  const n = safeName(name);
  if (snippetRepo.remove(s, n)) {
    log.info(`삭제 스니펫 [${s}] "${n}"`);
    return true;
  }
  if (s !== SHARED && snippetRepo.remove(SHARED, n)) {
    log.info(`삭제 스니펫 [${SHARED}] "${n}"`);
    return true;
  }
  return false;
}

/** 접속별 스코프 목록(라이브러리가 어떤 접속의 SQL 들이 있는지 보여줄 때). */
function scopes() {
  return snippetRepo.scopes();
}

module.exports = { list, get, save, remove, scopes };
