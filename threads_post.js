/**
 * threads_post.js — 스레드(Threads) 자동 발행 (텍스트 + 이미지/영상/캐러셀 첨부)
 *
 * 실행:
 *   node threads_post.js "자취 국룰" --growth --text "본문" --image cards/x.png --publish
 *   node threads_post.js "자취 국룰" --growth --text "본문" --video threads_reel.mp4 --publish
 *   node threads_post.js "클로드 팁" --growth --text "본문" --images "a.png,b.png,c.png" --publish
 *   node threads_post.js "크록스" --url "https://link.coupang.com/xxxx" --publish
 *
 * 옵션:
 *   --growth        팔로워용(상품/링크/수수료 문구 없음)
 *   --text "본문"    본문 직접 지정(있으면 Claude 생성 스킵)
 *   --image 경로     이미지 1장 첨부
 *   --images "a,b"   여러 장(캐러셀) 첨부 — 콤마 구분
 *   --video 경로     영상 첨부(짤영상). 업로드/처리 대기 자동 연장
 *   --url 링크       쿠팡 제휴링크(공감글 아닐 때)
 *   --publish        자동 게시 / (기본) 검토 모드 / --dry 게시 생략
 * - 사전: node save_threads_session.js
 * ⚠️ 과도한 자동발행은 스팸 위험.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { coupangThreadsPrompt, growthThreadsPrompt } = require('./prompts');
const { askClaude } = require('./generate');
const coupang = require('./coupang');

const argv = process.argv.slice(2);
const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const doPublish = argv.includes('--publish');
const dry = argv.includes('--dry');
const growth = argv.includes('--growth');
let url = getArg('--url') || '';
let product = getArg('--product') || '';
const imagePath = getArg('--image') || '';
const imagesArg = getArg('--images') || '';
const videoPath = getArg('--video') || '';
const textArg = getArg('--text') || '';

// 첨부할 미디어 파일 목록
let mediaFiles = [];
if (imagesArg) mediaFiles = imagesArg.split(',').map(s => s.trim()).filter(Boolean);
else if (imagePath) mediaFiles = [imagePath];
else if (videoPath) mediaFiles = [videoPath];
const isVideo = mediaFiles.length === 1 && /\.(mp4|mov|m4v|webm)$/i.test(mediaFiles[0]);

const consumed = [url, product, imagePath, imagesArg, videoPath, textArg];
const keyword = argv.filter(a => !a.startsWith('--') && !consumed.includes(a)).join(' ').trim();

const PROFILE = path.join(__dirname, 'playwright', 'threads-profile');
const LOG = path.join(__dirname, 'threads_log.txt');
const DISCLOSURE = '쿠팡 파트너스 활동으로 일정액의 수수료를 받습니다.';
const log = (m) => { console.log(m); try { fs.appendFileSync(LOG, '[' + new Date().toISOString() + '] ' + m + '\n'); } catch (_) {} };

function extractJson(t) {
  t = t.replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('카피 JSON 파싱 실패');
  return JSON.parse(t.slice(s, e + 1));
}

async function buildText() {
  if (textArg) {
    const parts = [textArg.trim()];
    if (!growth) { if (url) parts.push(url); parts.push(DISCLOSURE); }
    return parts.join('\n\n');
  }
  const prompt = growth ? growthThreadsPrompt(keyword) : coupangThreadsPrompt(keyword, product);
  let body = '';
  for (let i = 0; i < 3 && !body; i++) {
    try { body = (extractJson(await askClaude(prompt)).text) || ''; }
    catch (e) { log('⚠️ 생성 재시도(' + (i + 1) + '/3): ' + e.message); }
  }
  if (!body) body = growth ? (keyword + ' 다들 공감하지? 나만 그런 거 아니지?') : (keyword + ' 지금 인기예요! 아래 링크에서 확인해보세요 👇');
  const parts = [body.trim()];
  if (!growth) { if (url) parts.push(url); parts.push(DISCLOSURE); }
  return parts.join('\n\n');
}

(async () => {
  if (!keyword) { log('사용법: node threads_post.js "키워드" [--growth] [--text 본문] [--image|--images|--video 경로] [--publish]'); process.exit(1); }
  if (!fs.existsSync(PROFILE)) { log('❌ 스레드 프로필 없음! node save_threads_session.js 먼저 실행'); process.exit(1); }
  for (const f of mediaFiles) { if (!fs.existsSync(f)) { log('❌ 첨부 파일 없음: ' + f); process.exit(1); } }
  if (!url && !growth) log('⚠️ --url(제휴링크) 없이 진행 — 링크 없는 글이 됩니다.');

  if (!url && !growth && !textArg) {
    try {
      const cp = await coupang.searchProduct(keyword);
      if (cp) { url = cp.url; if (!product) product = cp.name; log('🛒 쿠팡 매칭: ' + cp.name); }
    } catch (e) { log('쿠팡 검색 스킵: ' + e.message); }
  }

  const text = await buildText();
  log('📝 발행할 글:\n' + text);

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false, viewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  try {
    log('🌐 스레드 이동...');
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000);

    const openSel = [
      'div[role="button"]:has-text("스레드 시작")',
      'div:has-text("스레드를 시작하세요")',
      'svg[aria-label="새 스레드"]',
      'a[href="/compose"]',
      'div[role="button"]:has-text("게시")',
    ];
    for (const sel of openSel) {
      try { const b = page.locator(sel).first(); if (await b.count() && await b.isVisible()) { await b.click({ timeout: 4000 }); await page.waitForTimeout(1500); break; } } catch (_) {}
    }

    let typed = false;
    for (const sel of ['div[contenteditable="true"]', 'textarea', 'div[role="textbox"]']) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() && await el.isVisible()) { await el.click({ timeout: 4000 }); await page.keyboard.type(text, { delay: 8 }); typed = true; log('✍️ 본문 입력 완료'); break; }
      } catch (_) {}
    }
    if (!typed) log('⚠️ 작성창을 못 찾음 — 화면에서 직접 붙여넣어야 함');

    // 🖼️/🎬 미디어 첨부 — 작성창의 숨은 file input 에 (여러 장이면 배열로 한 번에)
    if (mediaFiles.length) {
      let attached = false;
      await page.waitForTimeout(800);
      const dlgScope = page.locator('div[role="dialog"]').last();
      for (const scope of [dlgScope, page]) {
        try {
          const inp = scope.locator('input[type="file"]').first();
          if (await inp.count()) {
            await inp.setInputFiles(mediaFiles, { timeout: 20000 });
            attached = true;
            log('📎 첨부: ' + mediaFiles.length + '개 (' + (isVideo ? '영상' : '이미지') + ')');
            break;
          }
        } catch (_) {}
      }
      if (!attached) log('⚠️ 첨부 실패 — file input 못 찾음(텍스트만 게시됨)');
      else await page.waitForTimeout(isVideo ? 20000 : (mediaFiles.length > 1 ? 8000 : 4000));
    }

    await page.waitForTimeout(1500);
    if (dry) { log('🧪 --dry: 게시 생략'); await page.waitForTimeout(10000); }
    else if (doPublish) {
      let posted = false;
      const dialog = page.locator('div[role="dialog"]').last();
      const tries = isVideo ? 24 : 14;
      for (let t = 0; t < tries && !posted; t++) {
        for (const scope of [dialog, page]) {
          for (const name of ['게시', 'Post']) {
            let btn;
            try { btn = scope.getByRole('button', { name, exact: true }); } catch (_) { continue; }
            const n = await btn.count().catch(() => 0);
            for (let i = n - 1; i >= 0 && !posted; i--) {
              const el = btn.nth(i);
              try {
                if (!(await el.isVisible())) continue;
                if ((await el.getAttribute('aria-disabled')) === 'true') continue;
                await el.click({ timeout: 4000 });
                posted = true;
                log('🖱️ 게시 클릭: ' + name);
              } catch (_) {}
            }
            if (posted) break;
          }
          if (posted) break;
        }
        if (!posted) await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(isVideo ? 20000 : 15000);
      log(posted ? '✅ 게시 완료(추정) — 스레드 프로필에서 확인하세요.' : '⚠️ 게시 버튼 못 찾음/비활성 — 화면에서 직접 게시하세요.');
    } else {
      log('🛑 검토 모드: 게시 안 함. 화면에서 확인 후 직접 "게시" 누르세요. (자동은 --publish)');
      await page.waitForTimeout(60000);
    }
    log('🎉 종료');
  } catch (e) { log('❌ 오류: ' + e.message); }
  finally { await page.waitForTimeout(2000); await ctx.close(); }
})();
