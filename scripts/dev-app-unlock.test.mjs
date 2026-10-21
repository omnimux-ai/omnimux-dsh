import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearCanvasCache, probeDevStatus, unlockDevApp } from './dev-app-unlock.mjs';

const notRunning = async () => ({ running: false, mainPid: null, totalPids: 0, cdpAvailable: false, pageUrl: null });

test('dev-app-unlock probe handles unreachable CDP port gracefully', async () => {
  // Use a high unused port
  const status = await probeDevStatus(59999);
  assert.equal(status.cdpAvailable, false);
  assert.equal(status.pageUrl, null);
});

test('clearCanvasCache returns clear false on unreachable port', async () => {
  const result = await clearCanvasCache(59999);
  assert.equal(result.cleared, false);
  assert.match(result.detail, /无法连接 CDP 端口/);
});

test('unlockDevApp launches through launchApp with an env free of ELECTRON_RUN_AS_NODE', async () => {
  const previous = process.env.ELECTRON_RUN_AS_NODE;
  const previousPath = process.env.PATH;
  process.env.ELECTRON_RUN_AS_NODE = '1';
  // 若 spawn 转发回归，launchApp 会退回真实 open；清空 PATH 让它不可能真的拉起共用 Dev。
  process.env.PATH = '';
  try {
    const launches = [];
    const spawn = (command, args, options) => {
      launches.push({ command, args, options });
      return { status: 0 };
    };
    const result = await unlockDevApp(59999, { spawn, probe: notRunning });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'launched');
    assert.equal(launches.length, 1);
    const [launch] = launches;
    assert.equal(launch.command, 'open');
    assert.deepEqual(launch.args, ['-a', 'OmniMux Dev']);
    assert.equal(launch.options.stdio, 'inherit');
    assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1', '父进程确实带着该变量');
    assert.equal(launch.options.env.ELECTRON_RUN_AS_NODE, undefined, '拉起环境不得继承该变量');
    assert.equal(launch.options.env.PATH, process.env.PATH);
  } finally {
    if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
    else process.env.ELECTRON_RUN_AS_NODE = previous;
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test('unlockDevApp reports launch failure instead of success when open fails', async () => {
  const result = await unlockDevApp(59999, { spawn: () => ({ status: 1 }), probe: notRunning });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'launch-failed');
  assert.equal(result.status, undefined, '失败不得复用成功状态字段');
});

test('unlockDevApp treats null or missing launch status as failure', async () => {
  for (const status of [null, undefined]) {
    const result = await unlockDevApp(59999, { spawn: () => ({ status }), probe: notRunning });
    assert.equal(result.ok, false, `status=${String(status)}`);
    assert.equal(result.error, 'launch-failed');
  }
});
