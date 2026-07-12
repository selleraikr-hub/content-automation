/**
 * config.js — 공통 설정 (키는 .env 에 넣기 권장)
 */
require('./loadenv');
const path = require('path');

module.exports = {
  // Claude
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-5',        // 대본 양산(저렴)
  FABLE_MODEL: process.env.FABLE_MODEL || 'claude-fable-5',    // 기획/컨셉(고급)
  MAX_TOKENS: 8000,

  // 이미지
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY || '',

  // 네이버 블로그
  NAVER_BLOG_ID: process.env.NAVER_BLOG_ID || 'trend_claude',
  SESSION_FILE: process.env.NAVER_SESSION_FILE ||
    path.join(__dirname, 'playwright', 'storage', 'naver-session.json'),

  // 네이버 검색광고 API (실제 검색량 키워드)
  NAVER_AD_API_KEY: process.env.NAVER_AD_API_KEY || '',
  NAVER_AD_SECRET: process.env.NAVER_AD_SECRET || '',
  NAVER_AD_CUSTOMER_ID: process.env.NAVER_AD_CUSTOMER_ID || '',

  // 네이버 검색 API (제목 유사성 체크)
  NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || '',
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || '',

  // 쿠팡 파트너스 API (제휴링크 자동 매칭)
  COUPANG_ACCESS_KEY: process.env.COUPANG_ACCESS_KEY || '',
  COUPANG_SECRET_KEY: process.env.COUPANG_SECRET_KEY || '',
};
