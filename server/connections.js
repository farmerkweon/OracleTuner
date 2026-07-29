'use strict';
/**
 * 접속 프로필 저장소 (`config/connections.json`).
 *
 * - 비밀번호는 저장 시 암호화하고, 목록으로 내보낼 때는 아예 빼고 준다(브라우저로 흘리지 않는다).
 * - 실제 접속 시점에만 서버 안에서 복호화한다.
 * - 원자적 쓰기(temp → rename) 로 저장 중 프로세스가 죽어도 파일이 깨지지 않는다.
 */

const fs = require('fs');
const crypto = require('crypto');
const P = require('./paths');
const secret = require('./secret');
const logger = require('./logger');

const log = logger.forComponent('connections');

function newId() {
  return 'c' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

function readAll() {
  try {
    const raw = fs.readFileSync(P.connectionsFile, 'utf8');
    // 손으로 고친 파일에 BOM 이 붙어 있어도 읽히도록 한다
    const data = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    const list = Array.isArray(data) ? data : (data.connections || []);
    return list.filter((c) => c && typeof c === 'object');
  } catch (e) {
    if (e.code !== 'ENOENT') log.error(`connections.json 읽기 실패: ${e.message}`);
    return [];
  }
}

function writeAll(list) {
  P.ensureDirs();
  const tmp = P.connectionsFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, connections: list }, null, 2), 'utf8');
  fs.renameSync(tmp, P.connectionsFile);
}

/** 브라우저로 내보낼 형태 — 비밀번호 제거, 저장 여부만 표시. */
function toPublic(c) {
  const { password, ...rest } = c;
  return {
    ...rest,
    hasSavedPassword: !!password,
    url: buildUrl(c)
  };
}

/** 접속 URL 문자열(표시·확인용). 실제 조립은 Java 쪽에서도 한 번 더 한다. */
function buildUrl(c) {
  if (c.url && String(c.url).trim()) {
    const u = String(c.url).trim();
    return u.toLowerCase().startsWith('jdbc:') ? u : `jdbc:oracle:thin:@${u}`;
  }
  const host = c.host || 'localhost';
  const port = c.port || 1521;
  if (c.serviceName) return `jdbc:oracle:thin:@//${host}:${port}/${c.serviceName}`;
  if (c.sid) return `jdbc:oracle:thin:@${host}:${port}:${c.sid}`;
  return `jdbc:oracle:thin:@//${host}:${port}/`;
}

function list() {
  return readAll().map(toPublic);
}

function get(id) {
  return readAll().find((c) => c.id === id) || null;
}

/** 저장(신규/수정). password 가 오면 암호화해 넣고, 없으면 기존 값을 유지한다. */
function save(input) {
  const list = readAll();
  const now = new Date().toISOString();
  const idx = input.id ? list.findIndex((c) => c.id === input.id) : -1;
  const prev = idx >= 0 ? list[idx] : null;

  const rec = {
    id: input.id || newId(),
    name: String(input.name || '이름없는 접속').trim(),
    host: input.host || '',
    port: Number(input.port) || 1521,
    serviceName: input.serviceName || '',
    sid: input.sid || '',
    url: input.url || '',
    user: input.user || '',
    role: input.role || '',
    savePassword: input.savePassword !== false,
    color: input.color || '',
    note: input.note || '',
    /** 운영계 표시 — UI 가 빨간 배지를 띄우고 DML 실행 전 한 번 더 확인한다 */
    production: !!input.production,
    createdAt: prev ? prev.createdAt : now,
    updatedAt: now,
    lastConnectedAt: prev ? prev.lastConnectedAt : null,
    password: prev ? prev.password : ''
  };

  if (!rec.savePassword) {
    rec.password = '';
  } else if (typeof input.password === 'string' && input.password !== '') {
    rec.password = secret.encrypt(input.password);
  }

  if (idx >= 0) list[idx] = rec;
  else list.push(rec);
  writeAll(list);
  log.info(`${idx >= 0 ? '수정' : '생성'} 프로필 ${rec.id} (${rec.name})`);
  return toPublic(rec);
}

function remove(id) {
  const list = readAll();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  writeAll(next);
  log.info(`삭제 프로필 ${id}`);
  return true;
}

/** 접속 성공 시각 기록. */
function touch(id) {
  const list = readAll();
  const c = list.find((x) => x.id === id);
  if (!c) return;
  c.lastConnectedAt = new Date().toISOString();
  writeAll(list);
}

/**
 * 실제 접속에 쓸 파라미터를 만든다(비밀번호 복호화 포함).
 * @param {string} id 프로필 id
 * @param {string} [passwordOverride] 화면에서 직접 입력한 비밀번호(저장 안 하는 프로필용)
 */
function connectParams(id, passwordOverride) {
  const c = get(id);
  if (!c) throw new Error(`접속 프로필을 찾을 수 없습니다: ${id}`);
  const password = (passwordOverride !== undefined && passwordOverride !== null && passwordOverride !== '')
    ? passwordOverride
    : secret.decrypt(c.password);
  return {
    url: c.url || '',
    host: c.host,
    port: c.port,
    serviceName: c.serviceName,
    sid: c.sid,
    user: c.user,
    password,
    role: c.role,
    profileName: c.name,
    production: !!c.production
  };
}

module.exports = { list, get, save, remove, touch, connectParams, buildUrl, toPublic };
