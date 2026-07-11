/**
 * daily_auto.js — 매일 자동 실행 (topics.txt 에서 주제 로테이션)
 *   node daily_auto.js            블로그만 발행
 *   node daily_auto.js --tiktok   블로그 + 틱톡 발행
 *   node daily_auto.js --topic "직접 지정 주제"
 * 실행 이력은 history.json 에 기록 (모니터링용).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const withTiktok = argv.includes('--tiktok');
const topicArg = (() => { const i = argv.indexOf('--topic'); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; })();

const STATE = path.join(__dirname, '.auto_state.json');
const HISTORY = path.join(__dirname, 'history.json');
const now = new Date().toISOString();

// 주제 선택 (지정 > topics.txt 로테이션)
function pickTopic() {
  if (topicArg) return topicArg;
  const tp = path.join(__dirname, 'topics.txt');
  const list = fs.existsSync(tp)
    ? fs.readFileSync(tp, 'utf-8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    : [];
  if (!list.length) return '클로드 AI 활용법';
  let idx = 0;
  try { idx = JSON.parse(fs.readFileSync(STATE, 'utf-8')).idx || 0; } catch (_) {}
  const topic = list[idx % list.length];
  fs.writeFileSync(STATE, JSON.stringify({ idx: (idx + 1) % list.length, last: topic, at: now }));
  return topic;
}

function run(file, extra) {
  const r = spawnSync('node', [path.join(__dirname, file), ...extra], { cwd: __dirname, stdio: 'inherit' });
  return r.status === 0;
}

function record(entry) {
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(HISTORY, 'utf-8')); } catch (_) {}
  hist.unshift(entry);
  fs.writeFileSync(HISTORY, JSON.stringify(hist.slice(0, 200), null, 2));
}

(async () => {
  const topic = pickTopic();
  console.log(`\n📅 [${now}] 오늘의 자동 발행 — 주제: ${topic}`);

  const blogOk = run('run_all.js', [topic]);
  let tiktokOk = null;
  if (withTiktok) {
    console.log('\n🎵 틱톡 발행 시작...');
    tiktokOk = run('tiktok_all.js', [topic, '--publish']);
  }

  record({ time: now, topic, blog: blogOk ? 'success' : 'fail', tiktok: tiktokOk === null ? 'skip' : (tiktokOk ? 'success' : 'fail') });
  console.log(`\n✅ 완료 — 블로그: ${blogOk ? '성공' : '실패'}${withTiktok ? `, 틱톡: ${tiktokOk ? '성공' : '실패'}` : ''}`);
  console.log('   이력: history.json');
})();
