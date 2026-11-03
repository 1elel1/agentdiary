#!/usr/bin/env bash
# 部署后的运维任务(由 GitHub Actions 在服务器上执行,也可手动跑):
#
#   bash deploy/task.sh seed-users         # 导入 server/seed 里的种子用户(幂等)
#   bash deploy/task.sh purge-seed-users   # 删除全部种子用户及其数据
#   bash deploy/task.sh seed-count         # 用户数量统计
#
# 注意:Actions 日志是公开的(仓库公开),这里的任务只打印数量,不打印用户名和口令。
# 环境变量(数据目录、API Key)从 /etc/agentdiary.env 读,文件是 root:600,所以用 sudo 读;
# 命令本身以当前用户(ubuntu,即服务进程的用户)执行,避免在数据目录留下 root 文件。
set -euo pipefail
cd "$(dirname "$0")/.."

TASK=${1:-}
case "$TASK" in
  seed-users|purge-seed-users|seed-count) ;;
  *) echo "未知任务: '$TASK'(可选: seed-users / purge-seed-users / seed-count)" >&2; exit 2 ;;
esac

if [ -r /etc/agentdiary.env ] || sudo -n test -r /etc/agentdiary.env 2>/dev/null; then
  set -a
  # shellcheck disable=SC1090
  . <(sudo -n cat /etc/agentdiary.env | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' )
  set +a
fi

PY=server/.venv/bin/python
cd server
case "$TASK" in
  seed-users)        $PY scripts/seed_users.py ;;
  purge-seed-users)  $PY scripts/seed_users.py --purge ;;
  seed-count)        $PY scripts/seed_users.py --count ;;
esac
