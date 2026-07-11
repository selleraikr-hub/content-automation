/**
 * save_session.js — 네이버 로그인 세션 저장 (최초 1회 / 세션 만료 시 재실행)
 *
 * 실행:  node save_session.js
 *  1) 크롬 창이 열리고 네이버 로그인 페이지가 뜹니다.
 *  2) 직접 아이디/비밀번호로 로그인하세요. (2단계 인증도 직접 완료)
 *  3) 로그인 끝나고 이 창(터미널)에서 엔터를 누르면 세션이 저장됩니다.
 *     → playwright/storage/naver-session.json
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const SESSION_FILE = path.join(__dirname, 'playwright', 'storage', 'naver-session.json');

function waitEnter(msg) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg, () => { rl.close(); resolve(); });
  });
}

(async () => {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('🔐 네이버 로그인 페이지를 엽니다...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });

  console.log('\n👉 열린 크롬 창에서 직접 로그인하세요. (2단계 인증까지 완료)');
  await waitEnter('   로그인이 끝났으면 여기서 엔터를 누르세요... ');

  await context.storageState({ path: SESSION_FILE });
  console.log(`\n✅ 세션 저장 완료: ${SESSION_FILE}`);
  console.log('   이제 node run_all.js "주제" 로 발행할 수 있어요.');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
