const USERNAME = 'ManJin03';
const year = 2026;
const url = `https://github.com/users/${USERNAME}/contributions?from=${year}-01-01&to=${year}-12-31`;

function parseYearHtml(html, year) {
  const raw = [];
  const tdRe = /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="([0-4])"[^>]*>/g;
  const tipRe = /<tool-tip[^>]*>([\s\S]*?)<\/tool-tip>/g;
  const tips = [];
  let m;
  while ((m = tipRe.exec(html))) tips.push(m[1].trim());
  let i = 0;
  while ((m = tdRe.exec(html))) {
    const date = m[1];
    const level = Number(m[2]);
    const tip = tips[i] || '';
    const cm = tip.match(/(\d+)\s+contributions?/);
    raw.push({ date, level, count: cm ? Number(cm[1]) : 0 });
    i++;
  }
  if (!raw.length) return { total: 0, days: [] };
  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const week0 = new Date(yearStart);
  week0.setUTCDate(week0.getUTCDate() - week0.getUTCDay());
  const DAY = 86400000;
  raw.forEach((d) => {
    const dt = new Date(`${d.date}T00:00:00Z`);
    d.row = dt.getUTCDay();
    d.col = Math.floor((dt - week0) / DAY / 7);
  });
  raw.sort((a, b) => a.col - b.col || a.row - b.row);
  const first = new Date(`${raw[0].date}T00:00:00Z`);
  const pad = [];
  for (let t = new Date(week0); t < first; t.setUTCDate(t.getUTCDate() + 1)) {
    pad.push({ date: t.toISOString().slice(0, 10), level: 0, count: 0 });
  }
  const days = pad.concat(raw).map(({ date, level, count }) => ({ date, level, count }));
  const totalRe = new RegExp(`([\\d,]+)\\s*\\n?\\s*contributions?\\s*\\n?\\s*in\\s*${year}`, 'i');
  const tm = html.match(totalRe);
  return { total: tm ? Number(tm[1].replace(/,/g, '')) : 0, days };
}

// 模拟前端 buildActivityMarkup 的月份标签逻辑（修复后：跳过跨年首列 12 月）
function monthColsOf(days) {
  const monthCols = [];
  days.forEach((d, i) => {
    const m = Number(d.date.slice(5, 7));
    const col = Math.floor(i / 7);
    if (col === 0 && m === 12) return;
    if (!monthCols.length || monthCols[monthCols.length - 1].m !== m) {
      monthCols.push({ m, col });
    }
  });
  return monthCols;
}

(async () => {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; ManJin-home/1.0)', 'accept': 'text/html' },
    redirect: 'follow',
  });
  const html = await res.text();
  const data = parseYearHtml(html, year);
  console.log('total:', data.total, '| days:', data.days.length);
  const mc = monthColsOf(data.days);
  console.log('monthCols(修复后):', JSON.stringify(mc));
  // 验证同一列不会出现两个标签
  const cols = mc.map((x) => x.col);
  console.log('col unique:', new Set(cols).size === cols.length, '| first label col:', mc[0].col, '-> Jan');
  // 宽屏 1320 布局：中栏约 760px，热力图内容宽 = cols*10 + (cols-1)*3
  const contentW = Math.ceil(data.days.length / 7) * 10 + (Math.ceil(data.days.length / 7) - 1) * 3;
  console.log('heatmap content width(10px cell):', contentW, 'px');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
