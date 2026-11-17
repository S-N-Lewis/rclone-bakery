'use strict';
const express = require('express');
const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const store = require('./lib/store');
const runner = require('./lib/runner');
const scheduler = require('./lib/scheduler');
const { pruneBackups } = require('./lib/prune');
const { parseAuthorizeOutput } = require('./lib/token-parser');

const PORT = Number(process.env.PORT || 5321);
const RCLONE = runner.RCLONE;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- rclone 环境 ----------
function listRemotes(cb) {
  execFile(RCLONE, ['listremotes'], (err, stdout) => {
    cb(err, err ? [] : stdout.split('\n').map(s => s.replace(/:$/, '').trim()).filter(Boolean));
  });
}

function remoteHasToken(name, cb) {
  execFile(RCLONE, ['config', 'show', name], (err, stdout) => {
    if (err) return cb(null, false);
    cb(null, /token\s*=/i.test(stdout) || /access_token/i.test(stdout));
  });
}

// ---------- Google Drive 连接 ----------
const pendingAuth = new Map();

app.get('/api/remotes', (req, res) => {
  listRemotes((err, remotes) => {
    if (err) return res.json({ remotes: [] });
    let left = remotes.length;
    const result = [];
    if (!left) return res.json({ remotes: [] });
    remotes.forEach(name => {
      remoteHasToken(name, (_, hasToken) => {
        result.push({ name, connected: !!hasToken });
        if (--left === 0) res.json({ remotes: result });
      });
    });
  });
});

app.post('/api/authorize', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'remote 名只能包含字母、数字、- 和 _' });
  }
  if (pendingAuth.has(name)) {
    return res.status(409).json({ error: '该 remote 已在授权中，请完成浏览器登录' });
  }
  const child = execFile(RCLONE, ['authorize', 'drive'], { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    pendingAuth.delete(name);
    const output = (stdout || '') + '\n' + (stderr || '');
    const token = parseAuthorizeOutput(output);
    if (!token) {
      const msg = err ? (err.message || '').split('\n')[0] : '';
      return res.status(400).json({ error: msg || '未从 rclone authorize 输出解析到 token' });
    }
    // 写入配置（key value 形式，避免 shell 注入）
    execFile(RCLONE, ['config', 'create', name, 'drive', `token=${JSON.stringify(token)}`], (err2) => {
      if (err2) return res.status(500).json({ error: '写入 rclone 配置失败: ' + err2.message.split('\n')[0] });
      res.json({ ok: true, name });
    });
  });
  pendingAuth.set(name, child);
});

// ---------- 目录浏览（选本地源文件夹） ----------
app.get('/api/ls', (req, res) => {
  const p = String(req.query.path || '').trim() || '/';
  let dir = p;
  if (!path.isAbsolute(dir)) dir = path.join(process.env.HOME || '/', dir);
  fs.readdir(dir, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({
      path: dir,
      parent: path.dirname(dir),
      entries: entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({ name: e.name, path: path.join(dir, e.name) })),
    });
  });
});

// ---------- 任务管理 ----------
function validTask(body) {
  const name = String(body.name || '').trim();
  const src = String(body.src || '').trim();
  const dest = String(body.dest || '').trim();
  const schedule = body.schedule || { type: 'manual' };
  const retentionDays = Number(body.retentionDays ?? 30);
  if (!name || !src || !dest) return { error: '任务名、源路径、目标 remote:路径 都不能为空' };
  if (!dest.includes(':')) return { error: '目标必须是 remote:path 形式（例如 gdrive1:Backups/work）' };
  if (!['manual', 'daily', 'weekly'].includes(schedule.type)) return { error: '计划类型必须是 manual/daily/weekly' };
  if (schedule.type !== 'manual' && !/^\d{2}:\d{2}$/.test(schedule.time || '')) return { error: '计划时间格式应为 HH:mm' };
  if (schedule.type === 'weekly' && (schedule.weekday === undefined || Number(schedule.weekday) < 0 || Number(schedule.weekday) > 6)) return { error: '每周计划需要指定星期几（0=周日 … 6=周六）' };
  if (!(retentionDays >= 0 && retentionDays <= 3650)) return { error: '保留天数应在 0-3650 之间（0 = 不保留删除/修改）' };
  return { task: { name, src, dest, schedule, retentionDays } };
}

app.get('/api/tasks', (req, res) => {
  const db = store.getTasks();
  res.json(db);
});

app.post('/api/tasks', (req, res) => {
  const v = validTask(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const db = store.getTasks();
  const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const task = { id, ...v.task };
  db.tasks.push(task);
  store.saveTasks(db);
  res.json({ ok: true, task });
});

app.delete('/api/tasks/:id', (req, res) => {
  const db = store.getTasks();
  const before = db.tasks.length;
  db.tasks = db.tasks.filter(t => t.id !== req.params.id);
  if (db.tasks.length === before) return res.status(404).json({ error: '任务不存在' });
  store.saveTasks(db);
  res.json({ ok: true });
});

// ---------- 运行 ----------
app.post('/api/tasks/:id/run', (req, res) => {
  const db = store.getTasks();
  const task = db.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const dryRun = !!(req.body && req.body.dryRun);
  const run = runner.startRun(task, { dryRun });
  res.json({ ok: true, run });
  // 运行结束后清理过期备份目录（dry-run 不清理）
  if (!dryRun && task.retentionDays > 0) {
    setTimeout(() => pruneBackups(task.dest, task.retentionDays, (err, removed) => {
      if (err) console.error('[prune] 清理备份失败:', err.message);
      else if (removed.length) console.log('[prune] 已清理过期备份目录:', removed.join(', '));
    }), 5000);
  }
});

app.get('/api/runs', (req, res) => {
  const runs = store.getRuns().runs;
  const taskId = req.query.taskId;
  res.json({ runs: taskId ? runs.filter(r => r.taskId === taskId) : runs });
});

app.get('/api/runs/:id', (req, res) => {
  const run = store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: '运行记录不存在' });
  res.json({ run, log: store.readLog(run.id) });
});

// ---------- 启动 ----------
store.ensureDirs();
app.listen(PORT, () => {
  console.log(`DriveBackup 已启动: http://localhost:${PORT}`);
  scheduler.startScheduler();
  if (process.env.NO_BROWSER !== '1') {
    exec(`open http://localhost:${PORT}`, err => {
      if (err) console.log('(无法自动打开浏览器，请手动访问上面的地址)');
    });
  }
});
