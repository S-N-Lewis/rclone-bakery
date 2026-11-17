'use strict';
const store = require('./store');
const runner = require('./runner');

/**
 * 定时方案说明：选择进程内 setInterval（每 30 秒检查一次），不用 launchd。
 * 理由：①全部逻辑收在一个 Node 进程里，网页端能直接看到定时触发的运行日志；
 *      ②任务配置和 lastRunDate 已持久化到 data/tasks.json，重启不丢、不会重复触发；
 *      ③launchd 需要额外安装/卸载 plist，且日志要绕回 Web 端，复杂度不值。
 * 代价：应用没在运行时定时不会跑——本地工具可接受，README 已注明。
 */

function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function dueTasks(tasks, lastRunDate, now) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = runner.dateKey(now);
  return tasks.filter(t => {
    const sch = t.schedule;
    if (!sch || sch.type === 'manual') return false;
    const at = minutesOf(sch.time || '03:00');
    if (nowMin < at) return false;
    if (lastRunDate[t.id] === today) return false;
    if (sch.type === 'daily') return true;
    if (sch.type === 'weekly') return now.getDay() === Number(sch.weekday ?? 1);
    return false;
  });
}

function startScheduler(intervalMs = 30000) {
  const timer = setInterval(() => {
    try {
      const db = store.getTasks();
      const due = dueTasks(db.tasks || [], db.lastRunDate || {}, new Date());
      for (const t of due) {
        console.log(`[scheduler] 触发定时任务: ${t.name}`);
        runner.startRun(t, { dryRun: false });
      }
    } catch (err) {
      console.error('[scheduler] 出错:', err.message);
    }
  }, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { dueTasks, startScheduler, minutesOf };
