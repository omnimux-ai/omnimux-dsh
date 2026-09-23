import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { generateRunnerHtml } from './worktree-web-qa.mjs';

// Execute the actual generated host script, without a browser, bundle or server.
function runner(apply) {
  const events = new Map();
  let ctx;
  const window = {
    addEventListener: (name, fn) => events.set(name, fn),
    __omnimux_plugin_workflow: { apply(value) { ctx = value; apply?.(value); } },
  };
  const html = generateRunnerHtml('workflow', '');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  runInNewContext(script, {
    window,
    document: { querySelector: () => ({}) },
    console: { error() {} },
  });
  events.get('DOMContentLoaded')();
  return { ctx, window, dispose: window.__worktreeQaLifecycle.dispose, events };
}

test('injection effects run immediately and withdrawal leaves root and sibling effects alive', () => {
  const calls = [];
  const { ctx, dispose, window } = runner((root) => {
    root.effect(() => { calls.push('root+'); return () => calls.push('root-'); });
  });
  assert.equal(window.__worktreeQaState.ready, true);
  let inner;
  const withdraw = ctx.inject(['betterSidebar'], (scope) => {
    inner = scope;
    scope.effect(() => { calls.push('first+'); return () => calls.push('first-'); });
    scope.effect(() => { calls.push('second+'); return () => calls.push('second-'); });
  });
  ctx.inject(['layout'], (scope) => {
    scope.effect(() => { calls.push('sibling+'); return () => calls.push('sibling-'); });
  });
  assert.notEqual(inner.effect, ctx.effect);
  assert.deepEqual(calls, ['root+', 'first+', 'second+', 'sibling+']);
  withdraw();
  withdraw();
  assert.deepEqual(calls, ['root+', 'first+', 'second+', 'sibling+', 'second-', 'first-']);
  assert.throws(() => inner.effect(() => {}), /disposed/);
  dispose();
  dispose();
  assert.deepEqual(calls.slice(-2), ['sibling-', 'root-']);
});

test('manual effect release is idempotent and reinjection has a fresh independent scope', () => {
  const { ctx, dispose } = runner();
  const calls = [];
  let release;
  const withdraw = ctx.inject(['betterSidebar'], (scope) => {
    release = scope.effect(() => () => calls.push('old'));
  });
  release();
  release();
  withdraw();
  const withdrawNew = ctx.inject(['betterSidebar'], (scope) => {
    scope.effect(() => () => calls.push('new'));
  });
  withdraw();
  assert.deepEqual(calls, ['old']);
  dispose();
  withdrawNew();
  assert.deepEqual(calls, ['old', 'new']);
  assert.throws(() => ctx.inject([], () => {}), /disposed/);
  assert.throws(() => ctx.effect(() => {}), /disposed/);
});

test('whole cleanup releases active injections and root exactly once via pagehide', () => {
  const { ctx, dispose, events } = runner();
  const calls = [];
  ctx.effect(() => () => calls.push('root'));
  const withdraw = ctx.inject([], (scope) => {
    scope.effect(() => () => calls.push('injection'));
  });
  events.get('pagehide')();
  dispose();
  withdraw();
  assert.deepEqual(calls, ['injection', 'root']);
});

test('a failing disposer does not prevent sibling or root release or run twice', () => {
  const { ctx, dispose } = runner();
  const calls = [];
  ctx.effect(() => () => calls.push('root'));
  ctx.inject([], (scope) => {
    scope.effect(() => () => calls.push('first'));
    scope.effect(() => () => { calls.push('bad'); throw new Error('bad cleanup'); });
  });
  assert.throws(dispose, /Runner cleanup failed/);
  dispose();
  assert.deepEqual(calls, ['bad', 'first', 'root']);
});

test('failed injection setup releases effects already acquired without disposing root', () => {
  const { ctx, dispose } = runner();
  const calls = [];
  ctx.effect(() => () => calls.push('root'));
  assert.throws(() => ctx.inject([], (scope) => {
    scope.effect(() => () => calls.push('partial'));
    throw new Error('setup failed');
  }), /setup failed/);
  assert.deepEqual(calls, ['partial']);
  dispose();
  assert.deepEqual(calls, ['partial', 'root']);
});
