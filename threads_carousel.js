/**
 * threads_carousel.js — 주제 → 정보성 여러 장 카드(캐러셀) PNG 생성
 *   클로드/AI 정보 콘텐츠를 저장 유발형 카드 세트로. 스레드에 여러 장 첨부해 게시.
 *
 * 모듈:  const { buildCarousel } = require('./threads_carousel');
 *        const { imagePaths, caption } = await buildCarousel('클로드로 이메일 자동정리');
 * 단독:  node threads_carousel.js "클로드 MCP 3줄 요약"     (카드만 생성)
 *
 * 정보 카드는 가독성 위해 사진 배경 없이 깔끔한 그라데이션으로 렌더(1080x1350).
 */
const fs = require('fs');
const path = require('path');
const { infoThreadsPrompt } = require('./prompts');
const { askClaude } = require('./generate');
const { renderCard } = require('./threads_card');

const CARD_DIR = path.join(__dirname, 'threads_cards');
const W = 1080, H = 1350;

function extractJson(t) {
  t = String(t).replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('캐러셀 JSON 파싱 실패');
  return JSON.parse(t.slice(s, e + 1));
}

async function makeScript(topic) {
  for (let i = 0; i < 3; i++) {
    try {
      const d = extractJson(await askClaude(infoThreadsPrompt(topic)));
      const cards = (d.cards || []).filter(c => c && (c.lines || c.headline));
      const caption = (d.caption || '').trim();
      if (cards.length >= 2 && caption) return { cards, caption };
    } catch (e) { console.log('⚠️ 대본 재시도(' + (i + 1) + '/3): ' + e.message); }
  }
  return {
    cards: [
      { kind: 'cover', headline: '클로드 자동화', lines: [topic, '핵심만 정리'] },
      { kind: 'body', headline: 'TIP', lines: ['오늘은 준비 중', '내일 더 옴'] },
      { kind: 'cta', headline: '', lines: ['저장해두기', '팔로우하면 팁 더 옴'] },
    ],
    caption: topic + '\n\n저장해두고 써먹기 👀\n#클로드 #AI자동화',
  };
}

async function buildCarousel(topic) {
  console.log('🗂️ 정보 카드 대본 생성 중... (주제: ' + topic + ')');
  const { cards, caption } = await makeScript(topic);
  console.log('   ↳ ' + cards.length + '장');

  fs.mkdirSync(CARD_DIR, { recursive: true });
  fs.readdirSync(CARD_DIR).filter(f => /^carousel_\d+\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(CARD_DIR, f)));

  const imagePaths = [];
  for (let i = 0; i < cards.length; i++) {
    const out = path.join(CARD_DIR, 'carousel_' + String(i + 1).padStart(2, '0') + '.png');
    // 정보 카드는 가독성 위해 배경사진 없이(그라데이션) 렌더
    await renderCard({ headline: cards[i].headline, lines: cards[i].lines }, out, { width: W, height: H });
    imagePaths.push(out);
    console.log('   🖼️ ' + path.basename(out));
  }
  console.log('🗂️ 캐러셀 완료: ' + imagePaths.length + '장');
  return { imagePaths, caption };
}

module.exports = { buildCarousel };

if (require.main === module) {
  const topic = process.argv.slice(2).join(' ').trim() || '클로드로 업무 자동화';
  buildCarousel(topic)
    .then(r => console.log('\n✅ 완료 (' + r.imagePaths.length + '장). 게시: node threads_post.js "' + topic + '" --growth --images "' + r.imagePaths.join(',') + '" --text "..." --publish'))
    .catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
}
