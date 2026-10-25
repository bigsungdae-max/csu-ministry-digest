// 총신대 사역게시판 하루치 글을 모아 정리 페이지(docs/)를 만들고, 카카오톡 '나에게 보내기'로 요약을 보냅니다.
//
// 사용법:
//   node digest.mjs                 어제(한국 시간) 글 정리 + 카톡 전송
//   node digest.mjs --dry-run       카톡은 보내지 않고 페이지만 만들기
//   node digest.mjs --date 2026-10-25   특정 날짜 글 정리
//
// 필요한 환경 변수 (카톡 전송 시):
//   KAKAO_REST_API_KEY    카카오 개발자 사이트의 REST API 키
//   KAKAO_REFRESH_TOKEN   kakao-auth.mjs로 받은 리프레시 토큰
//   KAKAO_CLIENT_SECRET   (클라이언트 시크릿을 켜 둔 경우만)
//   PAGES_URL             정리 페이지 주소 (예: https://아이디.github.io/csu-ministry-digest/)

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { kakaoRefresh, kakaoSendMemo } from './kakao.mjs';

const API = 'https://www.csu.ac.kr/api/user/board/getBoardContentSummaryList';
const BOARD_ID = 178; // 사역게시판
const DETAIL_URL = (id) =>
  `https://www.csu.ac.kr/?m1=page_ministry_detail&menu_id=1110&board_content_id=${id}`;
const BOARD_URL = 'https://www.csu.ac.kr/?m1=page&menu_id=1110';
const DOCS = new URL('./docs/', import.meta.url);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

// 한국 시간 기준 '어제' 날짜 (YYYY-MM-DD)
function yesterdayKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

async function fetchPage(page, count = 100) {
  const body = new URLSearchParams({
    boardIdList: BOARD_ID,
    isAvailable: 1,
    isDeleted: 0,
    page,
    count,
    includeBody: 0,
    orderByCode: 4,
    parentBoardContentId: -1,
    includeAttachmentList: 0,
    includeProperties: 1,
  });
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body,
  });
  if (!res.ok) throw new Error(`게시판 응답 오류: ${res.status}`);
  const json = await res.json();
  return json.body?.list ?? [];
}

// 최신 글부터 넘기면서 해당 날짜 글만 모읍니다.
async function fetchPostsOn(date) {
  const posts = [];
  for (let page = 1; page <= 10; page++) {
    const list = await fetchPage(page);
    if (list.length === 0) break;
    for (const p of list) {
      if (p.registered_date.startsWith(date) && !p.is_always_on_top) posts.push(p);
    }
    const oldest = list[list.length - 1].registered_date.slice(0, 10);
    if (oldest < date) break;
  }
  return posts;
}

// '아래 글 참고' 같은 빈 값은 보여 주지 않습니다.
function clean(v) {
  const s = (v ?? '').trim();
  if (!s || /참고|참조|^-+$|^없음$/.test(s)) return '';
  return s;
}

function toItem(p) {
  const pr = p.properties ?? {};
  const location = clean(pr.location) || clean(pr.address);
  return {
    id: p.id,
    title: p.title.trim(),
    church: clean(pr.church_name),
    location,
    region: (location.split(/\s+/)[0] || '기타').replace(/(특별자치도|통합특별시|특별자치시|특별시|광역시)$/, ''),
    dept: clean(pr.ministry_dept),
    time: p.registered_date.slice(11, 16),
    url: DETAIL_URL(p.id),
  };
}

