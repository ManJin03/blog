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
        .replace(/&amp;/g, '&');
}

// 取标签内的文本
function tagText(block, name) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? m[1].trim() : '';
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
    return { title, url, excerpt, date };
}

export async function onRequestGet() {
    const now = Date.now();
    if (cache.data && now - cache.time < CACHE_TTL) {
        return json({ latestPost: cache.data });
    }
    try {
        const res = await fetch(FEED_URL, {
            headers: { 'user-agent': 'manjin-home/1.0 (+latest-post)' },
        });
        if (!res.ok) throw new Error(`feed ${res.status}`);
        const feed = parseFeed(await res.text());
        cache = { time: now, data: feed };
        return json({ latestPost: feed });
    } catch {
        // 抓取或解析失败不报错，前端会回退到本地配置
        return json({ latestPost: null }, 200, { 'cache-control': 'no-store' });
    }
}
