/**
 * threads_deck.js — 정보성 인포그래픽 덱 이미지 생성 (두 가지 스타일)
 *   style 'photo' (기본, ROUTINE LAB 느낌): 실사진 배경 + 미니멀 큰 글씨 + 번호뱃지 + 브랜드
 *   style 'card'  : 다크+오렌지 글자 카드(번호/태그/불릿)
 *   표지 + 번호 스텝 + CTA. 1080x1350.
 *
 * 모듈:  const { buildDeck } = require('./threads_deck');
 *        await buildDeck('클로드 제대로 쓰는 법', { fable:true, style:'photo' });
 *        await buildDeck(null, { deckFile:'deck_x.json', style:'card' });
 * 단독:
 *   node threads_deck.js "클로드 제대로 쓰는 6가지 방법"       (AI생성, photo)
 *   node threads_deck.js --file deck_claude_start.json --card   (내 JSON, 카드style)
 *   node threads_deck.js --file deck_x.json --post              (+게시 검토)
 *   node threads_deck.js --file deck_x.json --post --publish     (+실제 게시)
 *
 * 브랜드 이름은 .env 의 THREADS_BRAND (없으면 기본값). 사진은 Unsplash 자동.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const CONFIG = require('./config');
const { infoDeckPrompt } = require('./prompts');
const { askClaude } = require('./generate');
const { fetchBg } = require('./threads_card');

const CARD_DIR = path.join(__dirname, 'threads_cards');
const W = 1080, H = 1350;
const ACCENT = '#FF7A45';
const BRAND = process.env.THREADS_BRAND || 'AI 자동화 LAB';

function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function extractJson(t) {
  t = String(t).replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('덱 JSON 파싱 실패');
  return JSON.parse(t.slice(s, e + 1));
}

function toCards(deck) {
  const cards = [];
  if (deck.cover) cards.push(Object.assign({ kind: 'cover' }, deck.cover));
  (deck.steps || []).forEach((s, i) => cards.push(Object.assign({ kind: 'step', num: i + 1 }, s)));
  if (deck.cta) cards.push(Object.assign({ kind: 'cta' }, deck.cta));
  return cards;
}

/* ---------- style: photo (실사진 배경 미니멀) ---------- */
function photoHtml(card, idx, total, bgUrl) {
  const bg = bgUrl
    ? "linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.25) 38%, rgba(0,0,0,.82) 100%), url('" + bgUrl + "') center/cover no-repeat"
    : 'linear-gradient(160deg,#1a1712,#0e0d0b)';
  const numBadge = card.kind === 'step'
    ? '<div class="num">' + String(card.num).padStart(2, '0') + '</div>' : '';
  let title = '', sub = '';
  if (card.kind === 'cover') { title = card.headline; sub = card.sub || ''; }
  else if (card.kind === 'cta') { title = card.headline || '저장하고 하나씩 따라하기'; sub = card.sub || '팔로우하면 꿀팁 더 옴'; }
  else { title = card.title; sub = (card.bullets || []).slice(0, 2).join('\n'); }
  const subHtml = sub ? sub.split('\n').map(l => '<div>' + esc(l) + '</div>').join('') : '';
  const tag = (card.kind === 'step' && card.tag) ? '<div class="tag">' + esc(card.tag) + '</div>' : '';
  const tsize = card.kind === 'cover' ? 96 : 82;

  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + "*{margin:0;padding:0;box-sizing:border-box;} html,body{width:" + W + "px;height:" + H + "px;}"
    + ".p{width:" + W + "px;height:" + H + "px;position:relative;background:" + bg + ";"
    + "font-family:'Malgun Gothic','\\B9D1\\C740 \\ACE0\\B515','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#fff;}"
    + ".num{position:absolute;top:60px;right:60px;background:" + ACCENT + ";color:#1a120c;font-size:40px;font-weight:900;"
    + "width:82px;height:82px;border-radius:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.4);}"
    + ".wrap{position:absolute;left:84px;right:84px;bottom:150px;text-align:center;}"
    + ".tag{display:inline-block;font-size:32px;font-weight:800;color:#fff;background:rgba(255,122,69,.85);"
    + "padding:10px 24px;border-radius:999px;margin-bottom:28px;}"
    + ".title{font-size:" + tsize + "px;font-weight:900;line-height:1.24;word-break:keep-all;text-shadow:0 4px 30px rgba(0,0,0,.85);}"
    + ".sub{font-size:42px;font-weight:600;line-height:1.5;color:rgba(255,255,255,.9);margin-top:26px;word-break:keep-all;text-shadow:0 2px 14px rgba(0,0,0,.85);}"
    + ".sub div{margin:6px 0;}"
    + ".brand{position:absolute;left:0;right:0;bottom:66px;text-align:center;font-size:30px;font-weight:800;"
    + "letter-spacing:5px;color:rgba(255,255,255,.85);}"
    + ".pg{position:absolute;right:60px;bottom:66px;font-size:28px;font-weight:800;color:rgba(255,255,255,.6);}"
    + "</style></head><body><div class='p'>" + numBadge
    + "<div class='wrap'>" + tag + "<div class='title'>" + esc(title) + "</div>"
    + (subHtml ? "<div class='sub'>" + subHtml + "</div>" : "")
    + "</div>"
    + "<div class='brand'>" + esc(BRAND) + "</div><div class='pg'>" + idx + " / " + total + "</div>"
    + "</div></body></html>";
}

