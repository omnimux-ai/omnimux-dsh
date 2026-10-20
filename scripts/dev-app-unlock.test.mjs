import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearCanvasCache, probeDevStatus, unlockDevApp } from './dev-app-unlock.mjs';

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

test('unlockDevApp reports launch failure instead of success when open fails', async () => {
  const probe = async () => ({ running: false, mainPid: null, totalPids: 0, cdpAvailable: false, pageUrl: null });
  const result = await unlockDevApp(59999, { launch: () => ({ status: 1 }), probe });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'launch-failed');
  assert.equal(result.status, undefined, '失败不得复用成功状态字段');
});

test('unlockDevApp treats null or missing launch status as failure', async () => {
  const probe = async () => ({ running: false, mainPid: null, totalPids: 0, cdpAvailable: false, pageUrl: null });
  for (const status of [null, undefined]) {
    const result = await unlockDevApp(59999, { launch: () => ({ status }), probe });
    assert.equal(result.ok, false, `status=${String(status)}`);
    assert.equal(result.error, 'launch-failed');
  }
});

test('unlockDevApp returns launched only when open succeeds', async () => {
  const probe = async () => ({ running: false, mainPid: null, totalPids: 0, cdpAvailable: false, pageUrl: null });
  const result = await unlockDevApp(59999, { launch: () => ({ status: 0 }), probe });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'launched');
});
