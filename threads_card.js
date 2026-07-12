/**
 * threads_card.js — 스레드용 "글자 짤 카드/프레임" 이미지 생성기
 *   - 배경: 실사진(Unsplash→Openverse→picsum) 위 어두운 오버레이 + 큰 글씨 (AI 티 줄임)
 *   - 사진 없으면 감성 그라데이션으로 자동 폴백
 *
 * 모듈:
 *   const { renderCard, fetchBg } = require('./threads_card');
 *   const bg = await fetchBg('tired office worker');   // 사진 URL
 *   await renderCard({ headline:'딱지', lines:['1줄','2줄'], bgUrl:bg }, out, { width:1080, height:1920 });
 *
 * 단독 테스트:
 *   node threads_card.js "큰 문구|2줄" --headline "MZ 특" --bg "coffee morning"
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('./config');

const HANDLE = process.env.THREADS_HANDLE || '';

const THEMES = [
  { bg: '#111111', accent: '#ffd34d' },
  { bg: 'linear-gradient(160deg,#1a1a2e,#16213e)', accent: '#8be9fd' },
  { bg: 'linear-gradient(160deg,#2b1055,#7597de)', accent: '#ffe066' },
  { bg: 'linear-gradient(160deg,#0f2027,#203a43,#2c5364)', accent: '#7ee8b0' },
  { bg: '#5b21b6', accent: '#ffe066' },
];

function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function pickTheme(seed) {
  let h = 0; const s = String(seed || Date.now());
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return THEMES[h % THEMES.length];
}

// 배경 사진 1장 검색 (Unsplash → Openverse → picsum)
async function fetchBg(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  if (CONFIG.UNSPLASH_ACCESS_KEY) {
    for (const qq of [q, q.split(/\s+/).slice(0, 2).join(' ')]) {
      try {
        const r = await fetch(
          'https://api.unsplash.com/search/photos?per_page=5&orientation=portrait&content_filter=high&query=' + encodeURIComponent(qq),
          { headers: { Authorization: 'Client-ID ' + CONFIG.UNSPLASH_ACCESS_KEY } }
        );
        const j = await r.json();
        const hit = j.results && j.results.find(x => x && x.urls && x.urls.regular);
        if (hit) return hit.urls.regular;
      } catch (_) {}
    }
  }
  try {
    const r = await fetch(
      'https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) + '&page_size=1&license_type=commercial&mature=false',
      { headers: { 'User-Agent': 'naver-bc-automation/2.0' } }
    );
    const j = await r.json();
    if (j.results && j.results[0] && j.results[0].url) return j.results[0].url;
  } catch (_) {}
  return 'https://picsum.photos/seed/' + encodeURIComponent(q) + '/1080/1920';
}

function cardHtml(card, theme, opts) {
  const W = opts.width, H = opts.height;
  const lines = (card.lines && card.lines.length ? card.lines : [String(card.text || card.title || '')]).slice(0, 4);
  const maxLen = Math.max(...lines.map(l => [...String(l)].length), 1);
  let size = Math.round(W * 0.092);          // 기본 큰 글씨
  if (maxLen > 14 || lines.length >= 3) size = Math.round(W * 0.078);
  if (maxLen > 20) size = Math.round(W * 0.064);
  const linesHtml = lines.map(l => '<div>' + esc(l) + '</div>').join('');
  const badge = card.headline ? '<div class="badge">' + esc(card.headline) + '</div>' : '';
  const mark = HANDLE ? '<div class="mark">' + esc(HANDLE) + '</div>' : '';

  // 배경: 사진이 있으면 어두운 오버레이 + cover, 없으면 그라데이션
  const bg = card.bgUrl
    ? "linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.78) 100%), url('" + card.bgUrl + "') center/cover no-repeat"
    : theme.bg;
  const textShadow = card.bgUrl ? '0 4px 24px rgba(0,0,0,.9),0 2px 6px rgba(0,0,0,.8)' : '0 2px 10px rgba(0,0,0,.35)';

  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + '*{margin:0;padding:0;box-sizing:border-box;}'
    + 'html,body{width:' + W + 'px;height:' + H + 'px;}'
    + '.card{width:' + W + 'px;height:' + H + 'px;background:' + bg + ';'
    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'padding:' + Math.round(H * 0.1) + 'px ' + Math.round(W * 0.09) + 'px;position:relative;text-align:center;'
    + "font-family:'Malgun Gothic','\\B9D1\\C740 \\ACE0\\B515','Apple SD Gothic Neo','Noto Sans KR',sans-serif;}"
    + '.badge{position:absolute;top:' + Math.round(H * 0.08) + 'px;left:50%;transform:translateX(-50%);'
    + 'background:' + theme.accent + ';color:#111;font-size:' + Math.round(W * 0.036) + 'px;font-weight:900;'
    + 'letter-spacing:1px;padding:14px 34px;border-radius:999px;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.3);}'
    + '.lines{font-size:' + size + 'px;font-weight:900;line-height:1.34;color:#fff;word-break:keep-all;text-shadow:' + textShadow + ';}'
    + '.lines div{margin:' + Math.round(size * 0.14) + 'px 0;}'
    + '.mark{position:absolute;bottom:' + Math.round(H * 0.055) + 'px;left:50%;transform:translateX(-50%);'
    + 'font-size:' + Math.round(W * 0.03) + 'px;font-weight:800;color:rgba(255,255,255,.8);letter-spacing:1px;text-shadow:0 2px 8px rgba(0,0,0,.8);}'
    + '</style></head><body><div class="card">' + badge + '<div class="lines">' + linesHtml + '</div>' + mark + '</div></body></html>';
}

async function renderCard(card, outPath, opts) {
  opts = opts || {};
  const W = opts.width || 1080, H = opts.height || 1350;
  const theme = pickTheme((card.lines || []).join('') + (card.headline || ''));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(cardHtml(card, theme, { width: W, height: H }), { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(400); // 배경 사진 로드 여유
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
  } finally { await browser.close(); }
  return outPath;
}

module.exports = { renderCard, fetchBg };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
  const headline = getArg('--headline') || '';
  const bgQ = getArg('--bg') || '';
  const raw = argv.filter(a => !a.startsWith('--') && a !== headline && a !== bgQ).join(' ').trim() || '여름에 양산 안 쓰면|3년 뒤 얼굴로 후회함';
  const lines = raw.split('|').map(s => s.trim()).filter(Boolean);
  const out = path.join(__dirname, 'threads_cards', 'card_' + Date.now() + '.png');
  (async () => {
    const bgUrl = bgQ ? await fetchBg(bgQ) : null;
    await renderCard({ headline, lines, bgUrl }, out, { width: 1080, height: 1350 });
    console.log('✅ 카드 생성: ' + out + (bgUrl ? '  (배경사진 O)' : '  (그라데이션)'));
  })().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
}
