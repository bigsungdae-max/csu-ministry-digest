// 카카오 리프레시 토큰을 암호화해서 저장소 파일(state/refresh_token.enc)에 보관합니다.
// 암호 키(TOKEN_KEY, 64자리 16진수)는 GitHub Secrets에만 있어서, 저장소가 공개여도 내용을 풀 수 없어요.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('./state/refresh_token.enc', import.meta.url);

function keyBuf() {
  const hex = process.env.TOKEN_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

// 저장된 토큰이 있으면 돌려주고, 없으면 null
export async function loadRefreshToken() {
  const key = keyBuf();
  if (!key) return null;
  let raw;
  try {
    raw = await readFile(FILE, 'utf8');
  } catch {
    return null;
  }
  const [iv, tag, data] = raw.trim().split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

// 새 토큰을 암호화해서 저장. 키가 없으면 false
export async function saveRefreshToken(token) {
  const key = keyBuf();
  if (!key) return false;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  const out = [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
  await mkdir(new URL('./state/', import.meta.url), { recursive: true });
  await writeFile(FILE, out + '\n');
  return true;
}
