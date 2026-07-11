/**
 * 네이버 블로그 자동 발행 (Playwright 기반) — 업그레이드 버전 v2
 * ------------------------------------------------------------------
 * 주요 개선점
 *  1) SmartEditor iframe(#mainFrame) 자동 감지 및 진입
 *  2) 이미지 자동 삽입 ([IMAGE_HERE] 마커 위치에 로컬파일/URL 삽입)
 *  3) 하드코딩 제거 → CLI 인자 또는 JSON 파일(post.json)로 글 입력
 *  4) 초안복구/도움말 등 방해 팝업 자동 닫기
 *  5) 발행 실패 시 재시도, 파일 로그(naver_blog_log.txt) 기록
 *  6) 초안(임시저장) 모드 지원 (--draft) — 안전하게 미리 확인 가능
 *  7) 태그 자동 입력
 *
 * 실행 예)
 *   node naver_blog.js                     // post.json 읽어서 발행
 *   node naver_blog.js --draft             // 발행 대신 임시저장
 *   node naver_blog.js --file mypost.json  // 다른 JSON 파일 사용
 *   node naver_blog.js --dry               // 브라우저만 열고 발행 안 함(테스트)
 *
 * post.json 형식)
 * {
 *   "title": "제목",
 *   "content": "본문...\n[IMAGE_HERE]\n다음 문단...",
 *   "tags": ["태그1", "태그2"],
 *   "images": ["C:\\path\\a.jpg", "https://example.com/b.jpg"]
 * }
 *   - content 안의 [IMAGE_HERE] 마커가 나오는 순서대로 images 배열의 이미지가 삽입됩니다.
 *   - images 원소는 로컬 경로 또는 http(s) URL 둘 다 가능합니다.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

// ===== 설정 =====================================================
const CONFIG = {
  NAVER_BLOG_ID: 'trend_claude',
  SESSION_FILE: path.join(__dirname, 'playwright', 'storage', 'naver-session.json'),
  LOG_FILE: path.join(__dirname, 'naver_blog_log.txt'),
  MAX_RETRY: 2,           // 발행 재시도 횟수
  TYPING_DELAY: 15,       // 타이핑 딜레이(ms)
  HEADLESS: false,        // true로 하면 창 안 보이게 백그라운드 실행
};

// ===== CLI 인자 파싱 =============================================
const argv = process.argv.slice(2);
const FLAGS = {
  draft: argv.includes('--draft'),      // 임시저장
  dry: argv.includes('--dry'),          // 발행/저장 안 함(테스트)
  file: (() => {
    const i = argv.indexOf('--file');
    return i >= 0 && argv[i + 1] ? argv[i + 1] : 'post.json';
  })(),
};

// ===== 로그 유틸 =================================================
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  try { fs.appendFileSync(CONFIG.LOG_FILE, line + '\n'); } catch (_) {}
}

// ===== 입력 데이터 로드 ==========================================
function loadPost() {
  const fp = path.isAbsolute(FLAGS.file) ? FLAGS.file : path.join(__dirname, FLAGS.file);
  if (fs.existsSync(fp)) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      log(`📥 입력 로드: ${fp}`);
      return {
        title: data.title || '(제목 없음)',
        content: data.content || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        images: Array.isArray(data.images) ? data.images : [],
      };
    } catch (e) {
      log(`⚠️ ${fp} 파싱 실패(${e.message}) → 샘플 글로 대체`);
    }
  } else {
    log(`ℹ️ ${fp} 없음 → 샘플 글로 실행`);
  }
  return SAMPLE_POST;
}

// ===== URL 이미지 → 임시 파일 다운로드 ============================
function downloadImage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('too many redirects')); return; }
    const mod = url.startsWith('https') ? https : http;
    const ext = (path.extname(new URL(url).pathname) || '.jpg').split('?')[0];
    const tmp = path.join(os.tmpdir(), `naverimg_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    mod.get(url, (res) => {
      // 리다이렉트 따라가기 (picsum 등은 302로 실제 이미지로 넘김)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(downloadImage(next, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(tmp)));
    }).on('error', (err) => { reject(err); });
  });
}

// 로컬 경로면 그대로, URL이면 다운로드해서 로컬 경로 반환
async function resolveImagePath(src) {
  if (/^https?:\/\//i.test(src)) {
    log(`⬇️ 이미지 다운로드: ${src}`);
    return await downloadImage(src);
  }
  if (!fs.existsSync(src)) throw new Error(`이미지 파일 없음: ${src}`);
  return src;
}

// ===== 에디터 프레임 얻기 (SmartEditor는 #mainFrame 안) ============
async function getEditorFrame(page) {
  // PostWriteForm은 대부분 #mainFrame iframe 안에 에디터가 있음.
  // iframe이 없는 신형 레이아웃도 있어 둘 다 시도.
  try {
    await page.waitForSelector('iframe#mainFrame', { timeout: 5000 });
    const frame = page.frame({ name: 'mainFrame' }) ||
      (await page.$('iframe#mainFrame').then(h => h && h.contentFrame()));
    if (frame) { log('🔎 에디터 iframe(#mainFrame) 진입'); return frame; }
  } catch (_) {}
  log('🔎 iframe 없음 → 페이지 직접 사용');
  return page;
}

// ===== 방해 팝업 닫기 ============================================
async function dismissPopups(ctx) {
  const closers = [
    'button.se-popup-button-cancel',                 // 초안 복구 "취소"
    'button:has-text("취소")',
    '.se-help-panel-close-button',                   // 도움말 닫기
    'button.se-guide-modal-close',
    'button:has-text("닫기")',
    '.btn_close',
  ];
  for (const sel of closers) {
    try {
      const el = ctx.locator(sel).first();
      if (await el.count() && await el.isVisible()) {
        await el.click({ timeout: 2000 });
        await ctx.waitForTimeout(400);
        log(`🧹 팝업 닫음: ${sel}`);
      }
    } catch (_) {}
  }
}

// ===== 제목 입력 =================================================
async function typeTitle(ctx, page, title) {
  const selectors = [
    '.se-documentTitle .se-text-paragraph',
    '.se-title-text .se-text-paragraph',
    '.se-title-input p',
    'span.se-placeholder',
  ];
  for (const sel of selectors) {
    try {
      const el = ctx.locator(sel).first();
      if (await el.count()) {
        await el.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        await page.keyboard.type(title, { delay: CONFIG.TYPING_DELAY });
        log(`✅ 제목 입력: ${title}`);
        return true;
      }
    } catch (_) {}
  }
  log('⚠️ 제목 입력 실패 — 셀렉터 확인 필요');
  return false;
}

// ===== 본문(+이미지) 입력 =========================================
async function typeBody(ctx, page, content, images) {
  // 본문 영역 클릭
  const bodySel = ['.se-main-container', '.se-content', 'div[contenteditable="true"]'];
  let clicked = false;
  for (const sel of bodySel) {
    try {
      const el = ctx.locator(sel).first();
      if (await el.count()) { await el.click({ timeout: 5000 }); clicked = true; break; }
    } catch (_) {}
  }
  if (!clicked) { log('⚠️ 본문 영역을 못 찾음'); return false; }
  await page.waitForTimeout(600);

  // 마크다운 경량 정리 (이미지 마커는 보존)
  const clean = content
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#\S+.*$/gm, '')       // 라인 통째 해시태그 제거
    .trim();

  // [IMAGE_HERE] 기준으로 텍스트/이미지 블록 분리
  const parts = clean.split(/\[IMAGE_HERE\]/g);
  let imgIdx = 0;

  for (let i = 0; i < parts.length; i++) {
    const textBlock = parts[i];
    const paragraphs = textBlock.split('\n').map(p => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      await page.keyboard.type(para, { delay: CONFIG.TYPING_DELAY });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
    }
    // 문단 사이(마지막 제외)에 이미지 삽입
    if (i < parts.length - 1) {
      if (imgIdx < images.length) {
        await insertImage(ctx, page, images[imgIdx]);
        imgIdx++;
      } else {
        log('⚠️ [IMAGE_HERE] 개수보다 images가 적음 — 건너뜀');
      }
    }
  }

  // 마커가 없었는데 이미지가 남아있으면 본문 끝에 추가
  while (imgIdx < images.length) {
    await insertImage(ctx, page, images[imgIdx]);
    imgIdx++;
  }
  log('✅ 본문 입력 완료');
  return true;
}

// ===== 이미지 삽입 (툴바 이미지 버튼 → 파일 선택) ===================
async function insertImage(ctx, page, src) {
  try {
    const localPath = await resolveImagePath(src);
    // 이미지 툴바 버튼 후보
    const btnSelectors = [
      'button.se-image-toolbar-button',
      'button[data-name="image"]',
      'button.se-toolbar-item-image',
      'button[title*="사진"]',
    ];
    let fileChooser = null;
    for (const sel of btnSelectors) {
      const btn = ctx.locator(sel).first();
      if (await btn.count()) {
        // 파일 선택창은 page 레벨에서 잡힘
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null),
          btn.click({ timeout: 5000 }),
        ]);
        fileChooser = chooser;
        break;
      }
    }
    if (fileChooser) {
      await fileChooser.setFiles(localPath);
      await page.waitForTimeout(3000); // 업로드 대기
      log(`🖼️ 이미지 삽입: ${path.basename(localPath)}`);
    } else {
      log(`⚠️ 이미지 버튼/파일창을 못 찾음 — 건너뜀 (${src})`);
    }
  } catch (e) {
    log(`⚠️ 이미지 삽입 오류(${src}): ${e.message}`);
  }
}

// ===== 태그 입력 =================================================
async function typeTags(ctx, page, tags) {
  if (!tags.length) return;
  try {
    const tagInput = ctx.locator('input.se-tag-input, input[placeholder*="태그"]').first();
    if (await tagInput.count()) {
      await tagInput.click();
      for (const t of tags) {
        await page.keyboard.type(t.replace(/^#/, ''), { delay: CONFIG.TYPING_DELAY });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
      log(`🏷️ 태그 입력: ${tags.join(', ')}`);
    }
  } catch (e) {
    log(`ℹ️ 태그 입력 단계 건너뜀: ${e.message}`);
  }
}

// ===== 발행 / 임시저장 ============================================
async function publish(ctx, page) {
  if (FLAGS.dry) { log('🧪 --dry 모드: 발행/저장 생략'); return true; }

  if (FLAGS.draft) {
    const saveSelectors = ['button:has-text("저장")', 'button.save_btn', 'button[data-name="save"]'];
    for (const sel of saveSelectors) {
      try {
        const b = ctx.locator(sel).first();
        if (await b.count() && await b.isVisible()) {
          await b.click(); await page.waitForTimeout(2000);
          log('💾 임시저장 완료 (--draft)'); return true;
        }
      } catch (_) {}
    }
    log('⚠️ 임시저장 버튼 못 찾음'); return false;
  }

  // 실제 발행: 상단 '발행' 버튼(예약 버튼 제외) → 발행 옵션 패널 → 확정 '발행'
  try {
    // 1) 발행 패널 열기 — '예약(schedule)' 버튼은 건너뛰고 보이는 발행 버튼 클릭
    let opened = false;
    const openCandidates = [
      'button[data-click-area="tpb.publish"]',
      'button:has-text("발행")',
      'button.publish_btn__m9KHH',
    ];
    for (const sel of openCandidates) {
      const loc = ctx.locator(sel);
      const n = await loc.count();
      for (let i = 0; i < n; i++) {
        const el = loc.nth(i);
        try {
          const area = (await el.getAttribute('data-click-area')) || '';
          if (area.includes('schedule')) continue;   // 예약 버튼 제외
          if (!(await el.isVisible())) continue;
          await el.click({ timeout: 5000 });
          opened = true;
          break;
        } catch (_) {}
      }
      if (opened) break;
    }
    if (!opened) { log('⚠️ 발행 패널 열기 실패 — 셀렉터 확인 필요'); return false; }
    await page.waitForTimeout(1800);

    // 2) 발행 패널 안의 최종 확정 버튼 (뒤쪽/보이는 것 우선)
    const confirmCandidates = [
      'button[data-click-area="tpb*t.publish"]',
      'button.confirm_btn__WEaBq',
      '.se-popup-container button:has-text("발행")',
      'button:has-text("발행")',
    ];
    for (const sel of confirmCandidates) {
      const loc = ctx.locator(sel);
      const n = await loc.count();
      for (let i = n - 1; i >= 0; i--) {
        const el = loc.nth(i);
        try {
          const area = (await el.getAttribute('data-click-area')) || '';
          if (area.includes('schedule')) continue;
          if (!(await el.isVisible())) continue;
          await el.click({ timeout: 5000 });
          await page.waitForTimeout(3000);
          log('✅ 발행 완료!');
          return true;
        } catch (_) {}
      }
    }
    log('⚠️ 발행 패널은 열렸으나 확정 버튼 미감지 — 화면에서 확인 필요');
    return false;
  } catch (e) {
    log(`⚠️ 발행 버튼 오류: ${e.message}`);
    return false;
  }
}

// ===== 메인 =====================================================
async function postToNaver(post) {
  log('='.repeat(50));
  log('네이버 블로그 자동 발행 시작' + (FLAGS.draft ? ' [임시저장]' : '') + (FLAGS.dry ? ' [DRY]' : ''));
  log('='.repeat(50));
  log(`제목: ${post.title}`);
  log(`이미지: ${post.images.length}개 / 태그: ${post.tags.length}개`);

  if (!fs.existsSync(CONFIG.SESSION_FILE)) {
    log('❌ 세션 파일 없음! naver-bc-automation 폴더에서 npm run login 먼저 실행하세요.');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: CONFIG.HEADLESS,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
  const context = await browser.newContext({
    storageState: CONFIG.SESSION_FILE,
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let ok = false;
  try {
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRY; attempt++) {
      try {
        log(`📝 에디터 이동 중... (시도 ${attempt}/${CONFIG.MAX_RETRY})`);
        await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${CONFIG.NAVER_BLOG_ID}`, {
          waitUntil: 'domcontentloaded', timeout: 30000,
        });
        await page.waitForTimeout(3500);

        const editor = await getEditorFrame(page);
        await dismissPopups(editor);
        await dismissPopups(page);

        await typeTitle(editor, page, post.title);
        await page.waitForTimeout(600);
        await typeBody(editor, page, post.content, post.images);
        await page.waitForTimeout(800);
        await typeTags(editor, page, post.tags);
        await page.waitForTimeout(600);

        ok = await publish(editor, page);
        if (ok) break;
      } catch (inner) {
        log(`⚠️ 시도 ${attempt} 실패: ${inner.message}`);
        if (attempt < CONFIG.MAX_RETRY) await page.waitForTimeout(2000);
      }
    }

    if (!ok && !FLAGS.dry) {
      log('🙋 자동 발행 실패 — 30초 안에 수동으로 발행/확인해 주세요...');
      await page.waitForTimeout(30000);
    }
    log(`\n🎉 종료! https://blog.naver.com/${CONFIG.NAVER_BLOG_ID}`);
  } catch (error) {
    log(`❌ 치명적 오류: ${error.message}`);
  } finally {
    await page.waitForTimeout(FLAGS.dry ? 8000 : 3000);
    await browser.close();
  }
  return ok;
}

// ===== 샘플 글 (post.json 없을 때 사용) ===========================
const SAMPLE_POST = {
  title: '🌸 2026년 봄 여행지 BEST 5! 꽃구경 하기 딱 좋은 곳은?',
  content: `안녕하세요! 벌써 3월 말이 되었네요.

오늘은 2026년 봄 여행지 추천을 드리려고 합니다.
[IMAGE_HERE]
국내 봄꽃 명소 첫 번째는 진해 군항제입니다.
매년 4월 초에 열리는 국내 최대 벚꽃 축제예요.

두 번째는 여의도 한강공원입니다.
서울에서 가장 접근성 좋은 봄꽃 명소예요.
[IMAGE_HERE]
봄 여행 준비 팁도 정리했어요.
TIP 1: 숙소는 최소 2개월 전에 예약하세요.
TIP 2: 일교차가 크니 얇은 겉옷 필수!

오늘 소개가 도움이 되셨나요? ♥ 공감과 댓글 부탁드려요!`,
  tags: ['봄여행', '여행지추천', '2026봄'],
  images: [], // 예: ['https://picsum.photos/800/500', 'C:\\Users\\ggbug\\Pictures\\spring.jpg']
};

// ===== 실행 =====================================================
postToNaver(loadPost());
