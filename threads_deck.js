/**
 * threads_deck.js — 정교한 "인포그래픽 덱"(정보성 캐러셀) 이미지 생성
 *   표지 + 번호 스텝(번호뱃지/태그/불릿) + CTA 를 다크+오렌지 브랜드 톤으로 렌더(1080x1350).
 *   클로드/AI 사용법·자동화 정보글로 저장·팔로우 유발용.
 *
 * 모듈:  const { buildDeck } = require('./threads_deck');
 *        await buildDeck('클로드 제대로 쓰는 법');                 (AI 생성)
 *        await buildDeck(null, { deckFile: 'deck_x.json' });        (내 JSON 그대로)
 * 단독:
 *   node threads_deck.js "클로드 제대로 쓰는 6가지 방법"          (AI 생성, 이미지만)
 *   node threads_deck.js --file deck_claude_start.json            (내 JSON 그대로)
 *   node threads_deck.js --file deck_claude_start.json --post           (+게시 검토)
 *   node threads_deck.js --file deck_claude_start.json --post --publish  (+실제 게시)
 *
 * deck JSON: { "cover":{"headline":"","sub":""}, "steps":[{"title":"","tag":"","bullets":["",""]}],
 *             "cta":{"headline":"","sub":""}, "caption":"..." }
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const { infoDeckPrompt } = require('./prompts');
const { askClaude } = require('./generate');

const CARD_DIR = path.join(__dirname, 'threads_cards');
const W = 1080, H = 1350;
const HANDLE = process.env.THREADS_HANDLE || '';
const ACCENT = '#FF7A45';

function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function extractJson(t) {
  t = String(t).replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('덱 JSON 파싱 실패');
  return JSON.parse(t.slice(s, e + 1));
}

// deck -> 카드 배열(cover, step..., cta)
function toCards(deck) {
  const cards = [];
  if (deck.cover) cards.push(Object.assign({ kind: 'cover' }, deck.cover));
  (deck.steps || []).forEach((s, i) => cards.push(Object.assign({ kind: 'step', num: i + 1 }, s)));
  if (deck.cta) cards.push(Object.assign({ kind: 'cta' }, deck.cta));
  return cards;
}

const BASE = `*{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:${W}px;height:${H}px;}
  .card{width:${W}px;height:${H}px;position:relative;overflow:hidden;
    background:radial-gradient(120% 80% at 85% 0%, #2a2018 0%, #17130f 45%, #100d0b 100%);
    font-family:'Malgun Gothic','\\B9D1\\C740 \\ACE0\\B515','Apple SD Gothic Neo','Noto Sans KR',sans-serif;
    color:#fff;padding:96px 84px;display:flex;flex-direction:column;}
  .burst{position:absolute;top:70px;right:78px;width:150px;height:150px;opacity:.95}
  .foot{position:absolute;left:84px;right:84px;bottom:60px;display:flex;justify-content:space-between;
    align-items:center;font-size:30px;font-weight:800;color:rgba(255,255,255,.45);}
  .foot .h{color:${ACCENT};}
  .kicker{color:${ACCENT};font-size:34px;font-weight:900;letter-spacing:1px;margin-bottom:26px;}
  .cover-h{font-size:104px;font-weight:900;line-height:1.16;word-break:keep-all;}
  .bar{width:120px;height:12px;background:${ACCENT};border-radius:999px;margin:40px 0 34px;}
  .cover-sub{font-size:44px;font-weight:600;color:rgba(255,255,255,.7);word-break:keep-all;line-height:1.45;}
  .numrow{display:flex;align-items:center;gap:22px;margin-bottom:44px;}
  .num{width:104px;height:104px;border-radius:26px;background:${ACCENT};color:#1a120c;
    font-size:60px;font-weight:900;display:flex;align-items:center;justify-content:center;flex:0 0 auto;box-shadow:0 10px 30px rgba(255,122,69,.35);}
  .tag{font-size:34px;font-weight:800;color:${ACCENT};background:rgba(255,122,69,.14);
    border:2px solid rgba(255,122,69,.5);padding:12px 24px;border-radius:999px;word-break:keep-all;}
  .title{font-size:70px;font-weight:900;line-height:1.24;word-break:keep-all;margin-bottom:52px;}
  .bul{display:flex;flex-direction:column;gap:30px;}
  .bul .li{display:flex;align-items:flex-start;gap:22px;font-size:46px;font-weight:600;color:rgba(255,255,255,.9);word-break:keep-all;line-height:1.35;}
  .bul .dot{width:20px;height:20px;border-radius:50%;background:${ACCENT};margin-top:20px;flex:0 0 auto;}
  .mid{flex:1;display:flex;flex-direction:column;justify-content:center;}
  .center{align-items:center;text-align:center;}
  .cta-h{font-size:84px;font-weight:900;line-height:1.2;word-break:keep-all;}
  .cta-sub{font-size:44px;font-weight:700;color:${ACCENT};margin-top:28px;word-break:keep-all;}`;

const BURST = '<svg class="burst" viewBox="0 0 100 100"><g fill="' + ACCENT + '">'
  + Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; const x = 50 + 46 * Math.cos(a), y = 50 + 46 * Math.sin(a); return '<rect x="47" y="8" width="6" height="34" rx="3" transform="rotate(' + (i * 30) + ' 50 50)"/>'; }).join('')
  + '<circle cx="50" cy="50" r="10"/></g></svg>';

function coverHtml(c, total) {
  return '<div class="card">' + BURST
    + '<div class="mid">'
    + '<div class="kicker">CLAUDE · AI 자동화</div>'
    + '<div class="cover-h">' + esc(c.headline) + '</div>'
    + '<div class="bar"></div>'
    + (c.sub ? '<div class="cover-sub">' + esc(c.sub) + '</div>' : '')
    + '</div>'
    + '<div class="foot"><span class="h">' + (HANDLE ? esc(HANDLE) : '넘겨보기 →') + '</span><span>SWIPE</span></div>'
    + '</div>';
}

function stepHtml(c, idx, total) {
  const bullets = (c.bullets || []).slice(0, 4).map(b => '<div class="li"><span class="dot"></span><span>' + esc(b) + '</span></div>').join('');
  return '<div class="card">'
    + '<div class="mid">'
    + '<div class="numrow"><div class="num">' + c.num + '</div>' + (c.tag ? '<div class="tag">' + esc(c.tag) + '</div>' : '') + '</div>'
    + '<div class="title">' + esc(c.title) + '</div>'
    + '<div class="bul">' + bullets + '</div>'
    + '</div>'
    + '<div class="foot"><span class="h">' + (HANDLE ? esc(HANDLE) : 'CLAUDE 가이드') + '</span><span>' + idx + ' / ' + total + '</span></div>'
    + '</div>';
}

function ctaHtml(c, total) {
  return '<div class="card">' + BURST
    + '<div class="mid center">'
    + '<div class="cta-h">' + esc(c.headline || '저장하고 하나씩 따라하기') + '</div>'
    + '<div class="cta-sub">' + esc(c.sub || '팔로우하면 클로드 꿀팁 더 옴') + '</div>'
    + '</div>'
    + '<div class="foot"><span class="h">' + (HANDLE ? esc(HANDLE) : 'FOLLOW') + '</span><span>' + total + ' / ' + total + '</span></div>'
    + '</div>';
}

function pageHtml(inner) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + BASE + '</style></head><body>' + inner + '</body></html>';
}

async function makeDeck(topic) {
  for (let i = 0; i < 3; i++) {
    try {
      const d = extractJson(await askClaude(infoDeckPrompt(topic)));
      if (d.cover && (d.steps || []).length >= 2 && d.caption) return d;
    } catch (e) { console.log('⚠️ 대본 재시도(' + (i + 1) + '/3): ' + e.message); }
  }
  return {
    cover: { headline: topic, sub: '핵심만 빠르게 정리' },
    steps: [{ title: '준비 중', tag: '', bullets: ['곧 채워집니다'] }],
    cta: { headline: '저장해두기', sub: '팔로우하면 더 옴' },
    caption: topic + '\n\n저장각 👀\n#클로드 #AI자동화',
  };
}

async function buildDeck(topic, opts) {
  opts = opts || {};
  let deck;
  if (opts.deckFile) {
    const full = path.isAbsolute(opts.deckFile) ? opts.deckFile : path.join(__dirname, opts.deckFile);
    deck = JSON.parse(fs.readFileSync(full, 'utf-8'));
    console.log('🗂️ 덱 파일 사용: ' + opts.deckFile);
  } else {
    console.log('🎨 인포그래픽 대본 생성 중... (주제: ' + topic + ')');
    deck = await makeDeck(topic);
  }
  const cards = toCards(deck);
  const total = cards.length;
  console.log('   ↳ ' + total + '장');

  fs.mkdirSync(CARD_DIR, { recursive: true });
  fs.readdirSync(CARD_DIR).filter(f => /^carousel_\d+\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(CARD_DIR, f)));

  const browser = await chromium.launch({ headless: true });
  const imagePaths = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const inner = c.kind === 'cover' ? coverHtml(c, total) : c.kind === 'cta' ? ctaHtml(c, total) : stepHtml(c, i + 1, total);
      await page.setContent(pageHtml(inner), { waitUntil: 'networkidle' });
      const out = path.join(CARD_DIR, 'carousel_' + String(i + 1).padStart(2, '0') + '.png');
      await page.screenshot({ path: out });
      imagePaths.push(out);
      console.log('   🖼️ ' + path.basename(out) + ' (' + c.kind + ')');
    }
  } finally { await browser.close(); }

  console.log('🎨 인포그래픽 완료: ' + imagePaths.length + '장');
  return { imagePaths, caption: (deck.caption || '').trim() };
}

module.exports = { buildDeck };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
  const file = getArg('--file');
  const doPost = argv.includes('--post');
  const doPublish = argv.includes('--publish');
  const topic = argv.filter(a => !a.startsWith('--') && a !== file).join(' ').trim() || '클로드 제대로 쓰는 6가지 방법';
  buildDeck(file ? null : topic, file ? { deckFile: file } : {})
    .then(r => {
      if (doPost) {
        const a = [path.join(__dirname, 'threads_post.js'), '클로드 자동화', '--growth', '--text', r.caption, '--images', r.imagePaths.join(',')];
        a.push(doPublish ? '--publish' : '--dry');
        console.log('\n▶ 게시 단계 (' + (doPublish ? '실제 게시' : '검토 모드') + ')...');
        spawnSync('node', a, { cwd: __dirname, stdio: 'inherit' });
      } else {
        console.log('\n✅ 완료 (' + r.imagePaths.length + '장). threads_cards/ 폴더 확인. 게시하려면 --post(검토)/--post --publish(실제).');
      }
    })
    .catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
}
