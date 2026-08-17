// 会话签发与校验：HMAC-SHA256 签名的时间戳令牌，存放在 HttpOnly Cookie 中
// 令牌携带用户身份（username + role），用于区分管理员与普通账号。
const COOKIE_NAME = 'mj_session';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 天（秒）

function toB64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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

// 身份 payload：{ username, role } → base64url 字符串（避免 username 含分隔符导致解析歧义）
function encodePayload(user) {
  return toB64Url(new TextEncoder().encode(JSON.stringify({ username: user.username, role: user.role })));
}

function decodePayload(s) {
  try {
    const json = new TextDecoder().decode(fromB64Url(s));
    const obj = JSON.parse(json);
    if (typeof obj.username !== 'string' || typeof obj.role !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

export async function createSessionToken(env, user) {
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = encodePayload(user);
  const sig = await hmac(env.SESSION_SECRET, `${expires}.${payload}`);
  return `${expires}.${payload}.${sig}`;
}

// 校验会话，成功返回 { username, role }，失败返回 null
export async function verifySession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const token = parseCookie(request.headers.get('Cookie'), COOKIE_NAME);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [expires, payload, sig] = parts;
  if (!/^\d{1,15}$/.test(expires) || Number(expires) < Date.now()) return null;
  const expected = await hmac(env.SESSION_SECRET, `${expires}.${payload}`);
  if (!safeEqual(sig, expected)) return null;
  return decodePayload(payload);
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
