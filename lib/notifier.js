'use strict';
const { execFile } = require('child_process');

// macOS 系统通知（参考 rclone-webui 的通知功能，做成傻瓜式：成功/失败都提醒）
function notify(title, message) {
  if (process.platform !== 'darwin' || process.env.NO_NOTIFY === '1') return;
  execFile('osascript', ['-e',
    `display notification "${String(message).replace(/"/g, "'")}" with title "${String(title).replace(/"/g, "'")}"`,
  ], () => {});
}

function notifyRunResult(run) {
  const ok = run.exitCode === 0;
  notify(
    ok ? 'DriveBackup · 备份完成 ✅' : 'DriveBackup · 备份失败 ❌',
    `${run.dryRun ? '[预览] ' : ''}${run.taskName}：${ok ? '退出码 0' : `退出码 ${run.exitCode}`}${run.bytes ? `，传输 ${run.bytes}` : ''}`,
  );
}

module.exports = { notify, notifyRunResult };
