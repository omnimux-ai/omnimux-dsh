import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { devLaunchEnv, launchApp } from './dev-launch-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('devLaunchEnv 剔除 ELECTRON_RUN_AS_NODE 且不修改入参', () => {
  const source = { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin', DSH_HOME: '/tmp/dsh' };
  const env = devLaunchEnv(source);
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.DSH_HOME, '/tmp/dsh');
  assert.equal(source.ELECTRON_RUN_AS_NODE, '1', '入参必须保持原样');
});

test('launchApp 经 open 拉起并携带剔除 Electron 运行变量的环境', () => {
  const previous = process.env.ELECTRON_RUN_AS_NODE;
  process.env.ELECTRON_RUN_AS_NODE = '1';
  try {
    const calls = [];
    const spawn = (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    };
    const result = launchApp('OmniMux Dev', { spawn });
    assert.equal(result.status, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'open');
    assert.deepEqual(calls[0].args, ['-a', 'OmniMux Dev']);
    assert.equal(calls[0].options.stdio, 'inherit');
    assert.ok(calls[0].options.env);
    assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, undefined);
    assert.equal(calls[0].options.env.PATH, process.env.PATH);
  } finally {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
    else process.env.ELECTRON_RUN_AS_NODE = previous;
  }
});

test('launchApp 允许显式环境与自定义 spawn', () => {
  const seen = [];
  const spawn = (command, args, options) => {
    seen.push({ command, args, options });
    return { status: 7 };
  };
  const env = { PATH: '/custom/bin' };
  const result = launchApp('OmniMux', { spawn, env });
  assert.equal(result.status, 7);
  assert.deepEqual(seen, [{ command: 'open', args: ['-a', 'OmniMux'], options: { stdio: 'inherit', env } }]);
});

test('所有 Dev/Prod 拉起入口都经共享 helper，不残留裸 open', () => {
  const bareOpen = /spawnSync\('open',\s*\['-a',\s*'OmniMux(?: Dev)?'\]\s*\)/;
  for (const rel of ['scripts/omnimux.mjs', 'scripts/dev-app-unlock.mjs', 'scripts/reload-dev-app.mjs']) {
    const source = readFileSync(join(root, rel), 'utf8');
    assert.doesNotMatch(source, bareOpen, `${rel} 不得直接 spawnSync('open', …)`);
    assert.match(source, /\.\/dev-launch-env\.mjs/, `${rel} 必须使用共享拉起环境`);
    assert.match(source, /\blaunchApp\b/, `${rel} 必须经 launchApp 拉起`);
  }
});
