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

const OPEN_CALL = /(?:spawn|spawnSync|exec|execFile|execFileSync|execSync)\(\s*['"`]open['"`][\s\S]{0,400}?\)/g;

function assertNoBareOpen(rel, source) {
  for (const match of source.matchAll(OPEN_CALL)) {
    assert.match(match[0], /\benv\s*:/, `${rel}: open 调用必须显式携带 env`);
    assert.doesNotMatch(match[0], /env\s*:\s*process\.env/, `${rel}: 不得直接继承 process.env`);
  }
}

test('所有 Dev/Prod 拉起入口都经共享 helper，且 open 调用必须携带剔除后的 env', () => {
  for (const rel of ['scripts/dev-app-unlock.mjs', 'scripts/reload-dev-app.mjs']) {
    const source = readFileSync(join(root, rel), 'utf8');
    assert.match(source, /\.\/dev-launch-env\.mjs/, `${rel} 必须使用共享拉起环境`);
    assert.match(source, /\blaunchApp\(/, `${rel} 必须经 launchApp 拉起`);
    assertNoBareOpen(rel, source);
  }

  // 手动 restart 命令经 app-restart 模块拉起，模块本身使用共享 helper。
  const restart = readFileSync(join(root, 'scripts/app-restart.mjs'), 'utf8');
  assert.match(restart, /\.\/dev-launch-env\.mjs/, 'app-restart 必须使用共享拉起环境');
  assert.match(restart, /\blaunchApp\b/, 'app-restart 必须经 launchApp 拉起');
  assert.match(restart, /deps\.launch \?\? launchApp/, 'app-restart 默认拉起必须走 launchApp');
  assertNoBareOpen('scripts/app-restart.mjs', restart);
  assert.doesNotMatch(restart, /\bpkill\b|\bexec\('kill'/, 'app-restart 不得强杀进程');

  const omnimux = readFileSync(join(root, 'scripts/omnimux.mjs'), 'utf8');
  assert.match(omnimux, /\.\/app-restart\.mjs/, 'omnimux.mjs restart 必须经 app-restart');
  assertNoBareOpen('scripts/omnimux.mjs', omnimux);
  assert.doesNotMatch(omnimux, /\bpkill\b/, 'omnimux.mjs 不得强杀桌面应用');
});
