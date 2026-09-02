// GitHub OAuth 工具：仅供 /api/login/github（发起授权）与 /api/login/github/callback（回调）使用
//
// 环境变量：
//   GITHUB_CLIENT_ID       —— GitHub OAuth App 的 Client ID（必填）
//   GITHUB_CLIENT_SECRET   —— GitHub OAuth App 的 Client secret（必填）
//   GITHUB_REDIRECT_URI    —— 回调地址（可选；缺省用当前请求 origin + /api/login/github/callback，
//                             需与 GitHub OAuth App 中登记的回调地址完全一致）
//
// 防 CSRF：授权前生成随机 state 写入 HttpOnly Cookie（10 分钟有效，SameSite=Lax），
// 回调时与 GitHub 带回的 state 比对，防止他人诱导注入登录会话。

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_API = 'https://api.github.com/user';

export const STATE_COOKIE = 'mj_oauth_state';
const STATE_MAX_AGE = 600; // 秒（10 分钟）
const OAUTH_SCOPE = 'read:user'; // 只需读取公开资料中的身份信息

export function oauthConfigured(env) {
  return !!(env && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

// 回调地址：优先使用环境变量，否则基于当前请求 origin 推导
export function callbackUrl(request, env) {
  if (env && env.GITHUB_REDIRECT_URI) return env.GITHUB_REDIRECT_URI;
  const url = new URL(request.url);
  return `${url.origin}/api/login/github/callback`;
}

export function randomState() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 拼装 GitHub 授权页地址
export function authorizeUrl({ clientId, redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

// 本地 http 调试时不加 Secure，否则浏览器会拒收 Cookie（与 _lib/auth.js 约定一致）
function isLocalHost(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

export function stateSetCookieHeader(request, state) {
  const secure = isLocalHost(request) ? '' : '; Secure';
  return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_MAX_AGE}${secure}`;
}

export function clearStateCookieHeader(request) {
  const secure = isLocalHost(request) ? '' : '; Secure';
  return `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
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

export function readStateCookie(request) {
  return parseCookie(request.headers.get('Cookie'), STATE_COOKIE);
}

// 用授权码换取访问令牌（Accept: application/json 时 GitHub 返回 JSON）
export async function exchangeToken(env, code, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'manjin-home/1.0 (+github-oauth)',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`GitHub token API HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || 'GitHub 未返回访问令牌');
  }
  return data.access_token;
}

// 拉取当前授权用户的公开资料（login 用于建号/匹配，html_url 用作主页链接与头像）
export async function fetchGithubUser(accessToken) {
  const res = await fetch(USER_API, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'manjin-home/1.0 (+github-oauth)',
    },
  });
  if (!res.ok) throw new Error(`GitHub user API HTTP ${res.status}`);
  return res.json();
}
