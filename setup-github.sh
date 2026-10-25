#!/bin/zsh
# 처음 한 번만 실행: GitHub 저장소 만들기 → 코드 올리기 → 비밀값 넣기 → GitHub Pages 켜기
set -e
cd "$(dirname "$0")"
GH=./tools/gh
REPO=csu-ministry-digest
OWNER=$($GH api user -q .login)

echo "▶ 1/4 저장소 만들고 코드 올리기 ($OWNER/$REPO)"
git add -A
git diff --cached --quiet || git commit -q -m "카카오 연결 화면, GitHub 설정 스크립트 추가"
if ! $GH repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  $GH repo create "$REPO" --public --source . --remote origin --push
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
fi

echo "▶ 2/4 카카오 비밀값 넣기 (.env → GitHub Secrets)"
$GH secret set -f .env -R "$OWNER/$REPO"

echo "▶ 3/4 GitHub Pages 켜기 (main 브랜치 /docs 폴더)"
$GH api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/docs" >/dev/null 2>&1 \
  || echo "  (이미 켜져 있어요)"

echo "▶ 4/4 완료!"
echo "  정리 페이지: https://$OWNER.github.io/$REPO/  (처음엔 1~2분 뒤에 열려요)"
