/**
 * make_video.js — cards/*.png 를 세로 9:16 슬라이드 영상으로 합침 (+BGM) (ffmpeg 필요)
 *
 * 실행: node make_video.js               (카드당 2.6초, music/ 폴더 첫 곡 자동 사용)
 *       node make_video.js --sec 3       (카드당 초)
 *       node make_video.js --music x.mp3 (특정 음악)
 *       node make_video.js --nomusic     (무음)
 * 결과: tiktok_video.mp4
 *
 * ⚠️ 음악은 반드시 "저작권 프리(로열티 프리)" 곡을 music/ 폴더에 넣으세요.
 *    저작권 있는 곡은 틱톡에서 음소거/삭제될 수 있어요.
 *    ffmpeg 설치: winget install Gyan.FFmpeg
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const getArg = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const sec = parseFloat(getArg('--sec') || '2.6');
const noMusic = argv.includes('--nomusic');
const musicArg = getArg('--music');

const cardsDir = path.join(__dirname, 'cards');
const musicDir = path.join(__dirname, 'music');
const out = path.join(__dirname, 'tiktok_video.mp4');

if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('❌ ffmpeg 가 없습니다.\n   Windows: winget install Gyan.FFmpeg  (설치 후 새 CMD)');
  process.exit(1);
}

const imgs = fs.existsSync(cardsDir)
  ? fs.readdirSync(cardsDir).filter(f => /^card_\d+\.png$/.test(f)).sort() : [];
if (!imgs.length) { console.error('❌ cards/ 에 이미지가 없습니다. 먼저 node cards.js'); process.exit(1); }

// BGM 결정: --music > music/ 폴더 첫 오디오 파일
let music = null;
if (!noMusic) {
  if (musicArg) {
    music = path.isAbsolute(musicArg) ? musicArg : path.join(__dirname, musicArg);
    if (!fs.existsSync(music)) { console.error('❌ 음악 파일 없음: ' + music); process.exit(1); }
  } else if (fs.existsSync(musicDir)) {
    const tracks = fs.readdirSync(musicDir).filter(f => /\.(mp3|m4a|aac|wav)$/i.test(f)).sort();
    if (tracks.length) music = path.join(musicDir, tracks[0]);
  }
}

const dur = +(imgs.length * sec).toFixed(2);
const listPath = path.join(__dirname, '_frames.txt');
let list = '';
for (const f of imgs) list += `file '${path.join(cardsDir, f).replace(/\\/g, '/')}'\nduration ${sec}\n`;
list += `file '${path.join(cardsDir, imgs[imgs.length - 1]).replace(/\\/g, '/')}'\n`;
fs.writeFileSync(listPath, list);

const vf = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p';
let args;
if (music) {
  const fadeStart = Math.max(0, dur - 2).toFixed(2);
  console.log(`🎞️ ${imgs.length}장 → 영상 생성 (카드당 ${sec}s, 길이 ${dur}s)`);
  console.log(`🎵 BGM: ${path.basename(music)}`);
  args = [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-stream_loop', '-1', '-i', music,             // 음악이 짧으면 반복
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', vf,
    '-af', `afade=t=out:st=${fadeStart}:d=2`,        // 끝 2초 페이드아웃
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', out,
  ];
} else {
  console.log(`🎞️ ${imgs.length}장 → 영상 생성 (카드당 ${sec}s, 무음)`);
  console.log('ℹ️ music/ 폴더에 저작권 프리 mp3를 넣으면 자동으로 BGM이 들어가요.');
  args = [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
  ];
}

const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
fs.unlinkSync(listPath);
if (r.status !== 0) { console.error('❌ ffmpeg 변환 실패'); process.exit(1); }
console.log(`\n✅ 영상 완료: ${out}`);
