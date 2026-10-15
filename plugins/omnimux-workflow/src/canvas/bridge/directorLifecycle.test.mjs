import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorLifecycle } from './directorLifecycle.ts';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('idle unguarded operations preserve synchronous side effects and Promise receipts', async () => {
  const lifecycle = createDirectorLifecycle();
  const events = [];
  const a = lifecycle.transition(() => { events.push('A'); });
  const b = lifecycle.transition(() => { events.push('B'); });
  assert.deepEqual(events, ['A', 'B']);
  assert.equal(await a, true);
  assert.equal(await b, true);
});

test('unregistering a guard does not let a new transition overtake pending close', async () => {
  const lifecycle = createDirectorLifecycle();
  const gate = deferred();
  const events = [];
  const unregister = lifecycle.registerCloseGuard({ prepareClose: () => gate.promise });
  const first = lifecycle.transition(() => { events.push('first'); });
  await Promise.resolve();
  unregister();
  const second = lifecycle.transition(() => { events.push('second'); });
  assert.deepEqual(events, []);
  gate.resolve(true);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(events, ['first', 'second']);
});

test('unguarded async actions still serialize and failures release the queue for retries', async () => {
  const lifecycle = createDirectorLifecycle();
  const gate = deferred();
  const events = [];
  const first = lifecycle.transition(async () => { events.push('start'); await gate.promise; events.push('done'); });
  const second = lifecycle.transition(() => { events.push('second'); });
  assert.deepEqual(events, ['start']);
  gate.resolve();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(events, ['start', 'done', 'second']);
  await assert.rejects(lifecycle.transition(() => { throw new Error('render-failed'); }), /render-failed/);
  await assert.rejects(lifecycle.transition(async () => { throw new Error('async-render-failed'); }), /async-render-failed/);
  const retry = lifecycle.transition(() => { events.push('retry'); });
  assert.equal(events.at(-1), 'retry');
  assert.equal(await retry, true);
});

test('replacement awaits confirmed close before disposing the old root', async () => {
  const lifecycle = createDirectorLifecycle();
  const saved = deferred();
  const events = [];
  lifecycle.registerCloseGuard({ prepareClose: () => { events.push('prepare'); return saved.promise; } });
  const replacement = lifecycle.transition(() => { events.push('dispose'); });
  await Promise.resolve();
  assert.deepEqual(events, ['prepare']);
  saved.resolve(true);
  assert.equal(await replacement, true);
  assert.deepEqual(events, ['prepare', 'dispose']);
});

test('false and rejected closes retain the root and allow a later retry', async () => {
  const lifecycle = createDirectorLifecycle();
  let outcome = false;
  let disposed = 0;
  const unregister = lifecycle.registerCloseGuard({ prepareClose: async () => { if (outcome === 'error') throw new Error('draft-write-failed'); return outcome; } });
  assert.equal(await lifecycle.transition(() => disposed++), false);
  outcome = 'error';
  await assert.rejects(lifecycle.transition(() => disposed++), /draft-write-failed/);
  assert.equal(disposed, 0);
  outcome = true;
  assert.equal(await lifecycle.transition(() => disposed++), true);
  unregister(); unregister();
  assert.equal(await lifecycle.transition(() => disposed++), true);
  assert.equal(disposed, 2);
});

test('concurrent replacements never race close and include newly registered children', async () => {
  const lifecycle = createDirectorLifecycle();
  const gate = deferred();
  let first = true;
  const events = [];
  lifecycle.registerCloseGuard({ prepareClose: async () => { events.push('first'); if (first) { first = false; await gate.promise; } return true; } });
  const a = lifecycle.transition(() => events.push('A'));
  const b = lifecycle.transition(() => events.push('B'));
  await Promise.resolve();
  lifecycle.registerCloseGuard({ prepareClose: async () => { events.push('child'); return false; } });
  gate.resolve(true);
  assert.equal(await a, false);
  assert.equal(await b, false);
  assert.ok(!events.includes('A') && !events.includes('B'));
});

test('concurrent public close requests share one preparation of the same draft', async () => {
  const lifecycle = createDirectorLifecycle();
  const gate = deferred();
  let calls = 0;
  lifecycle.registerCloseGuard({ prepareClose: () => { calls++; return gate.promise; } });
  const a = lifecycle.prepareClose();
  const b = lifecycle.prepareClose();
  assert.equal(calls, 1);
  gate.resolve(true);
  assert.equal(await a, true);
  assert.equal(await b, true);
});
