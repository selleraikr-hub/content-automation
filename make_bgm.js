/**
 * make_bgm.js — 저작권 100% 프리 배경음(앰비언트 패드)을 직접 생성 → music/ 폴더
 *   내가(코드가) 합성한 소리라 저작권/음소거 걱정 없이 무제한 사용 가능.
 *   짤영상(threads_reel.js)이 music/ 폴더에서 자동으로 한 곡 골라 깔아줍니다.
 *
 * 실행:  node make_bgm.js            (4가지 무드 생성, 각 ~40초)
 *        node make_bgm.js --sec 30   (길이 조절)
 * ffmpeg 필요.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const SEC = parseFloat(getArg('--sec') || '40');
const MUSIC_DIR = path.join(__dirname, 'music');

// 무드별 화음(주파수 Hz) + 트레몰로 속도
const MOODS = [
  { name: 'bgm_warm',   freqs: [261.63, 329.63, 392.00, 523.25], trem: 0.14, lp: 1800 }, // C add9 따뜻
  { name: 'bgm_calm',   freqs: [220.00, 261.63, 329.63, 440.00], trem: 0.10, lp: 1600 }, // Am 잔잔
  { name: 'bgm_dreamy', freqs: [293.66, 349.23, 440.00, 587.33], trem: 0.18, lp: 2000 }, // Dm 몽환
  { name: 'bgm_chill',  freqs: [196.00, 246.94, 293.66, 392.00], trem: 0.12, lp: 1500 }, // G 로우 chill
];

if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('❌ ffmpeg 없음 (Windows: winget install Gyan.FFmpeg)');
  process.exit(1);
}
fs.mkdirSync(MUSIC_DIR, { recursive: true });

function build(mood) {
  const inputs = [];
  mood.freqs.forEach(f => { inputs.push('-f', 'lavfi', '-i', 'sine=frequency=' + f + ':duration=' + SEC); });
  const n = mood.freqs.length;
  const mix = Array.from({ length: n }, (_, i) => '[' + i + ']').join('');
  const fadeOut = Math.max(0, SEC - 4).toFixed(2);
  const filter = mix + 'amix=inputs=' + n + ':normalize=1,'
    + 'tremolo=f=' + mood.trem + ':d=0.4,'
    + 'lowpass=f=' + mood.lp + ','
    + 'aecho=0.8:0.9:1000:0.3,'
    + 'volume=-16dB,'
    + 'afade=t=in:st=0:d=3,afade=t=out:st=' + fadeOut + ':d=4[a]';
  const out = path.join(MUSIC_DIR, mood.name + '.mp3');
  const args = [...['-y'], ...inputs, '-filter_complex', filter, '-map', '[a]', '-c:a', 'libmp3lame', '-q:a', '4', out];
  const r = spawnSync('ffmpeg', args, { stdio: 'ignore' });
  if (r.status !== 0) throw new Error('생성 실패: ' + mood.name);
  return out;
}

console.log('🎵 저작권 프리 BGM 생성 중... (각 ' + SEC + '초)');
for (const m of MOODS) {
  const out = build(m);
  console.log('   ✅ ' + path.basename(out));
}
console.log('\n🎉 완료! music/ 폴더에 저장. 짤영상이 자동으로 골라 씁니다.');
console.log('ℹ️ 더 트렌디한 곡을 원하면 Pixabay Music·유튜브 오디오 보관함(무료)에서 mp3를 받아 music/ 에 넣으면 그걸 우선 사용해요.');
