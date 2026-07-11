/**
 * naver.js — 네이버 공식 API
 *  - keywordVolumes(): 검색광고 API로 검색량 (쿼터 절약: 힌트 2개만 호출 + 캐시 + 재시도)
 *  - titleSimilarity(): 검색 API로 상위 블로그 제목과 유사도
 * 키 없으면 null 반환(자동 스킵). 네이버가 검색량을 막으면 상위호출부에서 AI 추정으로 대체.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');

const CACHE_FILE = path.join(__dirname, 'keyword_cache.json');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const toNum = (v) => { const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; };
function adSign(ts, method, uri, secret) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${method}.${uri}`).digest('base64');
}
function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); } catch (_) { return {}; } }
function saveCache(c) { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2)); } catch (_) {} }

// 관련 키워드 + 월간 검색량 (네이버는 "단일 힌트"일 때만 그 단어 검색량을 줌 + 일일 쿼터 존재)
async function keywordVolumes(hints) {
  const key = CONFIG.NAVER_AD_API_KEY, sec = CONFIG.NAVER_AD_SECRET, cust = CONFIG.NAVER_AD_CUSTOMER_ID;
  if (!key || !sec || !cust) return null;
  const uri = '/keywordstool';
  const list = (Array.isArray(hints) ? hints : [hints]).map(h => String(h).replace(/\s+/g, '')).filter(Boolean);
  const cache = loadCache();
  const merged = new Map();
  const names = new Set();

  // 쿼터 절약: 실제 호출은 최대 2개 힌트만
  for (const hk of list.slice(0, 2)) {
    if (cache[hk] != null) merged.set(hk, { keyword: hk, pc: 0, mobile: 0, total: cache[hk], comp: cache[hk + '__c'] || '-' });
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      try {
        const ts = Date.now().toString();
        const sig = adSign(ts, 'GET', uri, sec);
        const url = `https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(hk)}&showDetail=1`;
        const r = await fetch(url, { headers: { 'X-Timestamp': ts, 'X-API-KEY': key, 'X-Customer': String(cust), 'X-Signature': sig } });
        if (!r.ok) { if (r.status === 403) throw new Error(`403: ${(await r.text()).slice(0, 120)}`); await sleep(1200); continue; }
        const j = await r.json();
        for (const k of (j.keywordList || [])) {
          names.add(k.relKeyword);
          const pc = toNum(k.monthlyPcQcnt), mo = toNum(k.monthlyMobileQcnt), total = pc + mo;
          const ex = merged.get(k.relKeyword);
          if (!ex || total > ex.total) merged.set(k.relKeyword, { keyword: k.relKeyword, pc, mobile: mo, total, comp: k.compIdx || '-' });
          if (k.relKeyword === hk && total > 0) { cache[hk] = total; cache[hk + '__c'] = k.compIdx || '-'; } // 본인 검색량만 캐시
        }
        done = true;
      } catch (e) { if (String(e.message).includes('403')) throw e; await sleep(1200); }
    }
    await sleep(1000);
  }
  saveCache(cache);
  const all = [...merged.values()].sort((a, b) => b.total - a.total);
  const withVol = all.filter(x => x.total > 0);   // 실제 검색량 확인된 것
  return { withVol, names: [...names].slice(0, 60), any: withVol.length > 0 };
}

async function blogTitles(query, count = 10) {
  const id = CONFIG.NAVER_CLIENT_ID, sec = CONFIG.NAVER_CLIENT_SECRET;
  if (!id || !sec) return null;
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${count}&sort=sim`;
  const r = await fetch(url, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec } });
  if (!r.ok) throw new Error(`검색 API ${r.status}`);
  const j = await r.json();
  return (j.items || []).map(i => String(i.title).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' '));
}
function similarity(a, b) {
  const bg = (s) => { s = String(s).replace(/\s+/g, ''); const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
  const A = bg(a), B = bg(b); if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}
async function titleSimilarity(title, query) {
  const titles = await blogTitles(query || title);
  if (!titles) return null;
  let max = 0, closest = '';
  for (const t of titles) { const s = similarity(title, t); if (s > max) { max = s; closest = t; } }
  return { score: max, closest, count: titles.length };
}

module.exports = { keywordVolumes, blogTitles, titleSimilarity, similarity };