/* ---------- style: card (다크+오렌지 글자) ---------- */
const CARDBASE = "*{margin:0;padding:0;box-sizing:border-box;} html,body{width:" + W + "px;height:" + H + "px;}"
  + ".card{width:" + W + "px;height:" + H + "px;position:relative;overflow:hidden;"
  + "background:radial-gradient(120% 80% at 85% 0%, #2a2018 0%, #17130f 45%, #100d0b 100%);"
  + "font-family:'Malgun Gothic','\\B9D1\\C740 \\ACE0\\B515','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#fff;padding:96px 84px;display:flex;flex-direction:column;}"
  + ".foot{position:absolute;left:84px;right:84px;bottom:60px;display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:800;color:rgba(255,255,255,.45);}"
  + ".foot .h{color:" + ACCENT + ";}.kicker{color:" + ACCENT + ";font-size:34px;font-weight:900;letter-spacing:1px;margin-bottom:26px;}"
  + ".cover-h{font-size:104px;font-weight:900;line-height:1.16;word-break:keep-all;}.bar{width:120px;height:12px;background:" + ACCENT + ";border-radius:999px;margin:40px 0 34px;}"
  + ".cover-sub{font-size:44px;font-weight:600;color:rgba(255,255,255,.7);word-break:keep-all;line-height:1.45;}"
  + ".numrow{display:flex;align-items:center;gap:22px;margin-bottom:44px;}.num{width:104px;height:104px;border-radius:26px;background:" + ACCENT + ";color:#1a120c;font-size:60px;font-weight:900;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}"
  + ".tag{font-size:34px;font-weight:800;color:" + ACCENT + ";background:rgba(255,122,69,.14);border:2px solid rgba(255,122,69,.5);padding:12px 24px;border-radius:999px;}"
  + ".title{font-size:70px;font-weight:900;line-height:1.24;word-break:keep-all;margin-bottom:52px;}"
  + ".bul{display:flex;flex-direction:column;gap:30px;}.bul .li{display:flex;align-items:flex-start;gap:22px;font-size:46px;font-weight:600;color:rgba(255,255,255,.9);word-break:keep-all;line-height:1.35;}.bul .dot{width:20px;height:20px;border-radius:50%;background:" + ACCENT + ";margin-top:20px;flex:0 0 auto;}"
  + ".mid{flex:1;display:flex;flex-direction:column;justify-content:center;}.center{align-items:center;text-align:center;}"
  + ".cta-h{font-size:84px;font-weight:900;line-height:1.2;word-break:keep-all;}.cta-sub{font-size:44px;font-weight:700;color:" + ACCENT + ";margin-top:28px;word-break:keep-all;}";

