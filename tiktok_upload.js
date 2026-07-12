/**
 * tiktok_upload.js — TikTok Studio 웹에 tiktok_video.mp4 자동 업로드 + 캡션 입력
 *
 * 실행:
 *   node tiktok_upload.js            // 업로드+캡션까지, "게시"는 안 누르고 멈춤(검토용)
 *   node tiktok_upload.js --publish  // 최종 게시까지 자동
 *   node tiktok_upload.js --file x.mp4
 *
 * 사전: node save_tiktok_session.js 로 로그인 세션 저장 필요
 * ⚠️ 틱톡 자동 게시는 계정 제재 위험이 있어요. 하루 1건·검토 권장.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('./config');

const argv = process.argv.slice(2);
const doPublish = argv.includes('--publish');
const videoArg = (() => { const i = argv.indexOf('--file'); return i >= 0 && argv[i + 1] ? argv[i + 1] : 'tiktok_video.mp4'; })();
const SESSION = path.join(__dirname, 'playwright', 'storage', 'tiktok-session.json');
const LOG = path.join(__dirname, 'tiktok_log.txt');
const log = (m) => { console.log(m); try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch (_) {} };

// 캡션: Claude 자동 생성(가능하면) → 실패 시 post.json 제목+태그
async function buildCaption() {
  const postPath = path.join(__dirname, 'post.json');
  const post = fs.existsSync(postPath) ? JSON.parse(fs.readFileSync(postPath, 'utf-8')) : { title: '', content: '', tags: [] };
  try {
    const { askClaude } = require('./generate');
    const { tiktokCaptionPrompt } = require('./prompts');
    const raw = await askClaude(tiktokCaptionPrompt(post.title, (post.content || '').slice(0, 1200)));
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s !== -1 && e !== -1) { const j = JSON.parse(raw.slice(s, e + 1)); if (j.caption) return j.caption; }
  } catch (err) { log(`ℹ️ 캡션 자동생성 건너뜀(${err.message}) → 기본 캡션 사용`); }
  const tags = (post.tags || []).map(t => '#' + String(t).replace(/^#/, '')).join(' ');
  return `${post.title}\n\n${tags}`;
}

(async () => {
  const videoPath = path.isAbsolute(videoArg) ? videoArg : path.join(__dirname, videoArg);
  if (!fs.existsSync(videoPath)) { log(`❌ 영상 없음: ${videoPath} (먼저 node make_video.js)`); process.exit(1); }
  if (!fs.existsSync(SESSION)) { log('❌ 틱톡 세션 없음! node save_tiktok_session.js 먼저 실행'); process.exit(1); }

  const caption = await buildCaption();
  log('📝 캡션 준비 완료');

  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled', '--start-maximized'] });
  const ctx = await browser.newContext({ storageState: SESSION, viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();

  try {
    log('🌐 업로드 페이지 이동...');
    await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp&lang=ko-KR', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000);

    // 파일 입력 직접 주입 (버튼 클릭보다 안정적)
    log('⬆️ 영상 업로드 중...');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 20000 });
    await fileInput.setInputFiles(videoPath);

    // 업로드/처리 대기 (캡션 입력창이 뜰 때까지)
    log('⏳ 업로드 처리 대기...');
    await page.waitForTimeout(8000);

    // 방해 팝업(튜토리얼 등) 먼저 닫기
    for (const t of ['확인', '건너뛰기', '다음에', '닫기', 'Got it', 'OK', 'Skip', 'Maybe later']) {
      try {
        const b = page.locator(`button:has-text("${t}")`).first();
        if (await b.count() && await b.isVisible()) { await b.click({ timeout: 1500 }); await page.waitForTimeout(500); log(`🧹 팝업 닫음: ${t}`); }
      } catch (_) {}
    }
    await page.waitForTimeout(1500);

    // 캡션 입력 (contenteditable) — 기존 텍스트(파일명) 지우고 입력
    const capSelectors = [
      'div[contenteditable="true"][data-contents="true"]',
      'div.public-DraftEditor-content',
      'div.notranslate[contenteditable="true"]',
      'div[contenteditable="true"]',
      '[data-text="true"]',
    ];
    let capOk = false;
    for (const sel of capSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() && await el.isVisible()) {
          await el.click({ timeout: 5000 });
          await page.waitForTimeout(300);
          // 기존 내용 확실히 비우기
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(200);
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Delete');
          await page.keyboard.type(caption, { delay: 12 });
          await page.waitForTimeout(500);
          capOk = true; log('✍️ 캡션 입력 완료'); break;
        }
      } catch (_) {}
    }
    if (!capOk) log('⚠️ 캡션 입력창 못 찾음 — 화면에서 직접 입력 필요');

    await page.waitForTimeout(3000);

    if (doPublish) {
      log('🚀 게시 버튼 클릭...');
      const pubSelectors = [
        'button[data-e2e="post_video_button"]',
        'button:has-text("게시")',
        'button:has-text("Post")',
      ];
      let posted = false;
      // 영상 처리 끝나 게시 버튼이 활성화될 때까지 최대 ~20초 재시도
      for (let tries = 0; tries < 12 && !posted; tries++) {
        for (const sel of pubSelectors) {
          try {
            const b = page.locator(sel).first();
            if (await b.count() && await b.isVisible() && await b.isEnabled()) { await b.click({ timeout: 8000 }); posted = true; break; }
          } catch (_) {}
        }
        if (!posted) await page.waitForTimeout(1700);
      }
      if (posted) { await page.waitForTimeout(15000); log('✅ 게시 완료(추정) — 프로필에서 확인하세요.'); }
      else log('⚠️ 게시 버튼 못 찾음/비활성 — 화면에서 직접 눌러주세요.');
    } else {
      log('🛑 검토 모드: 게시는 안 눌렀어요. 화면에서 미리보기·캡션 확인 후 직접 "게시" 누르세요.');
      log('   (자동 게시하려면 다음부터 node tiktok_upload.js --publish)');
      await page.waitForTimeout(60000); // 1분간 창 유지
    }
    log('🎉 종료');
  } catch (e) {
    log(`❌ 오류: ${e.message}`);
  } finally {
    await page.waitForTimeout(doPublish ? 4000 : 2000);
    await browser.close();
  }
})();
