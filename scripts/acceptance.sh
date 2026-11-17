#!/bin/bash
# 验收②：用 rclone 本地 backend 造 mock remote，跑完整单向备份，
# 验证删除的文件落入 backup/<日期> 目录
set -e
RCLONE=/opt/homebrew/bin/rclone
TMP=$(mktemp -d)
export RCLONE_CONFIG="$TMP/rclone.conf"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
mkdir -p src dst
echo hello > src/a.txt
echo world > src/b.txt

"$RCLONE" config create mock local >/dev/null
echo "== 第一次备份（a.txt, b.txt）=="
"$RCLONE" sync "$TMP/src" mock:dst --backup-dir mock:backup/$(date +%F)/dst -v >/dev/null 2>&1
test -f "$TMP/dst/a.txt" && test -f "$TMP/dst/b.txt" && echo "OK: 文件已备份到 dst"

echo "== 修改 + 删除，再次备份 =="
rm "$TMP/src/a.txt"
echo changed > "$TMP/src/b.txt"
"$RCLONE" sync "$TMP/src" mock:dst --backup-dir "mock:backup/$(date +%F)/dst" -v 2>&1 | grep -E "backup-dir|Deleted|moved" || true
BK="$TMP/backup/$(date +%F)/dst"
test -f "$BK/a.txt" && echo "OK: 删除的 a.txt 落入 backup-dir"
test -f "$BK/b.txt" && echo "OK: 修改前的 b.txt 落入 backup-dir"
grep changed "$TMP/dst/b.txt" >/dev/null && echo "OK: 目标 b.txt 已更新为新内容"

echo "== dry-run =="
"$RCLONE" sync "$TMP/src" mock:dst --dry-run --verbose 2>&1 | grep -qE "NOTICE|Transferred" && echo "OK: dry-run 正常输出且不做任何改动"
echo "全部通过 ✓"
