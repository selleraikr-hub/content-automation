/**
 * generate.js — 주제 입력 → (Claude API) 수익형 키워드 → 제목 → SEO 본문 생성 → post.json 저장
 *
 * 실행:  node generate.js "주제"
 *   예)  node generate.js "강남 필라테스"
 *
 * 결과물: post.json (naver_blog.js가 읽어서 발행), keywords_<주제>.md (키워드 분석 참고용)
 */
const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const { keywordPrompt, articleJsonPrompt } = require('./prompts');
const naver = require('./naver');

// ---- Claude API 호출 (Node18+ 내장 fetch 사용, 추가 설치 불필요) ----
async function askClaude(prompt, model) {
  if (!CONFIG.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY 가 비어 있습니다. .env 또는 환경변수에 넣어주세요.');
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API ${res.status}: ${t}`);
  }
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('\n').trim();
}

// ---- 이미지 검색어 → 실제 이미지 URL ----
async function resolveImages(queries) {
  const urls = [];
  for (const q of queries) {
    let found = null;

    // 1순위) Unsplash — 구체 검색어로 상위 후보 중 선택, 없으면 앞 2단어로 재시도
    if (CONFIG.UNSPLASH_ACCESS_KEY) {
      const tryQueries = [q, q.split(/\s+/).slice(0, 2).join(' ')];
      for (const qq of tryQueries) {
        try {
          const r = await fetch(
            `https://api.unsplash.com/search/photos?per_page=5&orientation=landscape&content_filter=high&query=${encodeURIComponent(qq)}`,
            { headers: { Authorization: `Client-ID ${CONFIG.UNSPLASH_ACCESS_KEY}` } }
          );
          const j = await r.json();
          const hit = j.results && j.results.find(x => x && x.urls && x.urls.regular);
          if (hit) { found = hit.urls.regular; console.log(`   🖼️ Unsplash: ${qq}`); break; }
        } catch (_) {}
      }
    }

    // 2순위) Openverse — 키 없이 주제 맞춤(무료, 상업적 사용 가능 필터)
    if (!found) {
      try {
        const r = await fetch(
          `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=1&license_type=commercial&mature=false`,
          { headers: { 'User-Agent': 'naver-bc-automation/2.0 (blog automation)' } }
        );
        const j = await r.json();
        found = (j.results && j.results[0] && j.results[0].url) || null;
        if (found) console.log(`   🖼️ Openverse: ${q}`);
      } catch (_) {}
    }

    // 3순위) 최후 폴백 — 랜덤 placeholder (항상 동작)
    if (!found) {
      found = `https://picsum.photos/seed/${encodeURIComponent(q)}/800/500`;
      console.log(`   🖼️ (폴백 랜덤) ${q}`);
    }
    urls.push(found);
  }
  return urls;
}

// ---- 모델 출력에서 JSON만 안전하게 추출 ----
function extractJson(text) {
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON을 찾지 못함:\n' + text.slice(0, 300));
  let body = t.slice(start, end + 1);
  // 잘못 낀 제어문자 제거(줄바꿈/탭 제외) → 파싱 실패 완화
  body = body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return JSON.parse(body);
}

