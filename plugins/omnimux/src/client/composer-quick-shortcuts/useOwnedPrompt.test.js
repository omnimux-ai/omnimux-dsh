import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { useOwnedPrompt } from './useOwnedPrompt.ts';

const original = () => ({ draft: 'aLINKz', draftRev: 4, phase: 'plain', occurrences: [
  { source: 'omnimux-video-link', ref: 'https://example.com/video', offset: 1, length: 4, id: 'native-1', label: '参考视频' },
] });
const appended = () => ({ ...original(), draft: 'aLINKz\nfirst\n', draftRev: 5 });
async function mountHook(t, overrides = {}) {
  const dom = new JSDOM('<div id="root"></div>');
  const keys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root'));
  const calls = [];
  let apply;
  let props = { input: original(), sessionId: 'A', mutate: (text, span) => { calls.push({ text, span }); return true; }, ...overrides };
  function Probe({ input, sessionId, mutate }) {
    apply = useOwnedPrompt(input, sessionId, mutate);
    return null;
  }
  const render = patch => { props = { ...props, ...patch }; root.render(React.createElement(Probe, props)); };
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => render({}));
  return { apply: text => apply(text), get callback() { return apply; }, calls,
    update: patch => act(async () => render(patch)), updateSync: patch => flushSync(() => render(patch)) };
}

test('useOwnedPrompt appends after native refs, switches only its observed range and retracts without deleting refs', async t => {
  const input = original();
  const before = structuredClone(input);
  const h = await mountHook(t, { input });
  assert.equal(h.apply('first'), true);
  assert.deepEqual(h.calls[0], { text: '\nfirst\n', span: { start: 3, end: 3, draftRev: 4 } });
  assert.deepEqual(input, before);
  assert.equal(h.apply('second'), false, 'unobserved pending mutation must block another mutation');
  await h.update({ input: appended() });
  assert.equal(h.apply('second'), true);
  assert.deepEqual(h.calls[1], { text: 'second\n', span: { start: 3, end: 10, draftRev: 5 } });
  await h.update({ input: { ...original(), draft: 'aLINKzsecond\n', draftRev: 6 } });
  assert.equal(h.apply(''), true);
  assert.deepEqual(h.calls[2], { text: '', span: { start: 3, end: 10, draftRev: 6 } });
  await h.update({ input: { ...original(), draftRev: 7 } });
  assert.equal(h.apply(''), true);
  assert.equal(h.calls.length, 3, 'unowned retract must be a no-op');
});

test('useOwnedPrompt invalidates ownership after arbitrary user edits and never retracts that text', async t => {
  const h = await mountHook(t);
  h.apply('first');
  await h.update({ input: appended() });
  const edited = { ...appended(), draft: 'aLINKz\nfirst\nuser edit', draftRev: 6 };
  await h.update({ input: edited });
  assert.equal(h.apply(''), true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.apply('next'), true);
  assert.deepEqual(h.calls[1], { text: '\nnext\n', span: { start: edited.draft.length - 3, end: edited.draft.length - 3, draftRev: 6 } });
});

for (const [name, change] of [
  ['draft differs', input => ({ ...input, draft: `${input.draft}edited` })],
  ['revision skips expected increment', input => ({ ...input, draftRev: 6 })],
  ['occurrence source changes', input => ({ ...input, occurrences: input.occurrences.map(item => ({ ...item, source: 'omnimux-product-link' })) })],
  ['occurrence ref changes', input => ({ ...input, occurrences: input.occurrences.map(item => ({ ...item, ref: 'https://example.com/other' })) })],
  ['occurrence identity changes', input => ({ ...input, occurrences: input.occurrences.map(item => ({ ...item, id: 'native-2' })) })],
  ['occurrence display metadata changes', input => ({ ...input, occurrences: input.occurrences.map(item => ({ ...item, label: 'changed' })) })],
]) {
  test(`useOwnedPrompt does not acquire ownership when observed ${name}`, async t => {
    const h = await mountHook(t);
    assert.equal(h.apply('first'), true);
    await h.update({ input: change(appended()) });
    assert.equal(h.apply(''), true);
    assert.equal(h.calls.length, 1, 'mismatched snapshot must not grant a removable range');
  });
}

