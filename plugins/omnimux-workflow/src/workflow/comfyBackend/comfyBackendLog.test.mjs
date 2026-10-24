import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COMFY_BACKEND_LOG_DEFAULT_LINES,
  COMFY_BACKEND_LOG_MAX_LINES,
  COMFY_BACKEND_ROUTE_PREFIX,
  createComfyBackendRoutes,
  parseLogLines,
  readLogTail,
} from './routes.ts';

const NOT_INSTALLED = {
  state: 'not-installed',
  stage: null,
  percent: 0,
  message: '',
  error: null,
  pid: null,
  updatedAt: 1,
  target: null,
};

function serviceWithLog(logPath) {
  return {
    paths: { root: '/tmp/none', state: '/tmp/none/state.json', log: logPath, userdata: '/tmp/none/userdata', comfyui: '/tmp/none/ComfyUI', venv: '/tmp/none/venv', settings: '/tmp/none/settings.json' },
    settings: () => ({ installRoot: '', modelsPath: '' }),
    updateSettings: () => ({ ok: true, code: null, settings: { installRoot: '', modelsPath: '' } }),
    status: async () => NOT_INSTALLED,
    install: async () => NOT_INSTALLED,
    start: async () => NOT_INSTALLED,
    stop: async () => NOT_INSTALLED,
  };
}

test('lines 解析：缺省/非法给默认值，超上限夹到上限', () => {
  assert.equal(parseLogLines(null), COMFY_BACKEND_LOG_DEFAULT_LINES);
  assert.equal(parseLogLines(''), COMFY_BACKEND_LOG_DEFAULT_LINES);
  assert.equal(parseLogLines('abc'), COMFY_BACKEND_LOG_DEFAULT_LINES);
  assert.equal(parseLogLines('0'), COMFY_BACKEND_LOG_DEFAULT_LINES);
  assert.equal(parseLogLines('-5'), COMFY_BACKEND_LOG_DEFAULT_LINES);
  assert.equal(parseLogLines('50'), 50);
  assert.equal(parseLogLines('999999'), COMFY_BACKEND_LOG_MAX_LINES);
});

test('日志尾部：文件不存在给空数组，取尾部 N 行且不丢内容', () => {
  assert.deepEqual(readLogTail('/tmp/definitely-not-a-log-file-m2c.log', 10), []);

  const dir = mkdtempSync(join(tmpdir(), 'comfy-log-'));
  const file = join(dir, 'install.log');
  const lines = [];
  for (let i = 1; i <= 10; i += 1) lines.push(`line-${i}`);
  writeFileSync(file, `${lines.join('\n')}\n`);

  assert.deepEqual(readLogTail(file, 3), ['line-8', 'line-9', 'line-10']);
  assert.equal(readLogTail(file, 100).length, 10);
  assert.equal(readLogTail(file, 1)[0], 'line-10');
  rmSync(dir, { recursive: true, force: true });
});

test('日志路由：GET 200 返回尾部行；方法不匹配返回 null', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'comfy-log-route-'));
  const file = join(dir, 'install.log');
  writeFileSync(file, 'a\nb\nc\n');
  const routes = createComfyBackendRoutes(serviceWithLog(file));

  const ok = await routes.tryHandle('GET', `${COMFY_BACKEND_ROUTE_PREFIX}/log`, { url: '/x?lines=2' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { lines: ['b', 'c'] });

  const noQuery = await routes.tryHandle('GET', `${COMFY_BACKEND_ROUTE_PREFIX}/log`, { url: '/x' });
  assert.equal(noQuery.status, 200);
  assert.deepEqual(noQuery.body, { lines: ['a', 'b', 'c'] });

  assert.equal(await routes.tryHandle('POST', `${COMFY_BACKEND_ROUTE_PREFIX}/log`, { url: '/x' }), null);
  rmSync(dir, { recursive: true, force: true });
});

test('状态路由仍走共享路径真源', async () => {
  const routes = createComfyBackendRoutes(serviceWithLog('/tmp/none.log'));
  const state = await routes.tryHandle('GET', '/omnimux-workflow/api/comfy-backend/state', {});
  assert.equal(state.status, 200);
  assert.equal(state.body.status.state, 'not-installed');
});
