# 총신대 사역게시판 → 매일 카톡 요약

매일 아침 7시(한국 시간), [총신대 사역게시판](https://www.csu.ac.kr/?m1=page&menu_id=1110)에 **전날 올라온 글**을 모아

1. 지역별로 정리한 웹페이지를 만들고 (GitHub Pages, 검색 가능)
2. 카카오톡 **'나와의 채팅'**으로 요약 1통 + "전체 목록 보기" 버튼을 보냅니다.

```
📋 총신대 사역게시판
10/25(일) 새 글 72개

경기 34 · 서울 20 · 부산 5 · 경남 4 · 인천 3 …
[전체 목록 보기]
```

## 파일 설명

| 파일 | 하는 일 |
|---|---|
| `digest.mjs` | 게시판 글 모으기 → `docs/` 페이지 만들기 → 카톡 보내기 |
| `kakao.mjs` | 카카오 API (토큰 갱신, 나에게 보내기) |
| `kakao-auth.mjs` | **처음 한 번만** 실행: 카카오 로그인해서 토큰 받기 |
| `.github/workflows/daily.yml` | GitHub이 매일 7시에 `digest.mjs`를 실행하도록 하는 설정 |

---

## 처음 설정 (한 번만, 약 20~30분)

### 1단계. 카카오 개발자 앱 만들기

1. <https://developers.kakao.com> 에 카카오 계정으로 로그인
2. **내 애플리케이션 → 애플리케이션 추가하기** (앱 이름: `사역게시판 알림` 등 아무거나)
3. 만든 앱에 들어가서:
   - **앱 키** 메뉴에서 **REST API 키** 복사해 두기
   - **카카오 로그인** → 활성화 **ON**
   - **카카오 로그인 → Redirect URI** 에 `http://localhost:8765/callback` 등록
   - **카카오 로그인 → 동의항목** 에서 **카카오톡 메시지 전송(talk_message)** 을 "선택 동의"로 설정
   - **플랫폼 → Web** 사이트 도메인에 아래 두 개 등록 (카톡 메시지 속 링크가 열리려면 필요해요)
     - `https://내깃허브아이디.github.io`
     - `https://www.csu.ac.kr`
   - **보안 → Client Secret** 이 "사용함"이면 코드값도 복사해 두기

### 2단계. 카카오 토큰 받기 (내 맥북에서)

터미널에서:

```bash
cd ~/Documents/csu-ministry-digest
KAKAO_REST_API_KEY=여기에REST키 node kakao-auth.mjs
```

(Client Secret을 사용한다면 앞에 `KAKAO_CLIENT_SECRET=시크릿 ` 도 붙이세요.)

화면에 나온 주소를 브라우저로 열고 → 카카오 로그인 → 동의하면, 터미널에 **리프레시 토큰**이 나와요. 복사해 두세요.

### 3단계. GitHub 저장소 만들기

1. <https://github.com> 가입/로그인
2. 오른쪽 위 **+ → New repository** → 이름 `csu-ministry-digest`, **Public** 선택 → Create
   (무료 계정에서 GitHub Pages를 쓰려면 Public이어야 해요. 올라가는 내용은 게시판에 이미 공개된 제목·교회명·지역뿐이에요.)
3. 이 폴더를 올리기 (Claude에게 "GitHub에 올려줘"라고 하셔도 돼요)

### 4단계. 비밀값(Secrets) 넣기

저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에서 하나씩 추가:

| 이름 | 값 |
|---|---|
| `KAKAO_REST_API_KEY` | 1단계의 REST API 키 |
| `KAKAO_REFRESH_TOKEN` | 2단계의 리프레시 토큰 |
| `KAKAO_CLIENT_SECRET` | (Client Secret 사용 시만) |
| `GH_PAT` | 아래 설명 참고 |

**`GH_PAT` 만들기** — 카카오 토큰은 2개월마다 바뀌는데, 이걸 자동으로 저장하려면 필요해요.
GitHub 오른쪽 위 프로필 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
- Repository access: **Only select repositories** → `csu-ministry-digest`
- Permissions → Repository permissions → **Secrets: Read and write**
- 만료 기간: 가장 길게(1년) → 생성된 값을 `GH_PAT` 에 넣기 (1년 뒤 다시 만들어야 해요)

### 5단계. GitHub Pages 켜기

저장소 → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, 폴더 `/docs` → Save

### 6단계. 시험 실행

저장소 → **Actions** 탭 → 왼쪽 "매일 사역게시판 정리" → **Run workflow** 버튼.
1분쯤 뒤 카톡 '나와의 채팅'에 메시지가 오면 성공! 이후로는 매일 아침 7시쯤 자동으로 와요.

---

## 내 맥북에서 미리 보기 (카톡 안 보냄)

```bash
node digest.mjs --dry-run                  # 어제 글
node digest.mjs --dry-run --date 2026-10-25  # 특정 날짜
```

`docs/` 폴더에 페이지가 만들어져요.

## 문제가 생기면

- **카톡이 안 와요** → Actions 탭에서 빨간 ❌ 실행을 눌러 오류 메시지를 확인하세요.
  `invalid_grant` 같은 오류면 토큰이 만료된 것 → 2단계를 다시 하고 `KAKAO_REFRESH_TOKEN` 을 새 값으로 바꾸면 돼요.
- **시간이 조금 늦게 와요** → GitHub 예약 실행은 붐비는 시간엔 몇 분~수십 분 늦을 수 있어요.
- **게시판 사이트가 바뀌면** 글을 못 가져올 수 있어요. 그때는 Claude에게 고쳐 달라고 하세요.
