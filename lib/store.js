'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDirs();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function getTasks() { return readJson(TASKS_FILE, { tasks: [], lastRunDate: {} }); }
function saveTasks(data) { writeJson(TASKS_FILE, data); }

function getRuns() { return readJson(RUNS_FILE, { runs: [] }); }
function saveRuns(data) { writeJson(RUNS_FILE, data); }

function addRun(run) {
  const db = getRuns();
  db.runs.unshift(run);
  if (db.runs.length > 500) db.runs.length = 500;
  saveRuns(db);
}

function updateRun(id, patch) {
  const db = getRuns();
  const r = db.runs.find(x => x.id === id);
  if (r) Object.assign(r, patch);
  saveRuns(db);
  return r;
}

function getRun(id) {
  return getRuns().runs.find(x => x.id === id) || null;
}

function logPath(id) { return path.join(LOGS_DIR, `run-${id}.log`); }

function appendLog(id, text) {
  fs.appendFileSync(logPath(id), text);
}

function readLog(id, maxBytes = 256 * 1024) {
  const p = logPath(id);
  try {
    const stat = fs.statSync(p);
    if (stat.size > maxBytes) {
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, stat.size - maxBytes);
      fs.closeSync(fd);
      return '[…日志过长，仅显示末尾部分…]\n' + buf.toString('utf8');
    }
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

module.exports = {
  DATA_DIR, LOGS_DIR, ensureDirs,
  getTasks, saveTasks, markTaskRun(taskId, dateKey) {
    const db = getTasks();
    db.lastRunDate[taskId] = dateKey;
    saveTasks(db);
  },
  getRuns, addRun, updateRun, getRun, appendLog, readLog, logPath,
};
