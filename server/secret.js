'use strict';
/**
 * 접속 비밀번호 보관용 로컬 암호화.
 *
 * <p><b>보안 수준을 정직하게 밝힌다</b> — 키를 같은 PC(`config/secret.key`)에 두므로
 * 이 PC 를 장악한 공격자에게는 방어가 되지 않는다. 목적은
 * "설정 파일을 열었을 때 평문 비밀번호가 보이지 않게" 하는 것(어깨너머 노출·백업 유출 방지)이다.
 * 진짜 비밀이 필요하면 비밀번호를 저장하지 말고 접속할 때마다 입력하는 편이 낫다
 * (프로필의 `savePassword: false`).
 *
 * 알고리즘: AES-256-GCM (기밀성 + 무결성). 저장 형식: `v1:<iv>:<tag>:<cipher>` (모두 base64url)
 */

const crypto = require('crypto');
const fs = require('fs');
const P = require('./paths');

const PREFIX = 'v1';

let cachedKey = null;

/** 키 파일을 읽거나(없으면) 새로 만든다. */
function key() {
  if (cachedKey) return cachedKey;
  P.ensureDirs();
  try {
    const raw = fs.readFileSync(P.keyFile);
    if (raw.length >= 32) {
      cachedKey = raw.subarray(0, 32);
      return cachedKey;
    }
  } catch (e) { /* 없으면 만든다 */ }
  const k = crypto.randomBytes(32);
  fs.writeFileSync(P.keyFile, k, { mode: 0o600 });
  try {
    fs.chmodSync(P.keyFile, 0o600); // Windows 에서는 무시된다
  } catch (e) { /* noop */ }
  cachedKey = k;
  return cachedKey;
}

function b64(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** 평문 → 저장 문자열. 빈 값은 빈 값 그대로 둔다. */
function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [PREFIX, b64(iv), b64(c.getAuthTag()), b64(enc)].join(':');
}

/**
 * 저장 문자열 → 평문.
 * 형식이 아니면(구버전 평문 등) 입력을 그대로 돌려준다 — 마이그레이션 중 접속이 끊기지 않게.
 */
function decrypt(stored) {
  if (!stored) return '';
  const s = String(stored);
  if (!s.startsWith(PREFIX + ':')) return s;
  const parts = s.split(':');
  if (parts.length !== 4) return '';
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(), unb64(parts[1]));
    d.setAuthTag(unb64(parts[2]));
    return Buffer.concat([d.update(unb64(parts[3])), d.final()]).toString('utf8');
  } catch (e) {
    // 키가 바뀌었거나 파일이 손상됨 — 조용히 실패시키고 재입력을 유도한다
    return '';
  }
}

function isEncrypted(s) {
  return typeof s === 'string' && s.startsWith(PREFIX + ':');
}

module.exports = { encrypt, decrypt, isEncrypted };
