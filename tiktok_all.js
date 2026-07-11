/**
 * tiktok_all.js — 틱톡 원스톱 자동화
 *   node tiktok_all.js "주제"              // 글생성 → 카드 → 영상 → 업로드(검토 모드)
 *   node tiktok_all.js "주제" --publish     // 최종 게시까지 자동
 *   node tiktok_all.js                      // 기존 post.json 사용(글 생성 건너뜀)
 */
const { spawnSync } = require('child_process');
const path = require('path');
const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const topic = args.filter(a => !a.startsWith('--')).join(' ').trim();

function run(file, extra = []) {
  console.log(`\n▶ node ${file} ${extra.join(' ')}`);
  return spawnSync('node', [path.join(__dirname, file), ...extra], { stdio: 'inherit' }).status === 0;
}

(async () => {
  console.log('='.repeat(55));
  console.log('🎵 틱톡 원스톱 자동화' + (topic ? ` — 주제: ${topic}` : ' — 기존 post.json 사용'));
  console.log('='.repeat(55));

  if (topic) { if (!run('generate.js', [topic])) return console.error('❌ 글 생성 실패'); }
  if (!run('cards.js')) return console.error('❌ 카드 생성 실패');
  if (!run('make_video.js')) return console.error('❌ 영상 생성 실패 (ffmpeg 확인)');
  if (!run('tiktok_upload.js', flags.includes('--publish') ? ['--publish'] : [])) return console.error('❌ 업로드 실패');

  console.log('\n🎉 틱톡 파이프라인 완료!');
})();
