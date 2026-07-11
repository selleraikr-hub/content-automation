# 네이버 블로그 수익형 자동 발행 시스템 v2

주제 하나만 입력하면 **수익형 키워드 추출 → 클릭되는 제목 → SEO 본문 생성 → 이미지 삽입 → 네이버 자동 발행**까지 원스톱으로 실행됩니다. (마케터C 노션 프롬프트 4종 적용)

## 파일 구성

| 파일 | 역할 |
|---|---|
| `run_all.js` | **원스톱 실행** (생성 → 발행) |
| `generate.js` | Claude API로 키워드·제목·본문 생성 → `post.json` 저장 |
| `prompts.js` | 노션 프롬프트 템플릿 (고단가 키워드 / 제목 / 정보성 본문 / 8요소 공식) |
| `naver_blog.js` | Playwright로 네이버 블로그 발행 (이미지 삽입 포함) |
| `save_session.js` | 네이버 로그인 세션 저장 (최초 1회) |
| `config.js` / `loadenv.js` | 설정 · `.env` 로더 |
| `.env.example` | API 키 입력 양식 |
| `post.json` | 생성된 글(발행 입력값) |

## 처음 한 번만 (설치)

```cmd
cd C:\Users\ggbug\Desktop\naver-bc-automation
npm install                      :: playwright 설치
npx playwright install chromium  :: 크롬 엔진 설치
copy .env.example .env           :: 그 다음 .env 열어서 ANTHROPIC_API_KEY 채우기
node save_session.js             :: 크롬 열리면 네이버 직접 로그인 → 터미널에서 엔터 → 세션 저장
```

> Node 18 이상 필요(내장 fetch 사용). `node -v`로 확인하세요.

## 사용법

```cmd
node run_all.js "강남 필라테스"              :: 생성 + 완전 자동 발행
node run_all.js "강남 필라테스" --draft       :: 생성 + 임시저장까지만(검토용, 추천 첫 실행)
node run_all.js "강남 필라테스" --gen-only     :: post.json 생성만
```

개별 실행:
```cmd
node generate.js "강남 필라테스"    :: 글만 생성
node naver_blog.js --dry           :: 발행 동작만 테스트(발행 X)
node naver_blog.js                 :: post.json 발행
```

## 추천 첫 실행 순서 (안전)

1. `node save_session.js` → 네이버 로그인 세션 저장
2. `node generate.js "관심주제"` → `post.json`, `keywords_*.md` 확인
3. `node naver_blog.js --dry` → 브라우저 동작 확인(발행 X)
4. 이상 없으면 `node run_all.js "관심주제"` 로 완전 자동

## 주의

- **네이버 자동발행은 정책상 리스크가 있습니다.** 과도한 자동 발행은 저품질/제재 대상이 될 수 있으니, 하루 1~2건·사람이 검토하는 `--draft` 사용을 권장합니다.
- 셀렉터(제목/이미지 버튼 등)는 네이버가 바꾸면 실패할 수 있어요. 실패 시 `naver_blog_log.txt`에 막힌 지점이 기록됩니다.
- 모델명 오류가 나면 `config.js`의 MODEL을 콘솔에서 쓸 수 있는 모델명으로 바꾸세요.
- `.env`와 세션 파일에는 민감정보가 있으니 **공유·업로드 금지**.
- 이전 문서에 노출됐던 네이버 비밀번호는 꼭 변경하세요.
