import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildExecutionQueueView, formatDuration } from './executionQueue.ts';

test('四区：存活执行进 queue，终态执行进 history 且最新在前', () => {
  const live = { executionId: 'a', status: 'running', error: null, progress: { total: 2, completed: 1, running: 1, pending: 0, percentage: 50 }, nodeStatuses: {}, nodeRecords: {} };
  const done = { executionId: 'b', status: 'completed', error: null, progress: { total: 1, completed: 1, running: 0, pending: 0, percentage: 100 }, nodeStatuses: {}, nodeRecords: {} };
  const view = buildExecutionQueueView({ runs: [live, done], now: 1000 });
  assert.deepEqual(view.queue.map((row) => row.executionId), ['a']);
  assert.deepEqual(view.history.map((row) => row.executionId), ['b']);
});

test('耗时来源：host 上报优先，运行中节点按 now 观测', () => {
  const run = {
    executionId: 'a', status: 'running', error: null,
    progress: { total: 2, completed: 1, running: 1, pending: 0, percentage: 50 },
    nodeStatuses: {},
    nodeRecords: {
      h: { nodeId: 'h', status: 'completed', durationMs: 1500, observedStartedAt: 1 },
      l: { nodeId: 'l', status: 'running', observedStartedAt: 700 },
    },
  };
  const rows = buildExecutionQueueView({ runs: [run], now: 1000 }).queue[0].nodes;
  const byId = Object.fromEntries(rows.map((row) => [row.nodeId, row]));
  assert.equal(byId.h.durationSource, 'host');
  assert.equal(byId.h.durationMs, 1500);
  assert.equal(byId.l.durationSource, 'observed');
  assert.equal(byId.l.durationMs, 300);
});

test('formatDuration 三档', () => {
  assert.equal(formatDuration(820), '820ms');
  assert.equal(formatDuration(1200), '1.2s');
  assert.equal(formatDuration(65000), '1m 05s');
});
