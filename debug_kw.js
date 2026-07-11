// 진단: 힌트를 하나씩 개별 호출하며 상태+그 키워드 검색량 확인
// 실행: node debug_kw.js 클로드 AI 활용법
const crypto = require('crypto');
const CONFIG = require('./config');
const uri = '/keywordstool';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(hk) {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', CONFIG.NAVER_AD_SECRET).update(`${ts}.GET.${uri}`).digest('base64');
  const r = await fetch(`https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(hk)}&showDetail=1`,
    { headers: { 'X-Timestamp': ts, 'X-API-KEY': CONFIG.NAVER_AD_API_KEY, 'X-Customer': String(CONFIG.NAVER_AD_CUSTOMER_ID), 'X-Signature': sig } });
  return r;
}
(async () => {
  const hints = (process.argv.slice(2).length ? process.argv.slice(2) : ['클로드']).map(h => h.replace(/\s+/g, ''));
  for (const hk of hints) {
    const r = await call(hk);
    let exact = 'n/a', cnt = 0;
    if (r.ok) { const j = await r.json(); const list = j.keywordList || []; cnt = list.length; const e = list.find(k => k.relKeyword === hk); if (e) exact = `PC ${e.monthlyPcQcnt} / M ${e.monthlyMobileQcnt}`; }
    console.log(`[${r.status}] ${hk} → 개수 ${cnt}, 본인검색량 ${exact}`);
    await sleep(1000);
  }
})().catch(e => console.error('오류:', e.message));
