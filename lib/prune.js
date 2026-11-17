'use strict';
const { execFile } = require('child_process');
const RCLONE = process.env.RCLONE_PATH || '/opt/homebrew/bin/rclone';

// 清理远端过期的 backup/日期 目录（retentionDays=0 表示不保留、也跳过清理）
function pruneBackups(dest, retentionDays, cb) {
  if (!retentionDays || retentionDays <= 0) return cb(null, []);
  // 与 runner.backupDirOf 对应：备份目录在远端根下 remote:backup/<日期>/<leaf>
  const i = dest.indexOf(':');
  const remote = i === -1 ? '' : dest.slice(0, i);
  const backupRoot = `${remote}:backup`;
  execFile(RCLONE, ['lsf', '--dirs-only', backupRoot], (err, stdout) => {
    if (err) return cb(err);
    const dirs = stdout.split('\n').map(s => s.replace(/\/+$/, '')).filter(Boolean);
    const names = dirs.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const cutoff = Date.now() - retentionDays * 86400 * 1000;
    const removed = [];
    let pending = 0, doneCb = false;
    names.forEach(name => {
      const ts = new Date(`${name}T23:59:59`).getTime();
      if (ts < cutoff) {
        pending++;
        execFile(RCLONE, ['purge', `${backupRoot}/${name}`], err2 => {
          if (!err2) removed.push(name);
          if (--pending === 0 && !doneCb) { doneCb = true; cb(null, removed); }
        });
      }
    });
    if (pending === 0 && !doneCb) { doneCb = true; cb(null, removed); }
  });
}

module.exports = { pruneBackups };