function groupByRegion(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.region)) map.set(it.region, []);
    map.get(it.region).push(it);
  }
  // 글이 많은 지역부터
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
function prettyDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function renderHtml(date, groups, total, archiveDates) {
  const sections = groups
    .map(
      ([region, list]) => `
  <section data-region="${esc(region)}">
    <h2>${esc(region)} <span class="count">${list.length}</span></h2>
    <ul>${list
      .map(
        (it) => `
      <li data-text="${esc(`${it.title} ${it.church} ${it.location} ${it.dept}`.toLowerCase())}">
        <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
        <div class="meta">${[it.church, it.location].filter(Boolean).map(esc).join(' · ')}</div>
        ${it.dept ? `<div class="dept">${esc(it.dept)}</div>` : ''}
      </li>`,
      )
      .join('')}
    </ul>
  </section>`,
    )
    .join('');

  const chips = groups
    .map(([region, list]) => `<a class="chip" href="#" data-go="${esc(region)}">${esc(region)} ${list.length}</a>`)
    .join('');

  const archive = archiveDates
    .map((d) => `<a href="./${d}.html"${d === date ? ' class="current"' : ''}>${prettyDate(d)}</a>`)
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>사역게시판 ${prettyDate(date)}</title>
<style>
  :root { --bg:#f6f5f2; --card:#fff; --text:#1d1d1f; --sub:#6b6b70; --line:#e6e4df; --accent:#2f5d8a; --chip:#eaeef3; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#161618; --card:#202023; --text:#ececee; --sub:#9a9aa1; --line:#333338; --accent:#8db6e0; --chip:#2a2f36; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; line-height:1.5; }
  main { max-width:720px; margin:0 auto; padding:20px 16px 60px; }
  header h1 { font-size:22px; margin:0 0 4px; }
  header p { margin:0 0 14px; color:var(--sub); font-size:14px; }
  header p a { color:var(--accent); }
  input[type=search] { width:100%; padding:11px 14px; font-size:16px; border:1px solid var(--line); border-radius:10px; background:var(--card); color:var(--text); }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin:12px 0 4px; }
  .chip { padding:4px 10px; border-radius:999px; background:var(--chip); color:var(--text); text-decoration:none; font-size:13px; }
  section { margin-top:22px; }
  h2 { font-size:17px; margin:0 0 8px; position:sticky; top:0; background:var(--bg); padding:6px 0; }
  .count { color:var(--sub); font-weight:normal; font-size:14px; }
  ul { list-style:none; margin:0; padding:0; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  li { padding:12px 14px; border-top:1px solid var(--line); }
  li:first-child { border-top:0; }
  li a { color:var(--text); text-decoration:none; font-weight:600; }
  li a:visited { color:var(--sub); }
  .meta, .dept { font-size:13px; color:var(--sub); margin-top:2px; }
  .dept { color:var(--accent); }
  .empty { color:var(--sub); text-align:center; padding:40px 0; }
  footer { margin-top:36px; font-size:13px; color:var(--sub); }
  footer .days { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
  footer a { color:var(--accent); }
  footer a.current { font-weight:700; text-decoration:none; color:var(--text); }
</style>
</head>
<body>
<main>
  <header>
    <h1>총신대 사역게시판 · ${prettyDate(date)}</h1>
    <p>새 글 ${total}개 · <a href="${BOARD_URL}" target="_blank" rel="noopener">게시판 바로가기</a></p>
    <input type="search" id="q" placeholder="검색 (예: 교육전도사, 청년부, 파트, 수원)">
    <div class="chips">${chips}</div>
  </header>
  ${total ? sections : '<p class="empty">이 날은 새 글이 없어요.</p>'}
  <p class="empty" id="none" hidden>검색 결과가 없어요.</p>
  <footer>
    지난 날짜
    <div class="days">${archive}</div>
  </footer>
</main>
<script>
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    const words = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    let any = false;
    document.querySelectorAll('section').forEach((sec) => {
      let n = 0;
      sec.querySelectorAll('li').forEach((li) => {
        const hit = words.every((w) => li.dataset.text.includes(w));
        li.hidden = !hit;
        if (hit) n++;
      });
      sec.hidden = n === 0;
      sec.querySelector('.count').textContent = n;
      if (n) any = true;
    });
    document.getElementById('none').hidden = any;
  });
  document.querySelectorAll('[data-go]').forEach((chip) => chip.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('section[data-region="' + chip.dataset.go + '"]')?.scrollIntoView({ behavior: 'smooth' });
  }));
</script>
</body>
</html>
`;
}

// 카톡 텍스트 메시지는 200자 제한이 있어요.
function buildMessage(date, groups, total) {
  if (total === 0) return `📋 총신대 사역게시판\n${prettyDate(date)} 새 글이 없어요.`;
  const head = `📋 총신대 사역게시판\n${prettyDate(date)} 새 글 ${total}개\n\n`;
  let body = '';
  for (const [region, list] of groups) {
    const part = `${body ? ' · ' : ''}${region} ${list.length}`;
    if ((head + body + part).length > 190) {
      body += ' …';
      break;
    }
    body += part;
  }
  return head + body;
}

async function main() {
  const date = dateArg ?? yesterdayKST();
  const posts = await fetchPostsOn(date);
  const items = posts.map(toItem);
  const groups = groupByRegion(items);
  console.log(`${date}: 글 ${items.length}개`);

  await mkdir(DOCS, { recursive: true });
  const existing = (await readdir(DOCS))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.slice(0, 10));
  const archiveDates = [...new Set([...existing, date])].sort().reverse().slice(0, 14);

  const html = renderHtml(date, groups, items.length, archiveDates);
  await writeFile(new URL(`${date}.html`, DOCS), html);
  // index.html은 가장 최근 날짜를 보여 줍니다.
  if (date === archiveDates[0]) await writeFile(new URL('index.html', DOCS), html);
  console.log(`페이지 생성: docs/${date}.html`);

  const text = buildMessage(date, groups, items.length);
  console.log(`\n--- 카톡 메시지 미리보기 ---\n${text}\n---------------------------`);
  if (dryRun) return;

  const pagesUrl = (process.env.PAGES_URL || '').replace(/\/?$/, '/');
  const link = process.env.PAGES_URL ? `${pagesUrl}${date}.html` : BOARD_URL;
  const { accessToken, newRefreshToken } = await kakaoRefresh();
  // 카카오가 새 리프레시 토큰을 줬으면 파일로 남겨, GitHub Actions가 저장하게 합니다.
  if (newRefreshToken) {
    await writeFile(new URL('./.new_refresh_token', import.meta.url), newRefreshToken);
    console.log('새 리프레시 토큰을 받았어요.');
  }
  await kakaoSendMemo(accessToken, text, link);
  console.log('카톡 전송 완료');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
