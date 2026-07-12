/**
 * threads_info_daily.js — 매일 "클로드 정보 인포그래픽" 자동 발행 (팔로워/저장 유발용)
 *   주제 리스트에서 하루 하나 → Fable 5로 대본 → 덱 이미지 → 자동 게시 → 이력 기록.
 *
 * 실행:
 *   node threads_info_daily.js               오늘의 주제로 자동
 *   node threads_info_daily.js --dry          게시 직전까지만(검토)
 *   node threads_info_daily.js --topic "직접 주제"
 *   node threads_info_daily.js --sonnet       대본을 Sonnet(저렴)으로 (기본은 Fable 5)
 * 소재: threads_topics_claude.txt 에서 하루 하나씩.
 * ⚠️ 자동발행은 하루 1개 권장.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildDeck } = require('./threads_deck');

const argv = process.argv.slice(2);
const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const dry = argv.includes('--dry');
const useSonnet = argv.includes('--sonnet');
const topicArg = getArg('--topic');

const STATE = path.join(__dirname, '.threads_state.json');
const TOPICS = path.join(__dirname, 'threads_topics_claude.txt');
const HISTORY = path.join(__dirname, 'threads_history.json');
const DOCS_HISTORY = path.join(__dirname, 'docs', 'threads_history.json');
const now = new Date().toISOString();

function pickTopic() {
  if (topicArg) return topicArg;
  const list = fs.existsSync(TOPICS)
    ? fs.readFileSync(TOPICS, 'utf-8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    : [];
  if (!list.length) return '클로드 제대로 쓰는 법';
  let st = {}; try { st = JSON.parse(fs.readFileSync(STATE, 'utf-8')); } catch (_) {}
  const idx = st.claude || 0;
  const topic = list[idx % list.length];
  st.claude = (idx + 1) % list.length;
  fs.writeFileSync(STATE, JSON.stringify(st));
  return topic;
}

function record(topic, ok) {
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(HISTORY, 'utf-8')); } catch (_) {}
  hist.unshift({ time: now, topic, result: ok ? 'success' : 'fail', type: '정보덱' });
  hist = hist.slice(0, 200);
  const data = JSON.stringify(hist, null, 2);
  fs.writeFileSync(HISTORY, data);
  try { fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true }); fs.writeFileSync(DOCS_HISTORY, data); } catch (_) {}
  try {
    spawnSync('git', ['add', 'docs/threads_history.json'], { cwd: __dirname });
    spawnSync('git', ['commit', '-m', 'threads history ' + now], { cwd: __dirname });
    const pr = spawnSync('git', ['push'], { cwd: __dirname });
    console.log(pr.status === 0 ? '📡 모니터 push 완료' : 'ℹ️ push 스킵(로컬 기록됨)');
  } catch (_) {}
}

(async () => {
  const topic = pickTopic();
  console.log('\n📅 [' + now + '] 오늘의 클로드 정보 주제: ' + topic);
  let ok = false, caption = '', images = [];
  try {
    const r = await buildDeck(topic, { fable: !useSonnet });
    caption = r.caption; images = r.imagePaths;
  } catch (e) { console.log('⚠️ 덱 생성 실패: ' + e.message); }

  if (images.length) {
    const a = [path.join(__dirname, 'threads_post.js'), '클로드 자동화', '--growth', '--text', caption, '--images', images.join(',')];
    a.push(dry ? '--dry' : '--publish');
    const r = spawnSync('node', a, { cwd: __dirname, stdio: 'inherit' });
    ok = r.status === 0;
  }
  if (!dry) record(topic, ok);
  console.log('\n' + (ok ? '✅' : '⚠️') + ' 완료 — ' + topic + ' (정보덱' + (dry ? ', 검토' : '') + ')');
})().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
