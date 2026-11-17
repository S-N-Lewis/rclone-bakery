'use strict';
const { spawn } = require('child_process');
const store = require('./store');

const RCLONE = process.env.RCLONE_PATH || '/opt/homebrew/bin/rclone';

function dateKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localRunId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 从 rclone -v 统计行解析传输量（取最后一次出现的 Transferred: 行）
function parseStats(log) {
  let bytes = null, files = null;
  const re = /Transferred:\s+([\d.]+)\s*(B|Ki|Mi|Gi|Ti)\b[^,]*,\s*([^,]+)/g;
  const fileRe = /Transferred:\s+\d+\s*\/\s*(\d+)[^,]*,/g;
  let m;
  while ((m = re.exec(log)) !== null) bytes = `${m[1]} ${m[2]}`;
  while ((m = fileRe.exec(log)) !== null) files = m[1];
  return { bytes, files };
}

// backup-dir 说明：rclone 要求 backup-dir 不能位于目标目录内部（会报 overlap fatal），
// 所以放在远端根下：remote:backup/<日期>/<dest 末段>，如 gdrive1:backup/2026-11-18/work
function backupDirOf(task, now) {
  const dest = task.dest.replace(/\/+$/, '');
  const i = dest.indexOf(':');
  const remote = i === -1 ? '' : dest.slice(0, i);
  const destPath = i === -1 ? dest : dest.slice(i + 1);
  const leaf = (destPath.split('/').filter(Boolean).pop() || task.id).replace(/[^\w.-]/g, '_');
  return `${remote}:backup/${dateKey(now)}/${leaf}`;
}

function buildArgs(task, { dryRun }) {
  const args = ['sync', task.src, task.dest, '-v', '--stats', '5s', '--create-empty-src-dirs'];
  if (task.retentionDays && task.retentionDays > 0) {
    args.push('--backup-dir', backupDirOf(task, new Date()));
  }
  if (dryRun) args.push('--dry-run');
  return args;
}

/**
 * 启动一次 rclone sync，日志写入文件，run 记录写入 store。
 */
function startRun(task, { dryRun = false } = {}) {
  const id = localRunId();
  const run = {
    id, taskId: task.id, taskName: task.name,
    src: task.src, dest: task.dest,
    dryRun: !!dryRun,
    status: 'running', exitCode: null,
    startedAt: new Date().toISOString(), endedAt: null,
    bytes: null, files: null,
  };
  store.ensureDirs();
  store.addRun(run);
  store.appendLog(id, `$ rclone ${buildArgs(task, { dryRun }).join(' ')}\n`);

  const child = spawn(RCLONE, buildArgs(task, { dryRun }), {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const onData = (buf, tag) => {
    const text = buf.toString();
    store.appendLog(id, text);
  };
  child.stdout.on('data', b => onData(b, 'out'));
  child.stderr.on('data', b => onData(b, 'err'));

  child.on('error', err => {
    store.appendLog(id, `\n[启动失败] ${err.message}\n`);
    finish(id, 127);
  });
  child.on('close', code => finish(id, code));

  function finish(id, code) {
    const log = store.readLog(id);
    const { bytes, files } = parseStats(log);
    store.updateRun(id, {
      status: code === 0 ? 'done' : 'error',
      exitCode: code,
      endedAt: new Date().toISOString(),
      bytes, files,
    });
    if (!run.dryRun) store.markTaskRun(task.id, dateKey());
  }
  return run;
}

module.exports = { startRun, dateKey, parseStats, backupDirOf, RCLONE };
