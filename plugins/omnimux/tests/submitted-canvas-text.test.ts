import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { File } from 'node:buffer';
import assert from 'node:assert/strict';
import { useCommentAttachment, getSubmittedCanvasText, subscribeSubmittedCanvasText } from '../src/client/attachments/useCommentAttachment.ts';
import { getGlobalMediaViewerStore } from '../src/client/media-viewer/media-viewer-store.js';

const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, File, IS_REACT_ACT_ENVIRONMENT: true });
const store = getGlobalMediaViewerStore();
const listeners = new Set<() => void>();
let entries: any[] = [], removed = false;
const binding = { session: { getSnapshot: () => ({ removed }) }, eventSource: {
  getSnapshot: () => ({ entries }), subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
} };
const getSessions = () => ({ binding: () => binding });
const files: File[] = [];
let props: any = { attachments: [], uploads: {}, canAcceptDrop: true, getSessions,
  onAddFiles: (added: File[]) => files.push(...added), onRemoveAttachment: () => {} };
function Probe() { useCommentAttachment(props, 'query-test'); return null; }
const root = createRoot(document.getElementById('root')!);
const render = () => act(async () => { root.render(React.createElement(Probe)); });
const emit = () => act(async () => { for (const listener of [...listeners]) listener(); });
let assertions = 0;
function equal(actual: unknown, expected: unknown) { assert.equal(actual, expected); assertions++; }
try {
  await render();
  await act(async () => {
    store.addMedia({ id: 'query-media', title: '如何生成图片', url: 'local://test' });
    const draft = store.addDraftAnnotation('query-media', { xPercent: 10, yPercent: 20 });
    store.commitAnnotation('query-media', draft.id, '生成图片：保留完整末条');
  });
  const file = files.at(-1)!;
  const ref = { attachmentId: 'sha256:query', name: file.name, bytes: file.size };
  const pending = [{ type: 'file', value: ref }];
  equal(getSubmittedCanvasText('query-test', pending), '');
  let notifiedText = '';
  const stop = subscribeSubmittedCanvasText(() => { notifiedText = getSubmittedCanvasText('query-test', pending); });
  props = { ...props, attachments: [{ kind: 'file', id: 'draft', file }], uploads: { draft: { status: 'ready', file: ref } } };
  await render();
  const expected = getSubmittedCanvasText('query-test', pending);
  assert(expected.includes('生成图片：保留完整末条')); assertions++;
  equal(expected, '生成图片：保留完整末条');
  equal(notifiedText, expected); stop();
  equal(getSubmittedCanvasText('other-session', pending), '');
  for (const changed of [{ ...ref, bytes: ref.bytes + 1 }, { ...ref, name: 'other' }, { ...ref, attachmentId: 'other' }]) {
    equal(getSubmittedCanvasText('query-test', [{ type: 'file', value: changed }]), '');
  }
  equal(getSubmittedCanvasText('query-test', [null, {}, { type: 'image', value: ref }]), '');
  equal(getSubmittedCanvasText('query-test', [...pending, ...pending]), expected);
  await act(async () => {
    const draft = store.addDraftAnnotation('query-media', { xPercent: 30, yPercent: 40 });
    store.commitAnnotation('query-media', draft.id, '后来新增评论');
  });
  const liveNow = Date.now;
  try { Date.now = () => liveNow() + 301000; equal(getSubmittedCanvasText('query-test', pending), expected); } finally { Date.now = liveNow; }
  entries = [{ type: 'event', event: { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'file', attachment: ref }] } } }];
  await emit();
  equal(getSubmittedCanvasText('query-test', pending), expected);
  const now = Date.now;
  try { Date.now = () => now() + 301000; equal(getSubmittedCanvasText('query-test', pending), ''); } finally { Date.now = now; }
  await act(async () => {
    store.addMedia({ id: 'query-media', title: '生成海报', url: 'local://test' });
    const draft = store.addDraftAnnotation('query-media', { xPercent: 50, yPercent: 50 });
    store.commitAnnotation('query-media', draft.id, '普通备注');
  });
  const ordinaryFile = files.at(-1)!;
  const ordinaryRef = { attachmentId: 'ordinary', name: ordinaryFile.name, bytes: ordinaryFile.size };
  props = { ...props, attachments: [{ kind: 'file', id: 'ordinary', file: ordinaryFile }], uploads: { ordinary: { status: 'ready', file: ordinaryRef } } };
  await render();
  equal(getSubmittedCanvasText('query-test', [{ type: 'file', value: ordinaryRef }]).includes('生成海报'), false);
  removed = true;
  await emit();
  equal(getSubmittedCanvasText('query-test', pending), '');
  console.log(JSON.stringify({ kind: 'offline-real-react-hook-not-browser', assertions, passed: true }));
} finally {
  removed = true; await emit();
  await act(async () => root.unmount()); dom.window.close();
}
