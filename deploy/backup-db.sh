#!/usr/bin/env bash
# SQLite 热备份:用 sqlite3 的 .backup(在线一致快照,不用停服务),保留最近 14 天。
#
# 装一次 cron(每天 04:10):
#   sudo apt-get install -y sqlite3
#   (crontab -l 2>/dev/null; echo '10 4 * * * /home/ubuntu/agentdiary/deploy/backup-db.sh') | crontab -
#
# 备份只在本机。至少再把 /var/backups/agentdiary 定期拷到别处(对象存储 / 本地电脑),
# 否则磁盘坏了就一起没了。
set -euo pipefail

DATA_DIR=${AGENTDIARY_DATA_DIR:-/var/lib/agentdiary}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/agentdiary}
KEEP_DAYS=${KEEP_DAYS:-14}

mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y%m%d-%H%M%S)
target="$BACKUP_DIR/agentdiary-$stamp.db"
sqlite3 "$DATA_DIR/agentdiary.db" ".backup '$target'"
gzip -f "$target"
# 头像不大,一起打包
tar -czf "$BACKUP_DIR/avatars-$stamp.tgz" -C "$DATA_DIR" avatars 2>/dev/null || true
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $target.gz"
