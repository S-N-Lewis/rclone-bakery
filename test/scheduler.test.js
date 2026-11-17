'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { dueTasks } = require('../lib/scheduler');

const mkTask = (id, schedule) => ({ id, schedule });

test('manual 任务不触发', () => {
  const now = new Date(2026, 10, 18, 12, 0);
  const due = dueTasks([mkTask('a', { type: 'manual' })], {}, now);
  assert.deepEqual(due, []);
});

test('daily 到点触发', () => {
  const now = new Date(2026, 10, 18, 12, 30);
  const due = dueTasks([mkTask('a', { type: 'daily', time: '12:00' })], {}, now);
  assert.deepEqual(due.map(t => t.id), ['a']);
});

test('daily 未到点不触发', () => {
  const now = new Date(2026, 10, 18, 12, 30);
  const due = dueTasks([mkTask('a', { type: 'daily', time: '18:00' })], {}, now);
  assert.deepEqual(due, []);
});

test('今天已跑过不重复触发', () => {
  const now = new Date(2026, 10, 18, 12, 30);
  const due = dueTasks([mkTask('a', { type: 'daily', time: '03:00' })], { a: '2026-11-18' }, now);
  assert.deepEqual(due, []);
});

test('weekly 只在指定星期触发', () => {
  const wed = new Date(2026, 10, 18, 9, 5); // 2026-11-18 是周三
  assert.equal(wed.getDay(), 3);
  const due = dueTasks([mkTask('w', { type: 'weekly', weekday: 3, time: '09:00' })], {}, wed);
  assert.deepEqual(due.map(t => t.id), ['w']);
  const due2 = dueTasks([mkTask('w', { type: 'weekly', weekday: 1, time: '09:00' })], {}, wed);
  assert.deepEqual(due2, []);
});
