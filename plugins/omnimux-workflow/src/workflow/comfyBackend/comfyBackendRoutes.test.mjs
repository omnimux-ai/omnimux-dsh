import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMFY_BACKEND_ROUTE_PREFIX, createComfyBackendRoutes } from './routes.ts';

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

function installing() {
  return {
    state: 'installing',
    stage: 'runtime',
    percent: 5,
    message: '下载 Python 运行时',
    error: null,
    pid: null,
    updatedAt: 2,
    target: null,
  };
}

function fakeService(calls) {
  return {
    status: async () => {
      calls.push('status');
      return NOT_INSTALLED;
    },
    install: async () => {
      calls.push('install');
      return installing();
    },
    start: async () => {
      calls.push('start');
      return installing();
    },
    stop: async () => {
      calls.push('stop');
      return NOT_INSTALLED;
    },
    settings: () => ({ installRoot: '', modelsPath: '', variant: '' }),
    currentTarget: () => null,
    targetProblem: () => null,
    driverVerdict: async () => ({ status: 'unknown', detail: '未解析到目标', required: null }),
    updateSettings: () => ({ ok: true, code: null, settings: { installRoot: '', modelsPath: '', variant: '' } }),
  };
}

test('state 走 GET 200；install 走 POST 202；start/stop 各 200 且各调一次', async () => {
  const calls = [];
  const routes = createComfyBackendRoutes(fakeService(calls));

  const state = await routes.tryHandle('GET', `${COMFY_BACKEND_ROUTE_PREFIX}/state`, {});
  assert.equal(state.status, 200);
  assert.equal(state.body.status.state, 'not-installed');

  const install = await routes.tryHandle('POST', `${COMFY_BACKEND_ROUTE_PREFIX}/install`, {});
  assert.equal(install.status, 202);
  assert.equal(install.body.status.state, 'installing');

  const start = await routes.tryHandle('POST', `${COMFY_BACKEND_ROUTE_PREFIX}/start`, {});
  assert.equal(start.status, 200);

  const stop = await routes.tryHandle('POST', `${COMFY_BACKEND_ROUTE_PREFIX}/stop`, {});
  assert.equal(stop.status, 200);

  assert.deepEqual(calls, ['status', 'install', 'start', 'stop']);
});

test('不属于本组的路由返回 null，交回 dispatcher 继续匹配', async () => {
  const routes = createComfyBackendRoutes(fakeService([]));
  assert.equal(await routes.tryHandle('GET', '/omnimux-workflow/api/workspaces', {}), null);
  assert.equal(await routes.tryHandle('GET', '/omnimux-workflow/api/manifest', {}), null);
  assert.equal(await routes.tryHandle('POST', '/omnimux-workflow/api/workspaces', {}), null);
});

test('方法不匹配时返回 null，不吞掉路径', async () => {
  const routes = createComfyBackendRoutes(fakeService([]));
  assert.equal(await routes.tryHandle('GET', `${COMFY_BACKEND_ROUTE_PREFIX}/install`, {}), null);
  assert.equal(await routes.tryHandle('DELETE', `${COMFY_BACKEND_ROUTE_PREFIX}/state`, {}), null);
  assert.equal(await routes.tryHandle('POST', `${COMFY_BACKEND_ROUTE_PREFIX}/state`, {}), null);
});
