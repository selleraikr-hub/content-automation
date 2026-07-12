/**
 * threads_dashboard.js — 스레드 전용 대시보드 (테마: 클로드/AI 자동화)
 * 실행: node threads_dashboard.js  → http://localhost:3800
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const naver = require('./naver');

const PORT = 3800;
const HTML = path.join(__dirname, 'threads_dashboard.html');

// publish==='1' 이면 실제 게시, 아니면 --dry(검토, 게시 직전 멈춤)
const pubOrDry = (q) => (q.publish === '1' ? [] : ['--dry']);
const TASKS = {
  // AI 자동화(요일 편성)
  'weekly': (q) => ['threads_weekly.js', ...(q.topic ? ['--topic', q.topic] : []), ...pubOrDry(q)],
  'reel':   (q) => ['threads_weekly.js', '--type', 'reel', ...(q.topic ? ['--topic', q.topic] : []), ...pubOrDry(q)],
  'info':   (q) => ['threads_weekly.js', '--type', 'info', ...(q.topic ? ['--topic', q.topic] : []), ...pubOrDry(q)],
  // 기존
  'copy':  (q) => ['threads_copy.js', q.topic, ...(q.url ? ['--url', q.url] : [])],
  'auto':  (q) => ['threads_post.js', q.topic, ...(q.url ? ['--url', q.url] : []), ...(q.publish === '1' ? ['--publish'] : [])],
  'growth':(q) => ['threads_post.js', q.topic, '--growth', ...(q.publish === '1' ? ['--publish'] : [])],
  'login': ()  => ['save_threads_session.js'],
};
function sse(res, line) { String(line).split(/\r?\n/).forEach((l) => { if (l !== '') res.write('data: ' + l + '\n\n'); }); }

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/') {
    fs.readFile(HTML, (e, buf) => { if (e) { res.writeHead(500); return res.end('html 없음'); } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(buf); });
    return;
  }

  if (u.pathname === '/trends') {
    const fetchRss = (link, redir, cb) => {
      https.get(link, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r2) => {
        if ([301, 302, 303, 307, 308].includes(r2.statusCode) && r2.headers.location && redir < 4) { r2.resume(); return fetchRss(new URL(r2.headers.location, link).toString(), redir + 1, cb); }
        let d = ''; r2.on('data', (c) => d += c); r2.on('end', () => cb(d));
      }).on('error', () => cb(''));
    };
    fetchRss('https://trends.google.com/trending/rss?geo=KR', 0, (d) => {
      let items = [];
      try { items = [...d.matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)].map(m => m[1].trim()).filter(Boolean).filter(t => !/trends|google|daily search|일일 검색어/i.test(t)).slice(0, 20); } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(items));
    });
    return;
  }

  if (u.pathname === '/naverkw') {
    const seed = (u.searchParams.get('seed') || '').trim();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (!seed) { return res.end('[]'); }
    naver.keywordVolumes([seed]).then((v) => {
      let out = [];
      if (v && v.withVol && v.withVol.length) out = v.withVol.slice(0, 24).map(k => ({ k: k.keyword, v: k.total }));
      else if (v && v.names) out = v.names.slice(0, 24).map(n => ({ k: n, v: null }));
      res.end(JSON.stringify(out));
    }).catch(() => res.end('[]'));
    return;
  }

  if (u.pathname === '/run') {
    const task = u.searchParams.get('task');
    const q = { topic: (u.searchParams.get('topic') || '').trim(), url: (u.searchParams.get('url') || '').trim(), publish: u.searchParams.get('publish') };
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const build = TASKS[task];
    if (!build) { sse(res, '❌ 알 수 없는 작업'); res.write('event: done\ndata: 1\n\n'); return res.end(); }
    if (['copy','auto','growth'].includes(task) && !q.topic) { sse(res, '❌ 키워드를 입력하세요.'); res.write('event: done\ndata: 1\n\n'); return res.end(); }
    const args = build(q).filter(Boolean);
    sse(res, '▶ node ' + args.join(' '));
    const child = spawn('node', [path.join(__dirname, args[0]), ...args.slice(1)], { cwd: __dirname, env: process.env });
    child.stdout.on('data', (d) => sse(res, d));
    child.stderr.on('data', (d) => sse(res, d));
    child.on('close', (code) => { res.write('event: done\ndata: ' + (code || 0) + '\n\n'); res.end(); });
    child.on('error', (err) => { sse(res, '❌ ' + err.message); res.write('event: done\ndata: 1\n\n'); res.end(); });
    req.on('close', () => { try { child.kill(); } catch (_) {} });
    return;
  }

  res.writeHead(404); res.end('not found');
}).listen(PORT, '127.0.0.1', () => {
  console.log('='.repeat(46));
  console.log('🧵 스레드 전용 대시보드 실행 중');
  console.log('   브라우저 →  http://localhost:' + PORT);
  console.log('='.repeat(46));
});
