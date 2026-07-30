'use strict';
/**
 * 파일 기반 저장소 구현 (현행 동작을 그대로 옮김 — 동작 변경 없음).
 *
 * tuning-store.js / snippet-store.js / connections.js 에 있던 fs 코드를 그대로
 * 옮겨왔다. ID 생성·기본값 병합·이력 누적·비밀번호 암호화 같은 "업무 로직"은
 * 옮기지 않았다 — 그건 여전히 파사드(각 store 모듈)의 책임이다. 여기 있는 건 순수한
 * "레코드를 어디에/어떻게 저장하느냐"뿐이다.
 */

const fs = require('fs');
const path = require('path');

function writeAtomicJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ── 튜닝 이력 ────────────────────────────────────────────────────────────

/**
 * @param {{tunings: string, toSummary: function}} opts
 * @returns {import('./repository').TuningRepo}
 */
function createTuningRepo({ tunings, toSummary, log }) {
  const INDEX_FILE = path.join(tunings, 'index.json');

  function fileFor(id) {
    if (!/^[A-Za-z0-9_\-.]+$/.test(String(id))) throw new Error(`잘못된 튜닝 ID: ${id}`);
    return path.join(tunings, `${id}.json`);
  }

  function rebuildIndex() {
    try {
      fs.mkdirSync(tunings, { recursive: true });
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const items = [];
    let files = [];
    try {
      files = fs.readdirSync(tunings).filter((f) => f.endsWith('.json') && f !== 'index.json');
    } catch (e) {
      if (log) log.error(`튜닝 디렉터리 읽기 실패: ${e.message}`);
      return [];
    }
    for (const f of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(tunings, f), 'utf8'));
        if (rec && rec.id) items.push(toSummary(rec));
      } catch (e) {
        if (log) log.warn(`손상된 튜닝 파일 건너뜀: ${f} (${e.message})`);
      }
    }
    items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    try {
      writeAtomicJson(INDEX_FILE, { version: 1, rebuiltAt: new Date().toISOString(), items });
    } catch (e) {
      if (log) log.warn(`인덱스 저장 실패(무시하고 진행): ${e.message}`);
    }
    return items;
  }

  function listSummaries() {
    try {
      const idx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      if (idx && Array.isArray(idx.items)) return idx.items;
    } catch (e) { /* 없으면 재생성 */ }
    return rebuildIndex();
  }

  function get(id) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(id), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  function save(rec) {
    try {
      fs.mkdirSync(tunings, { recursive: true });
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    writeAtomicJson(fileFor(rec.id), rec);
    return rec;
  }

  function remove(id) {
    const file = fileFor(id);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }

  /** 마이그레이션용 — 요약이 아닌 원본 레코드 전체를 훑는다. */
  function scanRaw() {
    let files = [];
    try {
      files = fs.readdirSync(tunings).filter((f) => f.endsWith('.json') && f !== 'index.json');
    } catch (e) {
      return [];
    }
    const out = [];
    for (const f of files) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(tunings, f), 'utf8'));
        if (rec && rec.id) out.push(rec);
      } catch (e) { /* 손상 파일은 건너뜀 */ }
    }
    return out;
  }

  return { listSummaries, get, save, remove, rebuildIndex, scanRaw };
}

// ── SQL 라이브러리(스니펫) ───────────────────────────────────────────────

const META_RE = /^--@\s*(\w+)\s*:\s*(.*)$/;

function parseSnippetText(text) {
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
  if (lines[i] !== undefined && lines[i].trim() === '') i++;
  meta.sql = lines.slice(i).join('\n');
  return meta;
}

function serializeSnippet(rec) {
  const head = [
    `--@ name: ${rec.title}`,
    `--@ tags: ${(rec.tags || []).join(', ')}`,
    `--@ desc: ${(rec.desc || '').replace(/\n/g, ' ')}`,
    `--@ updated: ${rec.updatedAt}`
  ].join('\n');
  return head + '\n\n' + String(rec.sql || '');
}

