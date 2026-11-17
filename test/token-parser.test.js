'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parseAuthorizeOutput } = require('../lib/token-parser');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'authorize-output.txt'), 'utf8');

test('解析标准 rclone authorize 输出（fixture）', () => {
  const token = parseAuthorizeOutput(fixture);
  assert.ok(token, '应解析出 token');
  assert.equal(token.access_token, 'ya29.a0AfB_xAMPLE');
  assert.equal(token.token_type, 'Bearer');
  assert.equal(token.refresh_token, '1//0gXAMPLE');
});

test('解析只有 token 行的输出', () => {
  const token = parseAuthorizeOutput('{"access_token":"abc","token_type":"Bearer"}');
  assert.ok(token);
  assert.equal(token.access_token, 'abc');
});

test('无 token JSON 的输出返回 null', () => {
  assert.equal(parseAuthorizeOutput('nothing here'), null);
  assert.equal(parseAuthorizeOutput(''), null);
  assert.equal(parseAuthorizeOutput(null), null);
  assert.equal(parseAuthorizeOutput(undefined), null);
});

test('JSON 损坏返回 null', () => {
  assert.equal(parseAuthorizeOutput('--->\n{bad json\n<---End paste---'), null);
});

test('缺少 access_token 返回 null', () => {
  assert.equal(parseAuthorizeOutput('{"foo":1}'), null);
});

test('缺结束标记也能解析', () => {
  const out = 'Paste the following into your remote machine --->\n{"access_token":"t1","token_type":"Bearer"}\n';
  assert.equal(parseAuthorizeOutput(out).access_token, 't1');
});
