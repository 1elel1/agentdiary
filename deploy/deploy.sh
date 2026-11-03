#!/usr/bin/env bash
# 服务器上的一键部署(在 /home/ubuntu/agentdiary 执行,或任何位置用绝对路径执行)。
#
#   bash deploy/deploy.sh            # 部署 main
#   bash deploy/deploy.sh my-branch  # 部署指定分支
#   SKIP_WEB=1 bash deploy/deploy.sh # 只更新后端,不重建网页版
#   NO_GIT=1  bash deploy/deploy.sh  # 代码已由别处放好(GitHub Actions 推送),跳过拉取
#
# 做五件事:拉代码 → 装 Python 依赖并跑测试 → 导出网页版并发布到 nginx 目录
# → 重启 API → 健康检查。任何一步失败即停止,不会重启成半截状态。
#
# 网页版需要服务器上有 node(≥ 20)。没有的话脚本会提示并跳过网页步骤,
# 改在开发机构建后上传(见 deploy/README.md「网页版」)。
set -euo pipefail

REPO_DIR=${REPO_DIR:-/home/ubuntu/agentdiary}
BRANCH=${1:-main}
WEB_DIR=${WEB_DIR:-/var/www/agentdiary}
API_URL=${EXPO_PUBLIC_API_URL:-https://43.130.127.226.sslip.io}
SERVICE=agentdiary-api

log() { printf '\n\033[1;34m[deploy]\033[0m %s\n' "$*"; }

cd "$REPO_DIR"

if [ "${NO_GIT:-0}" = "1" ]; then
  log "NO_GIT=1,使用目录里现有的代码"
elif ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "[deploy] $REPO_DIR 不是 git 仓库,拉不了代码。用 GitHub Actions 部署,或 NO_GIT=1 跳过拉取。" >&2
  exit 1
else
  log "拉取 origin/$BRANCH"
  git fetch origin "$BRANCH"
  git checkout -q "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi
if git rev-parse --git-dir >/dev/null 2>&1; then
  log "当前提交:$(git log -1 --format='%h %s')"
elif [ -f .deployed-commit ]; then
  log "当前提交:$(cut -c1-8 .deployed-commit)(由 GitHub Actions rsync 部署)"
fi

log "后端依赖 + 测试"
if [ ! -x server/.venv/bin/python ]; then
  python3 -m venv server/.venv
fi
server/.venv/bin/pip install -q -r server/requirements.txt pytest
(cd server && AGENTDIARY_DATA_DIR="$(mktemp -d)" .venv/bin/python -m pytest -q)

if [ "${SKIP_WEB:-0}" = "1" ]; then
  log "SKIP_WEB=1,跳过网页版"
elif ! command -v node >/dev/null 2>&1; then
  log "服务器没有 node,跳过网页版(在开发机构建后上传,见 deploy/README.md)"
else
  log "导出网页版(API 指向 $API_URL)"
  (cd client && npm ci --no-audit --no-fund --loglevel=error && EXPO_PUBLIC_API_URL="$API_URL" npx expo export --platform web)
  log "发布静态站到 $WEB_DIR"
  sudo mkdir -p "$WEB_DIR"
  sudo rsync -a --delete client/dist/ "$WEB_DIR"/
fi

log "重启 $SERVICE"
sudo systemctl restart "$SERVICE"
sleep 2
if ! sudo systemctl is-active --quiet "$SERVICE"; then
  sudo journalctl -u "$SERVICE" -n 40 --no-pager
  echo "[deploy] 服务没起来,看上面的日志" >&2
  exit 1
fi

log "健康检查"
curl -fsS "http://127.0.0.1:8000/health" && echo
curl -fsS "$API_URL/health" && echo
log "完成"
