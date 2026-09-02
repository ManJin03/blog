// GET /api/login/github/callback —— GitHub OAuth 登录（第二步）：处理授权回调
// 流程：校验 state（防 CSRF）→ 用 code 换访问令牌 → 拉取 GitHub 用户资料 →
//       匹配/自动创建普通账号 → 签发会话 Cookie → 302 跳回首页（?login=ok）
//
// 回调地址必须与 GitHub OAuth App 中登记的完全一致（缺省推导 + 可用 GITHUB_REDIRECT_URI 覆盖）。
// 跳回首页时通过 ?login= 参数告知前端结果：
//   ok        —— 登录成功（页面会刷新并通过 /api/me 拿到身份）
//   cancelled —— 用户在 GitHub 授权页取消
//   admin     —— 该 GitHub 用户名与管理员账号同名，请改用管理员密码登录
//   failed    —— 校验/换取/建号任一环节失败
import {
  oauthConfigured,
  callbackUrl,
  readStateCookie,
  clearStateCookieHeader,
  exchangeToken,
  fetchGithubUser,
} from '../../../_lib/github-oauth.js';
import { createSessionToken, sessionCookieHeader } from '../../../_lib/auth.js';
import { isAdminUsername, bindOrCreateGithubUser } from '../../../_lib/users.js';

function redirectWith(location, extraHeaders) {
  const headers = { location };
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers[k] = v;
  }
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  if (!oauthConfigured(env)) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>GitHub 登录未配置</title>' +
        '<body style="font-family:sans-serif;max-width:640px;margin:80px auto;line-height:1.8">' +
        '<h1>GitHub 登录未配置</h1>' +
        '<p>请先配置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 环境变量，并核对 OAuth App 回调地址。</p>' +
        '<p><a href="/">返回首页</a></p></body>',
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  const home = `${origin}/`;
  const url = new URL(request.url);
  const clearStateCookie = clearStateCookieHeader(request);
  // 所有失败出口统一清除 state Cookie
  const fail = (code) => redirectWith(`${home}?login=${code}`, { 'set-cookie': clearStateCookie });

  // 用户在 GitHub 授权页点了"取消"
  if (url.searchParams.get('error')) return fail('cancelled');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stateCookie = readStateCookie(request);
  // 缺少 code / state 或 state 与 Cookie 不一致：防 CSRF，一律失败
  if (!code || !state || !stateCookie || state !== stateCookie) return fail('failed');

  let profile;
  try {
    const token = await exchangeToken(env, code, callbackUrl(request, env));
    profile = await fetchGithubUser(token);
  } catch {
    return fail('failed');
  }

  const login = typeof profile?.login === 'string' ? profile.login.trim() : '';
  const githubUrl = typeof profile?.html_url === 'string' ? profile.html_url : '';
  if (!login) return fail('failed');

  // GitHub 登录一律按普通账号处理：若与管理员账号同名则拒绝，管理员必须走密码登录，
  // 避免普通账号身份（role: user）被 /api/me 误判为管理员。
  if (isAdminUsername(env, login)) return fail('admin');

  let user;
  try {
    const result = await bindOrCreateGithubUser(env, { login, githubUrl });
    user = result && result.user;
  } catch {
    /* KV 读写失败按登录失败处理 */
  }
  if (!user || !user.username) return fail('failed');

  const token = await createSessionToken(env, { username: user.username, role: 'user' });
  const headers = new Headers();
  headers.set('location', `${home}?login=ok`);
  headers.append('set-cookie', clearStateCookie);
  headers.append('set-cookie', sessionCookieHeader(request, token));
  return new Response(null, { status: 302, headers });
}
