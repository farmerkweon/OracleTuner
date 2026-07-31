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

/**
 * <b>저장 키</b>(파일명·URL 경로에 쓰는 식별자)를 만든다. 경로 탈출 방지 포함.
 *
 * <p>⚠ 이 값은 <b>화면에 보여 주는 이름이 아니다.</b> 윈도우 파일명 금지문자(`* / : ? " < > |`)를
 * `_` 로 바꾸므로 `SELECT *` 가 `SELECT _` 가 되고 `순서/방식` 이 `순서_방식` 이 된다.
 * 표시명은 {@link displayTitle} 이 만드는 `title` 이고 원문을 그대로 지킨다.
 * (QA-SWEEP D04 — 새니타이즈가 표시명까지 먹어 예제의 뜻이 망가지던 결함)
 */
function safeName(name) {
  const s = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\.+$/, '').slice(0, 120);
  if (!s) throw new Error('스니펫 이름이 비어 있습니다.');
  return s;
}

/**
 * <b>표시 이름</b>. `*` 와 `/` 를 포함해 사용자가 적은 그대로 지킨다 — `SELECT *` 는 SQL 의
 * 핵심 표기라 훼손되면 예제의 뜻 자체가 망가진다.
 *
 * <p>다만 파일 저장 형식이 `--@ name: …` <b>한 줄</b> 헤더라서(repo/json-file.js) 줄바꿈·제어문자만
 * 공백으로 눕힌다. 그 외에는 아무것도 바꾸지 않는다.
 */
function displayTitle(name) {
  return String(name || '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
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

/**
 * 저장(신규/덮어쓰기). 이름을 바꾸면 옛 파일은 지운다.
 *
 * <p><b>표시명(title)과 저장 키(name)를 분리한다</b> — 원문은 title 에 그대로 남고,
 * 파일명·URL 경로에 쓰는 키만 안전하게 깎는다. 예전에는 title 에도 깎인 이름을 넣어
 * `④ SELECT * (…)` 가 목록에 `④ SELECT _ (…)` 로 뜨고 `순서/방식` 이 `순서_방식` 이 됐다
 * (QA-SWEEP D04). 저장소(repo/json-file.js·sqlite.js)는 이미 두 값을 따로 보관하고 있었고,
 * 화면도 이미 title 을 그린다(library.js) — 여기 한 줄이 유일한 훼손 지점이었다.
 */
function save(scope, input) {
  const s = safeScope(scope);
  const raw = input.name || input.title;
  const name = safeName(raw);
  const rec = {
    title: displayTitle(raw) || name,
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
  log.info(`저장 스니펫 [${s}] "${rec.title}" (키: ${name}, ${rec.sql.length} chars)`);
  return { name, title: rec.title, scope: s };
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
