/**
 * run_all.js — 원스톱 자동화
 * 주제 하나 입력 → generate.js(키워드→제목→본문→post.json) → naver_blog.js(발행)
 *
 * 실행:
 *   node run_all.js "강남 필라테스"          // 생성 후 완전 자동 발행
 *   node run_all.js "강남 필라테스" --draft   // 생성 후 임시저장까지만(검토용)
 *   node run_all.js "강남 필라테스" --gen-only // 생성만, 발행 안 함
 */
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const topic = args.filter(a => !a.startsWith('--')).join(' ').trim();

if (!topic) {
  console.error('사용법: node run_all.js "주제" [--draft|--gen-only]');
  process.exit(1);
}

function run(file, extra = []) {
  console.log(`\n▶ node ${file} ${[topic, ...extra].join(' ')}`);
  const r = spawnSync('node', [path.join(__dirname, file), ...(file === 'generate.js' ? [topic] : []), ...extra], {
    stdio: 'inherit',
  });
  return r.status === 0;
}

(async () => {
  console.log('='.repeat(55));
  console.log(`🚀 원스톱 자동화 시작 — 주제: ${topic}`);
  console.log('='.repeat(55));

  // 1) 콘텐츠 생성
  if (!run('generate.js')) {
    console.error('\n❌ 콘텐츠 생성 실패 — 발행 중단');
    process.exit(1);
  }

  // 2) 발행 (--gen-only면 생략)
  if (flags.includes('--gen-only')) {
    console.log('\n🧪 --gen-only: post.json만 생성하고 종료했습니다.');
    return;
  }
  const pubFlags = flags.includes('--draft') ? ['--draft'] : [];
  if (!run('naver_blog.js', pubFlags)) {
    console.error('\n⚠️ 발행 단계에서 문제가 있었어요. naver_blog_log.txt를 확인하세요.');
    process.exit(1);
  }

  console.log('\n🎉 원스톱 완료!');
})();
