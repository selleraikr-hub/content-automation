/**
 * dashboard.js — 로컬 자동화 대시보드 (매뉴얼 + 버튼 실행 + 실시간 로그)
 * 실행:  node dashboard.js   → 브라우저에서 http://localhost:3737
 * 추가 설치 불필요(Node 내장 http/child_process 사용).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');

const PORT = 3737;
const HTML = path.join(__dirname, 'dashboard.html');

// task -> 실행할 스크립트/인자 빌더
const TASKS = {
  'blog':        (q) => ['run_all.js', q.topic, ...(q.draft === '1' ? ['--draft'] : [])],
  'blog-gen':    (q) => ['generate.js', q.topic],
  'tiktok':      (q) => ['tiktok_all.js', q.topic, ...(q.publish === '1' ? ['--publish'] : [])],
  'cards':       ()  => ['cards.js'],
  'video':       ()  => ['make_video.js'],
  'naver-login': ()  => ['save_session.js'],
  'tiktok-login':()  => ['save_tiktok_session.js'],
  'threads-copy':(q) => ['threads_copy.js', q.topic],
  'threads-auto':(q) => ['threads_post.js', q.topic, ...(q.publish === '1' ? ['--publish'] : [])],
  'threads-login':() => ['save_threads_session.js'],
};
const NEED_TOPIC = ['blog', 'blog-gen', 'tiktok', 'threads-copy', 'threads-auto'];

function sse(res, line) {
  String(line).split(/\r?\n/).forEach((l) => { if (l !== '') res.write('data: ' + l + '\n\n'); });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/') {
    fs.readFile(HTML, (e, buf) => {
      if (e) { res.writeHead(500); return res.end('dashboard.html 없음'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  if (u.pathname === '/run') {
    const task = u.searchParams.get('task');
    const q = {
      topic: (u.searchParams.get('topic') || '').trim(),
      draft: u.searchParams.get('draft'),
      publish: u.searchParams.get('publish'),
    };
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

    const build = TASKS[task];
    if (!build) { sse(res, '❌ 알 수 없는 작업: ' + task); res.write('event: done\ndata: 1\n\n'); return res.end(); }
    if (NEED_TOPIC.includes(task) && !q.topic) { sse(res, '❌ 주제를 입력하세요.'); res.write('event: done\ndata: 1\n\n'); return res.end(); }

    const args = build(q).filter(Boolean);
    sse(res, '▶ node ' + args.join(' '));
    sse(res, '─'.repeat(40));

    let child;
    try {
      child = spawn('node', [path.join(__dirname, args[0]), ...args.slice(1)], { cwd: __dirname, env: process.env });
    } catch (err) {
      sse(res, '❌ 실행 실패: ' + err.message);
      res.write('event: done\ndata: 1\n\n'); return res.end();
    }
    child.stdout.on('data', (d) => sse(res, d));
    child.stderr.on('data', (d) => sse(res, d));
    child.on('close', (code) => { res.write('event: done\ndata: ' + (code || 0) + '\n\n'); res.end(); });
    child.on('error', (err) => { sse(res, '❌ ' + err.message); res.write('event: done\ndata: 1\n\n'); res.end(); });
    req.on('close', () => { try { child.kill(); } catch (_) {} });
    return;
  }

  if (u.pathname === '/history') {
    let hist = [];
    try { hist = JSON.parse(fs.readFileSync(path.join(__dirname, 'history.json'), 'utf-8')); } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(hist));
  }

  if (u.pathname === '/trends') {
    const fetchRss = (link, redir, cb) => {
      https.get(link, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r2) => {
        if ([301, 302, 303, 307, 308].includes(r2.statusCode) && r2.headers.location && redir < 4) {
          r2.resume(); return fetchRss(new URL(r2.headers.location, link).toString(), redir + 1, cb);
        }
        let d = ''; r2.on('data', (c) => d += c); r2.on('end', () => cb(d));
      }).on('error', () => cb(''));
    };
    fetchRss('https://trends.google.com/trending/rss?geo=KR', 0, (d) => {
      let items = [];
      try {
        items = [...d.matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)]
          .map(m => m[1].trim()).filter(Boolean)
          .filter(t => !/trends|google|일일 검색어|daily search/i.test(t))
          .slice(0, 20);
      } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(items));
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('='.repeat(46));
  console.log('🖥️  자동화 대시보드 실행 중');
  console.log('   브라우저에서 열기 →  http://localhost:' + PORT);
  console.log('   (끄려면 이 창에서 Ctrl+C)');
  console.log('='.repeat(46));
});