test('useOwnedPrompt waits through an unchanged snapshot before granting exact observed ownership', async t => {
  const h = await mountHook(t);
  h.apply('first');
  await h.update({ input: original() });
  assert.equal(h.apply(''), false);
  assert.equal(h.calls.length, 1);
  await h.update({ input: appended() });
  assert.equal(h.apply(''), true);
  assert.deepEqual(h.calls[1], { text: '', span: { start: 3, end: 10, draftRev: 5 } });
});

for (const receipt of [false, undefined, null, 1, 'true', {}]) {
  test(`useOwnedPrompt refuses non-strict receipt ${JSON.stringify(receipt)}`, async t => {
    let calls = 0;
    const h = await mountHook(t, { mutate: () => { calls++; return receipt; } });
    assert.equal(h.apply('first'), false);
    assert.equal(h.apply('retry'), false, 'same revision is blocked after a failed receipt');
    assert.equal(calls, 1);
    await h.update({ input: appended() });
    assert.equal(h.apply(''), true);
    assert.equal(calls, 1, 'a later matching draft cannot rescue a rejected receipt');
  });
}

test('useOwnedPrompt clears ownership on session changes and rejects retained callbacks', async t => {
  const h = await mountHook(t);
  const stale = h.callback;
  h.apply('first');
  await h.update({ input: appended() });
  await h.update({ sessionId: 'B', input: appended() });
  assert.equal(stale('other'), false);
  assert.equal(h.apply(''), true);
  assert.equal(h.calls.length, 1);
});

test('useOwnedPrompt rejects synchronous reentry and accepts a synchronous exact host publication', async t => {
  const h = await mountHook(t);
  let reentered;
  const calls = [];
  await h.update({ mutate: (text, span) => {
    calls.push({ text, span });
    reentered = h.apply('second');
    h.updateSync({ input: appended() });
    return true;
  } });
  await act(async () => { assert.equal(h.apply('first'), true); });
  assert.equal(reentered, false);
  await h.update({ mutate: (text, span) => { calls.push({ text, span }); return true; } });
  assert.equal(h.apply(''), true);
  assert.deepEqual(calls[1], { text: '', span: { start: 3, end: 10, draftRev: 5 } });
});

test('useOwnedPrompt rejects mutations after same-revision corruption, phase change or rollback until a fresh revision', async t => {
  const h = await mountHook(t);
  h.apply('first');
  await h.update({ input: appended() });
  await h.update({ input: { ...appended(), phase: 'claimed' } });
  assert.equal(h.apply(''), false);
  await h.update({ input: appended() });
  assert.equal(h.apply(''), false);
  await h.update({ input: { ...appended(), draftRev: 6 } });
  assert.equal(h.apply(''), true);
  assert.equal(h.calls.length, 1);
  await h.update({ input: { ...appended(), draftRev: 6, draft: 'different' } });
  assert.equal(h.apply('new'), false);
  await h.update({ input: original() });
  assert.equal(h.apply('new'), false);
});

test('useOwnedPrompt refuses invalid capabilities and unsafe or overlapping occurrence ranges', async t => {
  const h = await mountHook(t);
  for (const patch of [
    { input: undefined }, { input: original(), sessionId: '' },
    { sessionId: 'A', input: { ...original(), draftRev: -1 } },
    { input: { ...original(), draftRev: 1.5 } },
    { input: { ...original(), draftRev: 8, occurrences: [{ source: 'native', ref: 'x', offset: 7, length: 0 }] } },
    { input: { ...original(), draftRev: 9, occurrences: [{ source: 'native', ref: 'x', offset: 5, length: 4 }] } },
    { input: { ...original(), draftRev: 10 }, mutate: undefined },
  ]) {
    await h.update(patch);
    assert.equal(h.apply('first'), false);
  }
  assert.equal(h.calls.length, 0);
});

test('useOwnedPrompt permits append when draft ends with zero-length reference', async t => {
  const zeroLengthEnd = {
    ...original(),
    draftRev: 8,
    occurrences: [{ source: 'native', ref: 'x', offset: 6, length: 0 }],
  };
  const h = await mountHook(t, { input: zeroLengthEnd });
  assert.equal(h.apply('first'), true);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], {
    text: '\nfirst\n',
    span: { start: 7, end: 7, draftRev: 8 },
  });
});
