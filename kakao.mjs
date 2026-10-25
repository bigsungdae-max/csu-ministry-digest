// 카카오 API 호출 모음: 토큰 갱신, '나에게 보내기'

const env = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`환경 변수 ${name} 가 비어 있어요.`);
  return v;
};

async function postForm(url, params, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8', ...headers },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`카카오 오류 (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

// 인가 코드 → 토큰 (처음 한 번, kakao-auth.mjs에서 사용)
export async function kakaoExchangeCode(code, redirectUri) {
  const params = {
    grant_type: 'authorization_code',
    client_id: env('KAKAO_REST_API_KEY'),
    redirect_uri: redirectUri,
    code,
  };
  if (process.env.KAKAO_CLIENT_SECRET) params.client_secret = process.env.KAKAO_CLIENT_SECRET;
  return postForm('https://kauth.kakao.com/oauth/token', params);
}

// 리프레시 토큰으로 새 액세스 토큰 받기.
// 리프레시 토큰은 2개월 동안 유효하고, 만료 1개월 전부터는 갱신할 때 새 리프레시 토큰이 함께 와요.
export async function kakaoRefresh() {
  const params = {
    grant_type: 'refresh_token',
    client_id: env('KAKAO_REST_API_KEY'),
    refresh_token: env('KAKAO_REFRESH_TOKEN'),
  };
  if (process.env.KAKAO_CLIENT_SECRET) params.client_secret = process.env.KAKAO_CLIENT_SECRET;
  const json = await postForm('https://kauth.kakao.com/oauth/token', params);
  return { accessToken: json.access_token, newRefreshToken: json.refresh_token ?? null };
}

// 카톡 '나와의 채팅'으로 텍스트 메시지 보내기
export async function kakaoSendMemo(accessToken, text, url) {
  const template = {
    object_type: 'text',
    text: text.slice(0, 200),
    link: { web_url: url, mobile_web_url: url },
    button_title: '전체 목록 보기',
  };
  const json = await postForm(
    'https://kapi.kakao.com/v2/api/talk/memo/default/send',
    { template_object: JSON.stringify(template) },
    { Authorization: `Bearer ${accessToken}` },
  );
  if (json.result_code !== 0) throw new Error(`카톡 전송 실패: ${JSON.stringify(json)}`);
}
