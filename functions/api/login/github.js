// GET /api/login/github —— GitHub OAuth 登录（第一步）：跳转到 GitHub 授权页
// 点击"使用 GitHub 登录"后浏览器整页跳转到此接口，再被 302 到 GitHub。
// 未配置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 时返回友好错误页。
import {
  oauthConfigured,
  authorizeUrl,
  callbackUrl,
  randomState,
  stateSetCookieHeader,
} from '../../_lib/github-oauth.js';

export async function onRequestGet({ request, env }) {
  if (!oauthConfigured(env)) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>GitHub 登录未配置</title>' +
        '<body style="font-family:sans-serif;max-width:640px;margin:80px auto;line-height:1.8">' +
        '<h1>GitHub 登录未配置</h1>' +
        '<p>站点尚未配置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 环境变量，请参考 README 中的 GitHub OAuth 配置步骤。</p>' +
        '<p><a href="/">返回首页</a></p></body>',
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  const state = randomState();
  const location = authorizeUrl({
    clientId: env.GITHUB_CLIENT_ID,
    redirectUri: callbackUrl(request, env),
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': stateSetCookieHeader(request, state),
    },
  });
}
