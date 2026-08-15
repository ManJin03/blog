// 最新文章接口：代理抓取技术博客的 RSS feed，返回最新一篇文章
// 技术博客无 CORS 头，前端无法直接跨域抓取，故由 Functions 在服务端代理
import { json } from '../_lib/http.js';
const BLOG_URL = 'https://tech-manjin.pages.dev/';
const FEED_URL = `${BLOG_URL}/feed.xml`;
// 内存缓存（单实例内有效，约 10 分钟），避免每次首页访问都重复抓取 feed
const CACHE_TTL = 10 * 60 * 1000;
let cache = { time: 0, data: null };

// 简单 XML 实体解码
function decodeXml(s = '') {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&amp;/g, '&');
}

// 取标签内的文本
function tagText(block, name) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? m[1].trim() : '';
}

// 取标签内所有同名子标签的文本（如 <category>，可能多个），去空去重
function tagList(block, name) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'ig');
    const tags = [];
    for (const m of block.matchAll(re)) {
        const t = decodeXml(m[1].trim());
        if (t && !tags.includes(t)) tags.push(t);
    }
    return tags;
}

function parseFeed(xml) {
    const item = xml.match(/<item[^>]*>[\s\S]*?<\/item>/i)?.[0];
    if (!item) return null;
    const title = decodeXml(tagText(item, 'title'));
    if (!title) return null;

    const rawLink = decodeXml(tagText(item, 'link'));
    const pubDate = decodeXml(tagText(item, 'pubDate'));
    let excerpt = decodeXml(tagText(item, 'description'))
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (excerpt.length > 140) excerpt = excerpt.slice(0, 140) + '…';

    let url = '';
    try {
        const u = new URL(rawLink, BLOG_URL);
        u.host = new URL(BLOG_URL).host;
        url = u.href;
    } catch { /* 保持默认 */ }

    let date = '';
    const d = new Date(pubDate);
    if (!Number.isNaN(d.getTime())) {
        date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    }

    // 新版 feed 用 <category> 携带文章标签
    const tags = tagList(item, 'category');
    return { title, url, excerpt, date, tags };
}

export async function onRequestGet() {
    const now = Date.now();
    if (cache.data && now - cache.time < CACHE_TTL) {
        return json({ latestPost: cache.data });
    }
    // 源站偶发返回无 <item> 的空 feed，最多重试 2 次再决定是否回退
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(FEED_URL, {
                headers: { 'user-agent': 'manjin-home/1.0 (+latest-post)' },
            });
            if (!res.ok) throw new Error(`feed ${res.status}`);
            const feed = parseFeed(await res.text());
            // 仅解析成功才写缓存，避免把 null 缓存 10 分钟导致持续抓取不到
            if (feed) {
                cache = { time: now, data: feed };
                return json({ latestPost: feed });
            }
        } catch { /* 本轮失败，继续重试 */ }
    }
    // 抓取或解析失败不报错，前端会回退到本地配置
    return json({ latestPost: null }, 200, { 'cache-control': 'no-store' });
}
