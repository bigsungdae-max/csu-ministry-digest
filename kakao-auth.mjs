// 처음 한 번만 실행: 카카오 로그인 후 리프레시 토큰을 받아 화면에 보여 줍니다.
//
//   KAKAO_REST_API_KEY=내REST키 node kakao-auth.mjs
//   (클라이언트 시크릿을 켰다면 KAKAO_CLIENT_SECRET=시크릿 도 함께)
//
// 카카오 개발자 사이트에 Redirect URI로 http://localhost:8765/callback 을 등록해 두어야 해요.

import { createServer } from 'node:http';
import { kakaoExchangeCode } from './kakao.mjs';

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const key = process.env.KAKAO_REST_API_KEY;
if (!key) {
  console.error('KAKAO_REST_API_KEY 를 먼저 넣어 주세요.\n예) KAKAO_REST_API_KEY=abcd1234 node kakao-auth.mjs');
  process.exit(1);
}

const authUrl =
  'https://kauth.kakao.com/oauth/authorize?' +
  new URLSearchParams({ client_id: key, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'talk_message' });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const code = url.searchParams.get('code');
  if (!code) {
    res.end(`<p>로그인이 취소됐거나 오류가 났어요: ${url.searchParams.get('error_description') ?? ''}</p>`);
    console.error('인가 코드를 받지 못했어요.', url.search);
    return server.close();
  }
  try {
    const tok = await kakaoExchangeCode(code, REDIRECT_URI);
    res.end('<p>완료! 터미널로 돌아가세요. 이 창은 닫아도 돼요.</p>');
    console.log('\n✅ 리프레시 토큰 (GitHub Secret KAKAO_REFRESH_TOKEN 에 넣으세요):\n');
    console.log(tok.refresh_token);
    console.log(`\n(약 ${Math.round(tok.refresh_token_expires_in / 86400)}일 동안 유효, 매일 실행하면 자동으로 연장돼요)`);
  } catch (e) {
    res.end('<p>토큰 받기에 실패했어요. 터미널의 오류 메시지를 확인하세요.</p>');
    console.error(e.message);
  }
  server.close();
});

server.listen(PORT, () => {
  console.log('아래 주소를 브라우저에서 열고 카카오 로그인 → 동의해 주세요:\n');
  console.log(authUrl + '\n');
});