function cardHtml(card, idx, total) {
  let inner = '';
  if (card.kind === 'cover') {
    inner = "<div class='mid'><div class='kicker'>CLAUDE · AI 자동화</div><div class='cover-h'>" + esc(card.headline) + "</div><div class='bar'></div>"
      + (card.sub ? "<div class='cover-sub'>" + esc(card.sub) + "</div>" : "") + "</div>"
      + "<div class='foot'><span class='h'>넘겨보기 →</span><span>SWIPE</span></div>";
  } else if (card.kind === 'cta') {
    inner = "<div class='mid center'><div class='cta-h'>" + esc(card.headline || '저장하고 하나씩 따라하기') + "</div><div class='cta-sub'>" + esc(card.sub || '팔로우하면 꿀팁 더 옴') + "</div></div>"
      + "<div class='foot'><span class='h'>FOLLOW</span><span>" + total + " / " + total + "</span></div>";
  } else {
    const bullets = (card.bullets || []).slice(0, 4).map(b => "<div class='li'><span class='dot'></span><span>" + esc(b) + "</span></div>").join('');
    inner = "<div class='mid'><div class='numrow'><div class='num'>" + card.num + "</div>" + (card.tag ? "<div class='tag'>" + esc(card.tag) + "</div>" : "") + "</div>"
      + "<div class='title'>" + esc(card.title) + "</div><div class='bul'>" + bullets + "</div></div>"
      + "<div class='foot'><span class='h'>CLAUDE 가이드</span><span>" + idx + " / " + total + "</span></div>";
  }
  return "<!doctype html><html><head><meta charset='utf-8'><style>" + CARDBASE + "</style></head><body><div class='card'>" + inner + "</div></body></html>";
}

async function makeDeck(topic, model) {
  for (let i = 0; i < 3; i++) {
    try {
      const d = extractJson(await askClaude(infoDeckPrompt(topic), model));
      if (d.cover && (d.steps || []).length >= 2 && d.caption) return d;
    } catch (e) { console.log('⚠️ 대본 재시도(' + (i + 1) + '/3): ' + e.message); }
  }
  return {
    cover: { headline: topic, sub: '핵심만 빠르게 정리', bg_query: 'laptop desk workspace' },
    steps: [{ title: '준비 중', tag: '', bullets: ['곧 채워집니다'], bg_query: 'desk laptop' }],
    cta: { headline: '저장해두기', sub: '팔로우하면 더 옴', bg_query: 'phone social media' },
    caption: topic + '\n\n저장각 👀\n#클로드 #AI자동화',
  };
}

async function buildDeck(topic, opts) {
  opts = opts || {};
  const style = opts.style || 'photo';
  let deck;
  if (opts.deckFile) {
    const full = path.isAbsolute(opts.deckFile) ? opts.deckFile : path.join(__dirname, opts.deckFile);
    deck = JSON.parse(fs.readFileSync(full, 'utf-8'));
    console.log('🗂️ 덱 파일 사용: ' + opts.deckFile);
  } else {
    const model = opts.fable ? CONFIG.FABLE_MODEL : CONFIG.MODEL;
    console.log('🎨 인포그래픽 대본 생성 중... (' + model + ', ' + style + ', 주제: ' + topic + ')');
    deck = await makeDeck(topic, model);
  }
  const cards = toCards(deck);
  const total = cards.length;
  console.log('   ↳ ' + total + '장 (' + style + ')');

  fs.mkdirSync(CARD_DIR, { recursive: true });
  fs.readdirSync(CARD_DIR).filter(f => /^carousel_\d+\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(CARD_DIR, f)));

  const browser = await chromium.launch({ headless: true });
  const imagePaths = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      let html;
      if (style === 'photo') {
        const bgUrl = await fetchBg(c.bg_query || c.title || c.headline || topic || 'workspace');
        html = photoHtml(c, i + 1, total, bgUrl);
      } else {
        html = cardHtml(c, i + 1, total);
      }
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(400);
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
  const style = argv.includes('--card') ? 'card' : 'photo';
  const doPost = argv.includes('--post');
  const doPublish = argv.includes('--publish');
  const topic = argv.filter(a => !a.startsWith('--') && a !== file).join(' ').trim() || '클로드 제대로 쓰는 6가지 방법';
  buildDeck(file ? null : topic, file ? { deckFile: file, style } : { style })
    .then(r => {
      if (doPost) {
        const a = [path.join(__dirname, 'threads_post.js'), '클로드 자동화', '--growth', '--text', r.caption, '--images', r.imagePaths.join(',')];
        a.push(doPublish ? '--publish' : '--dry');
        console.log('\n▶ 게시 단계 (' + (doPublish ? '실제 게시' : '검토 모드') + ')...');
        spawnSync('node', a, { cwd: __dirname, stdio: 'inherit' });
      } else {
        console.log('\n✅ 완료 (' + r.imagePaths.length + '장, ' + style + '). threads_cards/ 확인. 게시: --post / --post --publish');
      }
    })
    .catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
}
