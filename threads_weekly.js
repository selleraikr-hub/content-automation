/**
 * threads_weekly.js — 요일별 자동 분기 스레드 발행 (계정 테마: 클로드/AI 자동화)
 *
 * 주간 편성 (주 5회):
 *   월/수/토 → AI·생산성 "공감 짤영상"  (threads_topics_ai.txt)
 *   화/금   → 클로드 "정보성 캐러셀"    (threads_topics_info.txt)
 *   목/일   → 휴식(게시 안 함)
 *
 * 실행:
 *   node threads_weekly.js              오늘 요일에 맞춰 자동
 *   node threads_weekly.js --dry        게시 직전까지만
 *   node threads_weekly.js --type reel  강제로 짤영상
 *   node threads_weekly.js --type info  강제로 정보 캐러셀
 *   node threads_weekly.js --topic "직접 소재"
 * ⚠️ 자동발행은 과하면 제재 → 하루 1회.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildReel } = require('./threads_reel');
const { buildCarousel } = require('./threads_carousel');

const argv = process.argv.slice(2);
const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const dry = argv.includes('--dry');
const typeArg = getArg('--type');      // reel | info
const topicArg = getArg('--topic');

const STATE = path.join(__dirname, '.threads_state.json');
const HISTORY = path.join(__dirname, 'threads_history.json');
const DOCS_HISTORY = path.join(__dirname, 'docs', 'threads_history.json');
const AI_TOPICS = path.join(__dirname, 'threads_topics_ai.txt');
const INFO_TOPICS = path.join(__dirname, 'threads_topics_info.txt');
const now = new Date().toISOString();

const PLAN = { 1: 'reel', 3: 'reel', 6: 'reel', 2: 'info', 5: 'info', 0: 'rest', 4: 'rest' };

function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf-8')); } catch (_) { return {}; } }
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s)); }

function pickTopic(file, key) {
  if (topicArg) return topicArg;
  const list = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    : [];
  if (!list.length) return key === 'info' ? '클로드로 업무 자동화' : 'AI로 일 떠넘기기';
  const st = loadState();
  const idx = st[key] || 0;
  const topic = list[idx % list.length];
  st[key] = (idx + 1) % list.length;
  saveState(st);
  return topic;
}

// 이력 기록 + 폰 모니터용 docs 반영 + 자동 push(실패 무시)
function record(topic, ok, type) {
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(HISTORY, 'utf-8')); } catch (_) {}
  hist.unshift({ time: now, topic, result: ok ? 'success' : 'fail', type });
  hist = hist.slice(0, 200);
  const data = JSON.stringify(hist, null, 2);
  fs.writeFileSync(HISTORY, data);
  try { fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true }); fs.writeFileSync(DOCS_HISTORY, data); } catch (_) {}
  // 폰에서 보는 GitHub Pages 갱신 — git 자동 커밋/푸시 (실패해도 게시엔 영향 없음)
  try {
    spawnSync('git', ['add', 'docs/threads_history.json'], { cwd: __dirname });
    spawnSync('git', ['commit', '-m', 'threads history ' + now], { cwd: __dirname });
    const pr = spawnSync('git', ['push'], { cwd: __dirname });
    if (pr.status === 0) console.log('📡 모니터 페이지 업데이트 push 완료');
    else console.log('ℹ️ push 스킵/실패(로컬엔 기록됨) — 나중에 GitHub Desktop에서 push해도 됩니다.');
  } catch (_) {}
}

function post(args) {
  const full = [path.join(__dirname, 'threads_post.js'), ...args];
  if (dry) full.push('--dry'); else full.push('--publish');
  const r = spawnSync('node', full, { cwd: __dirname, stdio: 'inherit' });
  return r.status === 0;
}

(async () => {
  const type = typeArg || PLAN[new Date().getDay()];
  console.log('\n📅 [' + now + '] 오늘 편성: ' + type);

  if (type === 'rest') { console.log('😴 오늘은 휴식일 — 게시 안 함.'); return; }

  if (type === 'reel') {
    const topic = pickTopic(AI_TOPICS, 'ai');
    console.log('🎬 AI 공감 짤영상 — 소재: ' + topic);
    let ok = false;
    try {
      const r = await buildReel(topic, {});
      ok = post([topic, '--growth', '--text', r.caption, '--video', r.videoPath]);
    } catch (e) { console.log('⚠️ 영상 실패: ' + e.message); }
    if (!dry) record(topic, ok, '짤영상');
    console.log('\n' + (ok ? '✅' : '⚠️') + ' 완료 — ' + topic + ' (짤영상)');
    return;
  }

  if (type === 'info') {
    const topic = pickTopic(INFO_TOPICS, 'info');
    console.log('🗂️ 클로드 정보 캐러셀 — 주제: ' + topic);
    let ok = false;
    try {
      const r = await buildCarousel(topic);
      ok = post([topic, '--growth', '--text', r.caption, '--images', r.imagePaths.join(',')]);
    } catch (e) { console.log('⚠️ 캐러셀 실패: ' + e.message); }
    if (!dry) record(topic, ok, '정보캐러셀');
    console.log('\n' + (ok ? '✅' : '⚠️') + ' 완료 — ' + topic + ' (정보캐러셀)');
    return;
  }
})().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
