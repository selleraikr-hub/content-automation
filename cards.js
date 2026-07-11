/**
 * cards.js — post.json(또는 지정 글)을 틱톡/인스타 카드뉴스 PNG로 생성
 *
 * 실행:
 *   node cards.js                 // post.json 을 카드뉴스로
 *   node cards.js --file x.json   // 다른 글 파일로
 *
 * 결과: cards/ 폴더에 card_01.png ~ (세로 1080x1920)
 *   - 틱톡 "사진(포토) 모드" 또는 인스타 카루셀에 순서대로 업로드
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('./config');
const { cardNewsPrompt } = require('./prompts');
const { askClaude } = require('./generate');

const argv = process.argv.slice(2);
const fileArg = (() => { const i = argv.indexOf('--file'); return i >= 0 && argv[i + 1] ? argv[i + 1] : 'post.json'; })();

function extractJson(text) {
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('카드뉴스 JSON 파싱 실패(응답 잘림?): ' + text.slice(0, 200));
  return JSON.parse(t.slice(s, e + 1));
}

function esc(x) { return String(x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// 카드 1장 HTML (세로 1080x1920)
function cardHtml(card, idx, total) {
  const kind = card.kind || 'body';
  const isCover = kind === 'cover';
  const isCta = kind === 'cta';
  const bg = isCover
    ? 'linear-gradient(160deg,#5b21b6 0%,#7c3aed 55%,#a855f7 100%)'
    : isCta
      ? 'linear-gradient(160deg,#111827 0%,#1f2937 100%)'
      : 'linear-gradient(160deg,#faf5ff 0%,#f3e8ff 100%)';
  const titleColor = (isCover || isCta) ? '#ffffff' : '#3b0764';
  const bodyColor = (isCover || isCta) ? 'rgba(255,255,255,.92)' : '#5b21b6';
  const titleSize = isCover ? 108 : 84;
  const bodyLines = esc(card.body).split('\n').map(l => `<div>${l}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:1080px;height:1920px;}
    .card{width:1080px;height:1920px;background:${bg};
      display:flex;flex-direction:column;justify-content:center;
      padding:130px 110px;position:relative;
      font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif;}
    .badge{position:absolute;top:90px;left:110px;font-size:34px;font-weight:800;
      color:${(isCover||isCta)?'rgba(255,255,255,.85)':'#9333ea'};letter-spacing:2px;}
    .title{font-size:${titleSize}px;font-weight:900;line-height:1.22;color:${titleColor};
      word-break:keep-all;margin-bottom:${isCover?60:48}px;}
    .body{font-size:52px;font-weight:600;line-height:1.55;color:${bodyColor};word-break:keep-all;}
    .body div{margin-bottom:16px;}
    .footer{position:absolute;bottom:80px;left:110px;right:110px;display:flex;
      justify-content:space-between;align-items:center;
      font-size:32px;font-weight:700;color:${(isCover||isCta)?'rgba(255,255,255,.7)':'#a855f7'};}
    .bar{position:absolute;bottom:0;left:0;height:14px;background:${(isCover||isCta)?'#a855f7':'#7c3aed'};
      width:${Math.round((idx+1)/total*100)}%;}
  </style></head><body>
    <div class="card">
      <div class="badge">${isCover?'✦ SWIPE →':(isCta?'✦ SAVE ✦':`POINT ${idx}`)}</div>
      <div class="title">${esc(card.title)}</div>
      <div class="body">${bodyLines}</div>
      <div class="footer"><span>@trend_claude</span><span>${idx+1} / ${total}</span></div>
      <div class="bar"></div>
    </div>
  </body></html>`;
}

async function main() {
  const fp = path.isAbsolute(fileArg) ? fileArg : path.join(__dirname, fileArg);
  if (!fs.existsSync(fp)) { console.error(`❌ ${fp} 없음. 먼저 글을 생성하세요(node generate.js "주제").`); process.exit(1); }
  const post = JSON.parse(fs.readFileSync(fp, 'utf-8'));

  console.log('🎬 [1/2] 카드뉴스 대본 생성 중...');
  const raw = await askClaude(cardNewsPrompt(post.title, post.content));
  const deck = extractJson(raw);
  const cards = deck.cards || [];
  if (!cards.length) { console.error('❌ 카드가 비었습니다.'); process.exit(1); }
  console.log(`   ↳ ${cards.length}장 구성`);

  console.log('🖼️ [2/2] 이미지 렌더링 중...');
  const outDir = path.join(__dirname, 'cards');
  fs.mkdirSync(outDir, { recursive: true });
  // 이전 카드 정리
  fs.readdirSync(outDir).filter(f => /^card_\d+\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(outDir, f)));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < cards.length; i++) {
    await page.setContent(cardHtml(cards[i], i, cards.length), { waitUntil: 'networkidle' });
    const out = path.join(outDir, `card_${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: out });
    console.log(`   ✅ ${path.basename(out)}  (${cards[i].kind || 'body'})`);
  }
  await browser.close();

  console.log(`\n🎉 완료! ${outDir} 폴더에 ${cards.length}장 저장`);
  console.log('   틱톡 "사진 모드" 또는 인스타 카루셀에 card_01 부터 순서대로 올리세요.');
}

main().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
