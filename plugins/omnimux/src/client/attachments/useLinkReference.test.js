import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { useLinkReference } from './useLinkReference.ts';

const URL = 'https://example.com/video?id=2593';
const snapshot = (overrides = {}) => ({ draft: 'original text', draftRev: 4, phase: 'plain', occurrences: [], ...overrides });
const withLink = (draftRev = 5, source = 'omnimux-video-link', ref = URL) => snapshot({
  draftRev, draft: `original text ${ref}`,
  occurrences: [{ source, ref, offset: 14, length: ref.length }],
});

async function mountHook(t, overrides = {}) {
  const dom = new JSDOM('<div id="root"></div>');
  const keys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root'));
  const calls = [];
  let focused = 0;
  let add;
  let mounted = true;
  let props = { input: snapshot(), sessionId: 'A', insert: request => { calls.push(request); return true; }, focus: () => focused++, ...overrides };
  function Probe({ input, sessionId, insert, focus }) {
    add = useLinkReference(input, sessionId, insert, focus);
    return null;
  }
  const render = patch => {
    props = { ...props, ...patch };
    root.render(React.createElement(Probe, props));
  };
  const unmount = async () => {
    if (mounted) { await act(async () => root.unmount()); mounted = false; }
  };
  t.after(async () => {
    await unmount();
    dom.window.close();
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => render({}));
  return {
    add: (...args) => add(...args), get callback() { return add; }, calls, get focused() { return focused; },
    update: patch => act(async () => render(patch)),
    updateSync: patch => flushSync(() => render(patch)), unmount,
  };
}

test('useLinkReference rejects a retained old-session callback before it can mutate the current session', async t => {
  const h = await mountHook(t);
  const oldCallback = h.callback;
  const nextSessionCalls = [];
  await h.update({ sessionId: 'B', input: snapshot({ draftRev: 40 }), insert: request => { nextSessionCalls.push(request); return true; } });
  const result = oldCallback('video', URL);
  await h.unmount();
  assert.equal(await result, false);
  assert.equal(nextSessionCalls.length, 0, 'a callback retained from A must not call session B insertion');
  assert.equal(h.focused, 0);
});

async function assertPending(promise) {
  let settled = false;
  void promise.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'receipt alone or an unrelated snapshot must not confirm insertion');
}

test('useLinkReference requires a strict true receipt and a subsequent newer matching snapshot', async t => {
  const h = await mountHook(t);
  const result = h.add('video', ` ${URL} `);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], {
    reference: { source: 'omnimux-video-link', ref: URL, label: '参考视频 · example.com', clipboardText: `参考视频：${URL}` },
    span: { start: 13, end: 13, draftRev: 4 },
  });
  await assertPending(result);
  await h.update({ input: withLink(4) });
  await assertPending(result);
  await h.update({ input: withLink(5, 'omnimux-product-link') });
  await assertPending(result);
  await h.update({ input: withLink(6, 'omnimux-video-link', `${URL}&other=1`) });
  await assertPending(result);
  assert.equal(h.focused, 0);
  await h.update({ input: withLink(7) });
  assert.equal(await result, true);
  assert.equal(h.focused, 1);
});

