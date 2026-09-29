import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearCanvasCache, probeDevStatus } from './dev-app-unlock.mjs';

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
