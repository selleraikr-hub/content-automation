/**
 * threads_copy.js — 쿠팡 제휴 스레드 카피 생성 (+ 제휴링크 자동 매칭)
 * 실행:
 *   node threads_copy.js "크록스"                         (쿠팡에서 자동 검색→제휴링크)
 *   node threads_copy.js "크록스" --url "직접링크"          (링크 직접 지정)
 * 결과: 터미널 출력 + threads_copy.txt 저장 → 스레드 앱/웹에 복붙
 */
const fs = require('fs');
const path = require('path');
const { coupangThreadsPrompt } = require('./prompts');
const { askClaude } = require('./generate');
const coupang = require('./coupang');

const argv = process.argv.slice(2);
const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
let url = getArg('--url') || '';
let product = getArg('--product') || '';
const keyword = argv.filter(a => !a.startsWith('--') && a !== url && a !== product).join(' ').trim();
const DISCLOSURE = '쿠팡 파트너스 활동으로 일정액의 수수료를 받습니다.';

function extractJson(t) {
  t = t.replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('카피 JSON 파싱 실패');
  return JSON.parse(t.slice(s, e + 1));
}

(async () => {
  if (!keyword) { console.error('사용법: node threads_copy.js "키워드" [--url "링크"]'); process.exit(1); }

  // 링크 미지정 시 쿠팡 파트너스에서 자동 검색 → 제휴링크
  if (!url) {
    try {
      const p = await coupang.searchProduct(keyword);
      if (p) { url = p.url; if (!product) product = p.name; console.log('🛒 쿠팡 매칭: ' + p.name + (p.price ? ' (' + p.price + '원)' : '')); }
      else console.log('ℹ️ 쿠팡 검색 결과 없음/키 미설정 → 링크 없이 진행');
    } catch (e) { console.log('ℹ️ 쿠팡 검색 스킵: ' + e.message); }
  }

  let body = '';
  for (let i = 0; i < 3 && !body; i++) {
    try { body = (extractJson(await askClaude(coupangThreadsPrompt(keyword, product))).text) || ''; }
    catch (e) { console.log(`카피 생성 재시도(${i + 1}/3): ${e.message}`); }
  }
  if (!body) body = `${keyword} 지금 인기예요! 아래 링크에서 확인해보세요`;

  const parts = [body.trim()];
  if (url) parts.push(url);
  parts.push(DISCLOSURE);
  const text = parts.join('\n\n');

  const out = path.join(__dirname, 'threads_copy.txt');
  fs.writeFileSync(out, text);
  console.log('\n===== 스레드에 붙여넣을 글 =====\n');
  console.log(text);
  console.log('\n================================');
  console.log('저장됨: ' + out + '  → 스레드 앱/웹에 복붙해서 게시');
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