/**
 * @param {{snippets: string, isInside: function}} opts
 * @returns {import('./repository').SnippetRepo}
 */
function createSnippetRepo({ snippets, isInside, log }) {
  function dirFor(scope) {
    const d = path.join(snippets, scope);
    if (!isInside(snippets, d)) throw new Error('잘못된 경로입니다.');
    return d;
  }

  function fileFor(scope, name) {
    const f = path.join(dirFor(scope), `${name}.sql`);
    if (!isInside(snippets, f)) throw new Error('잘못된 경로입니다.');
    return f;
  }

  function ensure(scope) {
    try { fs.mkdirSync(dirFor(scope), { recursive: true }); } catch (e) { /* 이미 있음 */ }
  }

  function list(scope) {
    const dir = dirFor(scope);
    ensure(scope);
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
        const meta = parseSnippetText(text);
        const st = fs.statSync(full);
        const name = fname.replace(/\.sql$/, '');
        items.push({
          name,
          title: meta.name || name,
          tags: meta.tags,
          desc: meta.desc,
          sql: meta.sql,
          updatedAt: meta.updated || st.mtime.toISOString()
        });
      } catch (e) {
        if (log) log.warn(`스니펫 읽기 실패: ${fname} (${e.message})`);
      }
    }
    return items;
  }

  function get(scope, name) {
    ensure(scope);
    try {
      const text = fs.readFileSync(fileFor(scope, name), 'utf8');
      const meta = parseSnippetText(text);
      return { name, title: meta.name || name, tags: meta.tags, desc: meta.desc, sql: meta.sql, updatedAt: meta.updated };
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  function save(scope, name, rec) {
    ensure(scope);
    const file = fileFor(scope, name);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, serializeSnippet(rec), 'utf8');
    fs.renameSync(tmp, file);
  }

  function remove(scope, name) {
    const file = fileFor(scope, name);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }

  function scopes() {
    try {
      return fs.readdirSync(snippets, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          let count = 0;
          try { count = fs.readdirSync(path.join(snippets, d.name)).filter((x) => x.endsWith('.sql')).length; } catch (e) { /* noop */ }
          return { scope: d.name, count };
        });
    } catch (e) {
      return [];
    }
  }

  /** 마이그레이션용 — 모든 스코프의 모든 항목을 훑는다. */
  function scanRaw() {
    const out = [];
    for (const s of scopes()) {
      for (const item of list(s.scope)) out.push({ scope: s.scope, ...item });
    }
    return out;
  }

  return { list, get, save, remove, scopes, scanRaw };
}

// ── 접속 프로필 ──────────────────────────────────────────────────────────

/**
 * @param {{connectionsFile: string}} opts
 * @returns {import('./repository').ConnectionRepo}
 */
function createConnectionRepo({ connectionsFile, log }) {
  function readAll() {
    try {
      const raw = fs.readFileSync(connectionsFile, 'utf8');
      const data = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
      const list = Array.isArray(data) ? data : (data.connections || []);
      return list.filter((c) => c && typeof c === 'object');
    } catch (e) {
      if (e.code !== 'ENOENT' && log) log.error(`connections.json 읽기 실패: ${e.message}`);
      return [];
    }
  }

  function writeAll(list) {
    try {
      fs.mkdirSync(path.dirname(connectionsFile), { recursive: true });
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const tmp = connectionsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, connections: list }, null, 2), 'utf8');
    fs.renameSync(tmp, connectionsFile);
  }

  function get(id) {
    return readAll().find((c) => c.id === id) || null;
  }

  function save(rec) {
    const list = readAll();
    const idx = list.findIndex((c) => c.id === rec.id);
    if (idx >= 0) list[idx] = rec;
    else list.push(rec);
    writeAll(list);
  }

  function remove(id) {
    const list = readAll();
    const next = list.filter((c) => c.id !== id);
    if (next.length === list.length) return false;
    writeAll(next);
    return true;
  }

  return { list: readAll, get, save, remove };
}

module.exports = { createTuningRepo, createSnippetRepo, createConnectionRepo, parseSnippetText, serializeSnippet };
