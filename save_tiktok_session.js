/**
 * save_tiktok_session.js — 틱톡 로그인 세션 저장 (최초 1회 / 만료 시 재실행)
 * 실행: node save_tiktok_session.js
 *  크롬 열리면 틱톡 로그인 → 터미널에서 엔터 → playwright/storage/tiktok-session.json 저장
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const SESSION = path.join(__dirname, 'playwright', 'storage', 'tiktok-session.json');

const waitEnter = (m) => new Promise(r => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(m, () => { rl.close(); r(); }); });

(async () => {
  fs.mkdirSync(path.dirname(SESSION), { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled','--start-maximized'] });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();
  console.log('🔐 틱톡 로그인 페이지를 엽니다...');
  await page.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' });
  console.log('\n👉 열린 창에서 직접 로그인하세요. (본인 계정으로)');
  await waitEnter('   로그인 끝나면 여기서 엔터... ');
  await ctx.storageState({ path: SESSION });
  console.log(`\n✅ 세션 저장: ${SESSION}`);
  await browser.close(); process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