test('useLinkReference settles confirmed insertion even when restoring focus throws', async t => {
  let focusCalls = 0;
  const h = await mountHook(t, { focus: () => { focusCalls++; throw new Error('focus unavailable'); } });
  const result = h.add('video', URL);
  await h.update({ input: withLink() });
  assert.equal(await result, true);
  assert.equal(focusCalls, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(await h.add('video', URL), true);
  assert.equal(focusCalls, 2);
  assert.equal(h.calls.length, 1, 'focus failure must not cause insertion retry');
});

test('useLinkReference deduplication returns success instead of throwing when focus fails', async t => {
  const h = await mountHook(t, { input: withLink(), focus: () => { throw new Error('focus unavailable'); } });
  assert.equal(await h.add('video', URL), true);
  assert.equal(h.calls.length, 0);
});

test('useLinkReference synchronous confirmation settles despite a thrown focus callback', async t => {
  const h = await mountHook(t, { focus: () => { throw new Error('focus unavailable'); } });
  await h.update({ insert: () => { h.updateSync({ input: withLink() }); return true; } });
  let result;
  await act(async () => { result = h.add('video', URL); });
  assert.equal(await result, true);
});

test('useLinkReference rejects false, missing, truthy nonboolean receipts and thrown insertion errors', async t => {
  const h = await mountHook(t);
  for (const receipt of [false, undefined, null, 1, 'true', {}]) {
    await h.update({ insert: () => receipt });
    assert.equal(await h.add('video', URL), false);
  }
  await h.update({ insert: () => { throw new Error('host rejected'); } });
  assert.equal(await h.add('video', URL), false);
  await h.update({ input: withLink() });
  assert.equal(h.focused, 0);
});

test('useLinkReference rejects missing capabilities, invalid URLs, blocked phases and malformed native ranges', async t => {
  const h = await mountHook(t);
  const good = snapshot();
  for (const input of [undefined, snapshot({ phase: 'busy' }), snapshot({ occurrences: [{ source: 'native', ref: 'x', offset: 12, length: 4 }] })]) {
    await h.update({ input });
    assert.equal(await h.add('video', URL), false);
  }
  await h.update({ input: good });
  for (const url of ['', '12345', 'https://example.com https://other.com']) assert.equal(await h.add('video', url), false);
  await h.update({ insert: undefined });
  assert.equal(await h.add('video', URL), false);
  assert.equal(h.calls.length, 0);
  assert.equal(h.focused, 0);
});

test('useLinkReference appends after existing native references in detect units using latest props', async t => {
  const h = await mountHook(t);
  const latestCalls = [];
  await h.update({ input: snapshot({ draft: 'abcdefghij', draftRev: 20, phase: 'claimed', occurrences: [
    { source: 'native-file', ref: 'a.md', offset: 1, length: 3 },
    { source: 'native-agent', ref: 'agent', offset: 6, length: 2 },
  ] }), insert: request => { latestCalls.push(request); return true; } });
  const result = h.add('product', URL);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(latestCalls[0].span, { start: 7, end: 7, draftRev: 20 });
  await h.update({ input: withLink(21, 'omnimux-product-link') });
  assert.equal(await result, true);
});

test('useLinkReference deduplicates normalized same-source URLs without insertion, but allows the other source', async t => {
  const h = await mountHook(t, { input: withLink(5, 'omnimux-video-link', 'HTTPS://EXAMPLE.COM:443') });
  assert.equal(await h.add('video', 'https://example.com/'), true);
  assert.equal(h.calls.length, 0);
  assert.equal(h.focused, 1);
  const result = h.add('product', 'https://example.com/');
  assert.equal(h.calls.length, 1);
  await h.update({ input: withLink(6, 'omnimux-product-link', 'https://example.com/') });
  assert.equal(await result, true);
  assert.equal(h.focused, 2);
});

test('useLinkReference blocks double invocation until confirmation and then deduplicates', async t => {
  const h = await mountHook(t);
  const first = h.add('video', URL);
  assert.equal(await h.add('video', URL), false);
  assert.equal(await h.add('product', URL), false);
  assert.equal(h.calls.length, 1);
  await h.update({ input: withLink() });
  assert.equal(await first, true);
  assert.equal(await h.add('video', URL), true);
  assert.equal(h.calls.length, 1);
});

test('useLinkReference never accepts another session snapshot as confirmation and permits a fresh operation', async t => {
  const h = await mountHook(t);
  const old = h.add('video', URL);
  await h.update({ sessionId: 'B', input: withLink(99) });
  assert.equal(await old, false);
  assert.equal(h.focused, 0);
  await h.update({ input: snapshot({ draftRev: 100 }) });
  const next = h.add('product', URL);
  await h.update({ input: withLink(101, 'omnimux-product-link') });
  assert.equal(await next, true);
  assert.equal(h.calls.length, 2);
  assert.equal(h.focused, 1);
});

test('useLinkReference cancels a pending operation when unmounted', async t => {
  const h = await mountHook(t);
  const result = h.add('video', URL);
  await h.unmount();
  assert.equal(await result, false);
  assert.equal(h.focused, 0);
});

test('useLinkReference expires unconfirmed insertion and releases the pending guard for retry', async t => {
  const h = await mountHook(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = h.add('video', URL);
  t.mock.timers.tick(1999);
  await assertPending(first);
  t.mock.timers.tick(1);
  assert.equal(await first, false);
  assert.equal(h.focused, 0);
  const next = h.add('video', URL);
  assert.equal(h.calls.length, 2);
  await h.update({ input: withLink() });
  assert.equal(await next, true);
});

test('useLinkReference handles a synchronous host snapshot but still requires a strict receipt', async t => {
  const h = await mountHook(t);
  for (const accepted of [false, true]) {
    await h.update({ input: snapshot(), insert: () => {
      h.updateSync({ input: withLink() });
      return accepted;
    } });
    let result;
    await act(async () => { result = h.add('video', URL); });
    assert.equal(await result, accepted);
  }
  assert.equal(h.focused, 1);
});
