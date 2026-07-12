/**
 * threads_reel.js — 소재 → 짤영상(9:16 + BGM) 자동 생성
 *   후킹→내용→CTA 프레임을 실사진 배경 위에 렌더 → ffmpeg 로 세로 영상 합성.
 *
 * 모듈:  const { buildReel } = require('./threads_reel');
 *        const { videoPath, caption } = await buildReel('자취생 국룰');
 * 단독:  node threads_reel.js "자취생 국룰"            (영상만 생성, 게시 X)
 *        node threads_reel.js "..." --sec 2.6          (프레임당 초)
 *        node threads_reel.js "..." --nomusic          (무음)
 *
 * BGM은 music/ 폴더의 "저작권 프리" mp3 를 자동 사용. 없으면 무음.
 * ffmpeg 필요 (Windows: winget install Gyan.FFmpeg).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { threadsReelPrompt } = require('./prompts');
const { askClaude } = require('./generate');
const { renderCard, fetchBg } = require('./threads_card');

const FRAMES_DIR = path.join(__dirname, 'threads_reel_frames');
const MUSIC_DIR = path.join(__dirname, 'music');
const OUT = path.join(__dirname, 'threads_reel.mp4');
const W = 1080, H = 1920;

function extractJson(t) {
  t = String(t).replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('릴 JSON 파싱 실패');
  return JSON.parse(t.slice(s, e + 1));
}

async function makeScript(topic) {
  for (let i = 0; i < 3; i++) {
    try {
      const d = extractJson(await askClaude(threadsReelPrompt(topic)));
      const frames = (d.frames || []).filter(f => f && (f.lines || f.headline));
      const caption = (d.caption || '').trim();
      if (frames.length >= 2 && caption) return { frames, caption };
    } catch (e) { console.log('⚠️ 대본 재시도(' + (i + 1) + '/3): ' + e.message); }
  }
  return {
    frames: [
      { kind: 'hook', headline: topic, lines: ['이거 나만 그런 거', '아니지?'], bg_query: 'cozy home evening' },
      { kind: 'body', headline: '', lines: ['다들 겪는 그 순간'], bg_query: 'young person thinking' },
      { kind: 'cta', headline: '', lines: ['공감하면', '팔로우 ㄱㄱ'], bg_query: 'phone social media' },
    ],
    caption: topic + '\n\n나만 그런 거 아니지? 😅\n공감되면 댓글 ㄱㄱ',
  };
}

function ffmpegOk() { return spawnSync('ffmpeg', ['-version']).status === 0; }

function buildVideo(frameFiles, sec, noMusic) {
  const durs = frameFiles.map((f, i) => (i === 0 ? sec + 0.8 : (i === frameFiles.length - 1 ? sec + 0.4 : sec)));
  const total = +durs.reduce((a, b) => a + b, 0).toFixed(2);

  let music = null;
  if (!noMusic && fs.existsSync(MUSIC_DIR)) {
    const tracks = fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|m4a|aac|wav)$/i.test(f) && !/^bgm_/i.test(f)).sort(); // bgm_* = 합성 드론이라 제외, 진짜 곡만 사용
    if (tracks.length) music = path.join(MUSIC_DIR, tracks[Math.floor(Math.random() * tracks.length)]);
  }

  const listPath = path.join(__dirname, '_reel_frames.txt');
  let list = '';
  frameFiles.forEach((f, i) => { list += "file '" + f.replace(/\\/g, '/') + "'\nduration " + durs[i] + '\n'; });
  list += "file '" + frameFiles[frameFiles.length - 1].replace(/\\/g, '/') + "'\n";
  fs.writeFileSync(listPath, list);

  const vf = 'scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p';
  let args;
  if (music) {
    const fadeStart = Math.max(0, total - 2).toFixed(2);
    args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-stream_loop', '-1', '-i', music,
      '-map', '0:v:0', '-map', '1:a:0', '-vf', vf, '-af', 'afade=t=out:st=' + fadeStart + ':d=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT];
  } else {
    args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-vf', vf,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT];
  }
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  try { fs.unlinkSync(listPath); } catch (_) {}
  if (r.status !== 0) throw new Error('ffmpeg 변환 실패');
  return { total, music };
}

async function buildReel(topic, opts) {
  opts = opts || {};
  const sec = opts.sec || 2.6;
  const noMusic = !!opts.noMusic;
  if (!ffmpegOk()) throw new Error('ffmpeg 없음 (Windows: winget install Gyan.FFmpeg)');

  console.log('🎬 대본 생성 중... (소재: ' + topic + ')');
  const { frames, caption } = await makeScript(topic);
  console.log('   ↳ ' + frames.length + '장 프레임');

  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.readdirSync(FRAMES_DIR).filter(f => /^frame_\d+\.png$/.test(f)).forEach(f => fs.unlinkSync(path.join(FRAMES_DIR, f)));

  const frameFiles = [];
  for (let i = 0; i < frames.length; i++) {
    const fr = frames[i];
    const bgUrl = await fetchBg(fr.bg_query || (fr.lines || []).join(' '));
    const out = path.join(FRAMES_DIR, 'frame_' + String(i + 1).padStart(2, '0') + '.png');
    await renderCard({ headline: fr.headline, lines: fr.lines, bgUrl }, out, { width: W, height: H });
    frameFiles.push(out);
    console.log('   🖼️ ' + path.basename(out) + (bgUrl ? ' (사진)' : ''));
  }

  const { total, music } = buildVideo(frameFiles, sec, noMusic);
  console.log('🎞️ 영상 완료: ' + OUT + ' (' + total + 's' + (music ? ', BGM ' + path.basename(music) : ', 무음') + ')');
  return { videoPath: OUT, caption };
}

module.exports = { buildReel };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const getArg = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
  const secArg = getArg('--sec');
  const topic = argv.filter(a => !a.startsWith('--') && a !== secArg).join(' ').trim() || '자취생 국룰';
  buildReel(topic, { sec: parseFloat(secArg || '2.6'), noMusic: argv.includes('--nomusic') })
    .then(r => console.log('\n✅ 완료. 게시: node threads_post.js "' + topic + '" --growth --video "' + r.videoPath + '" --text "..." --publish'))
    .catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
}
