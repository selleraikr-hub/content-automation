/**
 * threads_daily.js — 매일 스레드 "짤영상" 자동 발행 (팔로워 늘리기용)
 *   node threads_daily.js                     소재 로테이션 → 짤영상 만들어 자동 게시
 *   node threads_daily.js --topic "직장인 공감"  특정 소재로
 *   node threads_daily.js --dry               게시 직전까지만(검토)
 *   node threads_daily.js --card              영상 대신 짤 카드 1장으로
 *   node threads_daily.js --no-image          텍스트만
 *
 * 기본 흐름: 소재 → 짤영상(9:16+BGM) 생성 → 영상 첨부 자동 게시 → threads_history.json 기록.
 * 소재는 threads_topics.txt 에서 하루 하나씩.
 * ⚠️ 자동발행은 과하면 제재 → 하루 1~2회 권장.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { threadsCardPrompt } = require('./prompts');
const { askClaude } = require('./generate');
const { renderCard } = require('./threads_card');
const { buildReel } = require('./threads_reel');

const argv = process.argv.slice(2);
const topicArg = (() => { const i = argv.indexOf('--topic'); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; })();
const dry = argv.includes('--dry');
const cardMode = argv.includes('--card');
const noImage = argv.includes('--no-image');

const STATE = path.join(__dirname, '.threads_state.json');
const TOPICS = path.join(__dirname, 'threads_topics.txt');
const HISTORY = path.join(__dirname, 'threads_history.json');
const now = new Date().toISOString();

function pickTopic() {
  if (topicArg) return topicArg;
  const list = fs.existsSync(TOPICS)
    ? fs.readFileSync(TOPICS, 'utf-8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    : [];
  if (!list.length) return '일상 공감';
  let idx = 0;
  try { idx = JSON.parse(fs.readFileSync(STATE, 'utf-8')).idx || 0; } catch (_) {}
  const topic = list[idx % list.length];
  fs.writeFileSync(STATE, JSON.stringify({ idx: (idx + 1) % list.length, last: topic, at: now }));
  return topic;
}

function extractJson(t) {
  t = String(t).replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('카드 JSON 파싱 실패');
  return JSON.parse(t.slice(s, e + 1));
}

async function makeCard(topic) {
  for (let i = 0; i < 3; i++) {
    try {
      const data = extractJson(await askClaude(threadsCardPrompt(topic)));
      const card = data.card || {};
      const caption = (data.caption || '').trim();
      if (caption && (card.lines || card.headline)) return { card, caption };
    } catch (e) { console.log('⚠️ 생성 재시도(' + (i + 1) + '/3): ' + e.message); }
  }
  return { card: { headline: topic, lines: [topic, '다들 공감하지?'] }, caption: topic + '\n\n나만 그런 거 아니지? 😅' };
}

function record(topic, ok, type) {
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(HISTORY, 'utf-8')); } catch (_) {}
  hist.unshift({ time: now, topic, result: ok ? 'success' : 'fail', type });
  fs.writeFileSync(HISTORY, JSON.stringify(hist.slice(0, 200), null, 2));
}

(async () => {
  const topic = pickTopic();
  console.log('\n📅 [' + now + '] 오늘의 소재: ' + topic);

  let caption = '';
  let mediaFlag = null;   // ['--video', path] | ['--image', path] | null
  let type = '공감글';

  if (!noImage && !cardMode) {
    // 기본: 짤영상
    try {
      const r = await buildReel(topic, {});
      caption = r.caption;
      mediaFlag = ['--video', r.videoPath];
      type = '짤영상';
    } catch (e) {
      console.log('⚠️ 영상 생성 실패 → 카드로 대체: ' + e.message);
    }
  }

  if (!mediaFlag && !noImage) {
    // 카드 모드(또는 영상 실패 폴백)
    const { card, caption: cap } = await makeCard(topic);
    caption = cap;
    try {
      const imgPath = path.join(__dirname, 'threads_cards', 'daily_' + Date.now() + '.png');
      await renderCard(card, imgPath, { width: 1080, height: 1350 });
      mediaFlag = ['--image', imgPath];
      type = '짤카드';
      console.log('🖼️ 카드 이미지 생성:', imgPath);
    } catch (e) { console.log('⚠️ 카드 렌더 실패 → 텍스트만: ' + e.message); }
  }

  if (!caption) {
    const { caption: cap } = await makeCard(topic);
    caption = cap;
  }

  console.log('📝 캡션:\n' + caption);

  const args = [path.join(__dirname, 'threads_post.js'), topic, '--growth', '--text', caption];
  if (mediaFlag) args.push(mediaFlag[0], mediaFlag[1]);
  if (dry) args.push('--dry'); else args.push('--publish');

  const r = spawnSync('node', args, { cwd: __dirname, stdio: 'inherit' });
  const ok = r.status === 0;
  record(topic, ok, type);
  console.log('\n' + (ok ? '✅' : '⚠️') + ' 완료 — ' + topic + ' (' + type + ', ' + (ok ? '성공' : '실패') + ')');
})().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
