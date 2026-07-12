/**
 * save_threads_session.js — 스레드(Threads) 로그인 (전용 브라우저 프로필 방식)
 * 실행: node save_threads_session.js
 *  - 전용 프로필 폴더(playwright/threads-profile)에 로그인 상태가 그대로 유지됩니다.
 *  - 서브 계정으로 로그인하면 그 계정이 계속 유지돼요. (재로그인/가입 팝업 방지)
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const PROFILE = path.join(__dirname, 'playwright', 'threads-profile');
const waitEnter = (m) => new Promise(r => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(m, () => { rl.close(); r(); }); });

(async () => {
  fs.mkdirSync(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  console.log('스레드 로그인 페이지를 엽니다...');
  await page.goto('https://www.threads.net/login', { waitUntil: 'domcontentloaded' });
  console.log('\n원하는 계정(서브)으로 로그인하세요. 스레드 피드가 보이면 성공.');
  await waitEnter('로그인 끝나면 여기서 엔터... ');
  console.log('\n로그인 상태 저장 완료(프로필 유지): ' + PROFILE);
  await ctx.close();
  process.exit(0);
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
