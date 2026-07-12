/**
 * coupang.js — 쿠팡 파트너스 Open API로 키워드 검색 → 제휴링크 자동 매칭
 * 키(.env): COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY
 * 키 없으면 null 반환(자동 스킵).
 */
const crypto = require('crypto');
const CONFIG = require('./config');

const DOMAIN = 'https://api-gateway.coupang.com';

// 서명용 시각: yyMMdd'T'HHmmss'Z' (GMT)
function signedDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear().toString().slice(2) + p(d.getUTCMonth() + 1) + p(d.getUTCDate())
    + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}
function authHeader(method, urlpath, query) {
  const key = CONFIG.COUPANG_ACCESS_KEY, sec = CONFIG.COUPANG_SECRET_KEY;
  const datetime = signedDate();
  const message = datetime + method + urlpath + query;
  const signature = crypto.createHmac('sha256', sec).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${key}, signed-date=${datetime}, signature=${signature}`;
}

// 키워드로 상품 검색 → 제휴링크 포함 상위 상품 반환
async function searchProduct(keyword, limit = 1) {
  const key = CONFIG.COUPANG_ACCESS_KEY, sec = CONFIG.COUPANG_SECRET_KEY;
  if (!key || !sec) return null;
  const urlpath = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
  const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
  const url = `${DOMAIN}${urlpath}?${query}`;
  const r = await fetch(url, { method: 'GET', headers: { Authorization: authHeader('GET', urlpath, query), 'Content-Type': 'application/json;charset=UTF-8' } });
  if (!r.ok) throw new Error(`쿠팡 파트너스 API ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j = await r.json();
  const arr = (j.data && j.data.productData) || [];
  const first = arr[0];
  if (!first) return null;
  return {
    name: first.productName,
    url: first.productUrl,          // 제휴링크(추적ID 포함)
    image: first.productImage,
    price: first.productPrice,
  };
}

module.exports = { searchProduct };