async function main() {
  const topic = process.argv.slice(2).join(' ').trim();
  if (!topic) {
    console.error('사용법: node generate.js "주제"   (예: node generate.js "강남 필라테스")');
    process.exit(1);
  }

  console.log(`\n🧠 [1/3] 수익형 키워드 추출 중... (주제: ${topic})`);
  let keywords = '';
  try {
    const _w = topic.split(/\s+/).filter(x => x.length >= 2);
    const _hints = Array.from(new Set([..._w, topic.replace(/\s+/g, '')])).filter(Boolean);
    const vols = await naver.keywordVolumes(_hints);
    if (vols && vols.any) {
      const top = vols.withVol.slice(0, 15);
      const volLines = top.map(k => `- ${k.keyword} | 월검색량 ${k.total} | 경쟁 ${k.comp}`).join('\n');
      const nameSample = vols.names.slice(0, 40).join(', ');
      keywords = `네이버 실제 월간 검색량(확인된 키워드):\n${volLines}\n\n관련 키워드 후보(검색량 미확인): ${nameSample}\n\n위에서 "검색량 충분 + 경쟁 중~하"인 수익형 키워드를 메인으로 골라 활용해.`;
      console.log(`   ↳ 네이버 실검색량 ${vols.withVol.length}개 (상위: ${top.slice(0, 3).map(k => `${k.keyword}(${k.total})`).join(', ')}) + 후보 ${vols.names.length}개`);
    } else if (vols && vols.names.length) {
      console.log(`   ℹ️ 검색량은 네이버 일일쿼터로 일시 제한 → 관련어 ${vols.names.length}개 참고 + AI 추정 병행`);
      keywords = `참고용 관련 키워드 후보: ${vols.names.slice(0, 40).join(', ')}`;
    }
  } catch (e) { console.log(`   ℹ️ 검색광고 API 스킵: ${e.message}`); }
  if (!keywords) keywords = await askClaude(keywordPrompt(topic)); // 폴백/보완: Claude 추정
  const kwFile = path.join(__dirname, `keywords_${topic.replace(/[\\/:*?"<>|\s]+/g, '_')}.md`);
  fs.writeFileSync(kwFile, `# ${topic} 키워드 분석\n\n${keywords}\n`);
  console.log(`   ↳ 저장: ${path.basename(kwFile)}`);

  console.log('✍️ [2/3] 제목 선정 + SEO 본문 생성 중...');
  let post = null;
  for (let attempt = 1; attempt <= 3 && !post; attempt++) {
    try {
      const raw = await askClaude(articleJsonPrompt(topic, keywords));
      post = extractJson(raw);
    } catch (e) {
      console.log(`   ⚠️ 생성 결과 파싱 실패(시도 ${attempt}/3): ${e.message}`);
      if (attempt === 3) throw new Error('3회 시도 후에도 JSON 생성 실패: ' + e.message);
    }
  }

  console.log('🖼️ [3/3] 이미지 URL 구성 중...');
  const queries = Array.isArray(post.image_queries) && post.image_queries.length
    ? post.image_queries
    : [topic];
  post.images = await resolveImages(queries);

  const out = {
    title: post.title,
    content: post.content,
    tags: Array.isArray(post.tags) ? post.tags : [],
    images: post.images,
  };
  const outPath = path.join(__dirname, 'post.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  // ---- 추가 검증: 글자수 + 제목 유사성 ----
  const charCount = (out.content || '').replace(/\s/g, '').length;
  console.log(`   📏 본문 글자수(공백 제외): ${charCount}자`);
  try {
    const sim = await naver.titleSimilarity(out.title, post.main_keyword || topic);
    if (sim) {
      const pct = Math.round(sim.score * 100);
      console.log(`   🔍 제목 유사도: 최고 ${pct}% (상위글 ${sim.count}개 중 "${sim.closest}")`);
      if (pct >= 60) console.log('   ⚠️ 제목이 상위글과 많이 겹쳐요 — 더 차별화된 제목 권장.');
    }
  } catch (e) { console.log(`   ℹ️ 제목 유사성 체크 스킵: ${e.message}`); }

  console.log('\n✅ 생성 완료!');
  console.log(`   제목: ${out.title}`);
  console.log(`   메인 키워드: ${post.main_keyword || '(미표기)'}`);
  console.log(`   태그(${out.tags.length}): ${out.tags.join(', ')}`);
  console.log(`   이미지(${out.images.length})`);
  console.log(`   → ${outPath}`);
}

if (require.main === module) {
  main().catch(err => { console.error('❌ 오류:', err.message); process.exit(1); });
}

module.exports = { askClaude };
