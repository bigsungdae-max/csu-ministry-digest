// 처음 한 번만 실행: 카카오 로그인 후 받은 토큰을 .env 파일에 저장합니다.
//
//   node kakao-auth.mjs
//
// 실행 후 브라우저에서 http://localhost:8765 를 열면 입력칸이 나와요.
// 카카오 개발자 사이트에 Redirect URI로 http://localhost:8765/callback 을 등록해 두어야 해요.
// .env 파일은 GitHub에 올라가지 않아요(.gitignore).

import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { kakaoExchangeCode } from './kakao.mjs';

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const ENV_FILE = new URL('./.env', import.meta.url);

const page = (body) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>카카오 연결</title>
<style>
  body { margin:0; background:#f6f5f2; color:#1d1d1f; font-family:-apple-system, "Apple SD Gothic Neo", sans-serif; }
  main { max-width:480px; margin:0 auto; padding:28px 16px; }
  h1 { font-size:22px; margin:0 0 6px; }
  p { color:#555; line-height:1.6; }
  label { display:block; font-weight:600; margin:20px 0 6px; }
  small { display:block; color:#777; margin-bottom:6px; }
  input { width:100%; box-sizing:border-box; padding:12px; font-size:16px; border:1px solid #ccc; border-radius:10px; }
  button { margin-top:24px; width:100%; padding:14px; font-size:17px; font-weight:700; border:0; border-radius:10px; background:#fee500; color:#191919; }
  .ok { font-size:40px; }
</style></head><body><main>${body}</main></body></html>`;

const FORM = page(`
  <h1>카카오 연결하기</h1>
  <p>카카오 개발자 사이트의 <b>플랫폼 키 → REST API 키</b> 화면에서 두 값을 복사해 붙여 넣으세요.</p>
  <form method="post" action="/start">
    <label>① REST API 키</label>
    <small>화면 맨 위, 'REST API 키' 아래의 긴 영문·숫자</small>
    <input name="key" required autocomplete="off">
    <label>② 클라이언트 시크릿 코드</label>
    <small>화면 아래 '클라이언트 시크릿' → <b>카카오 로그인</b> 줄의 '코드'</small>
    <input name="secret" autocomplete="off">
    <button type="submit">카카오 로그인하러 가기</button>
  </form>`);

let key = '';
let secret = '';

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const html = (s) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(s);

  if (url.pathname === '/' && req.method === 'GET') return html(FORM);

  if (url.pathname === '/start' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const form = new URLSearchParams(raw);
    key = (form.get('key') || '').trim();
    secret = (form.get('secret') || '').trim();
    const authUrl =
      'https://kauth.kakao.com/oauth/authorize?' +
      new URLSearchParams({ client_id: key, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'talk_message' });
    return res.writeHead(302, { Location: authUrl }).end();
  }

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      console.error('인가 코드를 받지 못했어요.', url.search);
      return html(page(`<h1>다시 시도해 주세요</h1><p>${url.searchParams.get('error_description') ?? '로그인이 취소됐어요.'}</p><p><a href="/">처음으로</a></p>`));
    }
    try {
      process.env.KAKAO_REST_API_KEY = key;
      if (secret) process.env.KAKAO_CLIENT_SECRET = secret;
      const tok = await kakaoExchangeCode(code, REDIRECT_URI);
      const lines = [`KAKAO_REST_API_KEY=${key}`, `KAKAO_CLIENT_SECRET=${secret}`, `KAKAO_REFRESH_TOKEN=${tok.refresh_token}`];
      await writeFile(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
      console.log('✅ 토큰을 .env 파일에 저장했어요.');
      html(page(`<p class="ok">✅</p><h1>연결 완료!</h1><p>이제 Claude에게 "완료했어요"라고 알려 주세요.</p>`));
      server.close();
    } catch (e) {
      console.error(e.message);
      html(page(`<h1>연결에 실패했어요</h1><p>키를 잘못 붙여 넣었을 수 있어요. <a href="/">처음으로</a> 돌아가 다시 해 주세요.</p>`));
    }
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`브라우저에서 http://localhost:${PORT} 를 열어 주세요.`));
