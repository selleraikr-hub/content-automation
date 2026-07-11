/**
 * loadenv.js — 의존성 없는 초경량 .env 로더
 * 같은 폴더의 .env 파일을 읽어 process.env에 넣어줍니다. (없으면 조용히 무시)
 * 형식:  KEY=value   (# 주석 가능)
 */
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const eq = s.indexOf('=');
      if (eq === -1) continue;
      const key = s.slice(0, eq).trim();
      let val = s.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
} catch (_) { /* ignore */ }
