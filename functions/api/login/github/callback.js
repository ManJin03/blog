// GET /api/login/github/callback —— GitHub OAuth 登录（第二步）：处理授权回调
// 流程：校验 state（防 CSRF）→ 用 code 换访问令牌 → 拉取 GitHub 用户资料 →
//       匹配/自动创建普通账号（或命中管理员映射直接登录）→ 签发会话 Cookie → 302 跳回首页（?login=ok）
//
// 回调地址必须与 GitHub OAuth App 中登记的完全一致（缺省推导 + 可用 GITHUB_REDIRECT_URI 覆盖）。
// 跳回首页时通过 ?login= 参数告知前端结果：
//   ok        —— 登录成功（页面会刷新并通过 /api/me 拿到身份）
//   cancelled —— 用户在 GitHub 授权页取消
//   admin     —— 该 GitHub 用户名与密码管理员账号同名且未映射，请改用管理员密码登录
//   failed    —— 校验/换取/建号任一环节失败
//
// 管理员映射：若配置了 ADMIN_GITHUB_LOGIN 且 GitHub 用户名与之匹配（忽略大小写），
// 直接签发 role = 'admin' 会话（不入 KV、不建普通账号），与密码管理员同权；
// 未命中映射的 GitHub 登录一律按普通账号处理。
import {
  oauthConfigured,
  callbackUrl,
  readStateCookie,
  clearStateCookieHeader,
  exchangeToken,
  fetchGithubUser,
} from '../../../_lib/github-oauth.js';
import { createSessionToken, sessionCookieHeader } from '../../../_lib/auth.js';
import {
  isAdminUsername,
  isGithubAdmin,
  bindOrCreateGithubUser,
  findUserByGithub,
  deleteUser,
} from '../../../_lib/users.js';

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

  // 管理员映射：命中 ADMIN_GITHUB_LOGIN 时，该 GitHub 账号即为管理员，直接签发 admin 会话。
  const isGhAdmin = isGithubAdmin(env, login);
  // 未映射的 GitHub 登录一律按普通账号处理：若与密码管理员账号同名则拒绝（管理员请走
  // 密码登录或使用映射的 GitHub 账号），避免出现两套同名身份。
  if (!isGhAdmin && isAdminUsername(env, login)) return fail('admin');

  let username;
  let role = 'user';
  if (isGhAdmin) {
    // 映射管理员：不写入 KV，会话携带其 GitHub 用户名（/api/me 会按映射补全资料）
    username = login;
    role = 'admin';
    // 清理历史遗留的"同名普通账号"：该 GitHub 身份此前自动建号/预建过的普通账号
    // 今后只会命中管理员映射，已无意义；评论等数据内嵌在帖子中不受影响。
    // 仅限拥有该 GitHub 账号的人能触发（GitHub 登录名全局唯一），清理失败不影响登录。
    if (env.KV) {
      try {
        const dup = await findUserByGithub(env, login);
        if (dup && !isAdminUsername(env, dup.username)) {
          await deleteUser(env, dup.username);
        }
      } catch {
        /* 忽略清理失败 */
      }
    }
  } else {
    let user;
    try {
      const result = await bindOrCreateGithubUser(env, { login, githubUrl });
      user = result && result.user;
    } catch {
      /* KV 读写失败按登录失败处理 */
    }
    if (!user || !user.username) return fail('failed');
    username = user.username;
  }

  const token = await createSessionToken(env, { username, role });
  const headers = new Headers();
  headers.set('location', `${home}?login=ok`);
  headers.append('set-cookie', clearStateCookie);
  headers.append('set-cookie', sessionCookieHeader(request, token));
  return new Response(null, { status: 302, headers });
}
