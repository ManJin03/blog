// 会话签发与校验：HMAC-SHA256 签名的时间戳令牌，存放在 HttpOnly Cookie 中
const COOKIE_NAME = 'mj_session';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 天（秒）

function toB64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toB64Url(new Uint8Array(sig));
}

// 恒定时间字符串比较，防时序侧信道
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export async function createSessionToken(env) {
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const sig = await hmac(env.SESSION_SECRET, String(expires));
  return `${expires}.${sig}`;
}

export async function verifySession(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = parseCookie(request.headers.get('Cookie'), COOKIE_NAME);
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const expires = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d{1,15}$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = await hmac(env.SESSION_SECRET, expires);
  return safeEqual(sig, expected);
}

// 本地 http 调试时不加 Secure，否则浏览器会拒收 Cookie
function isLocalHost(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

export function sessionCookieHeader(request, token) {
  const secure = isLocalHost(request) ? '' : '; Secure';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function clearCookieHeader(request) {
  const secure = isLocalHost(request) ? '' : '; Secure';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
