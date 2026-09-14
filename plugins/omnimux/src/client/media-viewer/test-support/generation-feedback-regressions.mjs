import assert from 'node:assert/strict';
import { createGenerationFeedback } from '../generation-feedback.js';
import { createMediaViewerStore } from '../media-viewer-store.js';

function observable(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of listeners) fn(); } };
}
function fixture() {
  const session = observable({ pendingSubmissions: [], queue: [] });
  const eventSource = observable({ entries: [] });
  const ready = observable(0);
  const texts = new Map();
  const store = createMediaViewerStore();
  let handler;
  let seq = 0;
  const bridge = createGenerationFeedback({
    sessions: { list: observable({ current: 'a' }), binding: () => ({ session, eventSource }) }, store,
    getUiContext: () => ({ sessionId: 'a', surface: { panelOpen: true, tabId: 'omnimux:media-viewer' }, view: {} }),
    eventsClient: { subscribe(_type, fn) { handler = fn; return () => {}; } },
    getSubmittedCanvasText: (_sessionId, attachments) => texts.get(attachments[0]?.value?.path) || '',
    subscribeSubmittedCanvasText: ready.subscribe,
  });
  return { store, bridge, session, eventSource,
    send(row) { session.set({ ...session.getSnapshot(), pendingSubmissions: [...session.getSnapshot().pendingSubmissions, row] }); },
    phase(ids, phase) { handler({ payload: { sessionId: 'a', turn: 1, requestIds: ids, phase } }); },
    event(type, data) { eventSource.set({ entries: [...eventSource.getSnapshot().entries, { type: 'event', event: { type, seq: ++seq, data: { turn: 1, ...data } } }] }); },
    ready(path, text) { texts.set(path, text); ready.set(ready.getSnapshot() + 1); },
  };
}

export function lateReadyRegression(mixed) {
  const f = fixture();
  try {
    if (mixed) f.send({ requestId: 'early', text: '', attachments: [{ type: 'file', value: { path: '/early.md' } }] });
    f.send({ requestId: 'late', text: '', attachments: [{ type: 'file', value: { path: '/frozen.md' } }] });
    if (mixed) {
      f.ready('/early.md', '生成一张红色山峰图片');
      assert.equal(f.store.getSnapshot().generationTasks.find((row) => row.requestId === 'early')?.status, 'pending');
    }
    const ids = mixed ? ['early', 'late'] : ['late'];
    f.phase(ids, 'running');
    f.event('tool/call', { name: 'image_generate', callId: 'c' });
    f.event('tool/result', { message: { source: { callId: 'c' }, content: [{ type: 'tool-result', toolCallId: 'c', content: [{ type: 'text', text: JSON.stringify({ mode: 'live', url: 'data:image/png;base64,AA==' }) }] }] } });
    f.phase(ids, 'settled');
    f.event('turn/end', { reason: { kind: 'completed' } });
    assert.equal(f.store.getSnapshot().generationTasks.some((row) => row.requestId === 'late'), false);
    f.ready('/frozen.md', '生成一张蓝色山峰图片');
    const tasks = f.store.getSnapshot().generationTasks;
    assert.equal(tasks.find((row) => row.requestId === 'late')?.status, mixed ? 'unresolved' : 'success');
    if (mixed) {
      assert.equal(tasks.find((row) => row.requestId === 'early')?.status, 'unresolved');
      assert.ok(tasks.every((row) => (row.media || []).length === 0), 'ambiguous ownership must not leak media to either request');
      assert.equal(tasks.find((row) => row.requestId === 'early').prompt, '生成一张红色山峰图片');
      assert.equal(tasks.find((row) => row.requestId === 'late').prompt, '生成一张蓝色山峰图片');
    }
    f.eventSource.set({ entries: [] });
    f.ready('/frozen.md', '生成一张蓝色山峰图片');
    assert.equal(f.store.getSnapshot().generationTasks.length, mixed ? 2 : 1);
  } finally { f.bridge.dispose(); }
}

export function frozenInputRegression() {
  const f = fixture();
  try {
    const attachment = { type: 'file', value: { path: '/frozen.md' } };
    const row = { requestId: 'frozen', text: '', attachments: [attachment] };
    f.send(row);
    row.text = '停止'; attachment.value.path = '/changed.md';
    f.ready('/changed.md', '普通问句');
    assert.equal(f.store.getSnapshot().generationTasks.length, 0);
    f.ready('/frozen.md', '生成一张蓝色山峰图片');
    assert.equal(f.store.getSnapshot().generationTasks[0].prompt, '生成一张蓝色山峰图片');
    f.send({ requestId: 'question', text: '这张图片有什么内容？' });
    f.send({ requestId: 'stop', text: '停止' });
    assert.equal(f.store.getSnapshot().generationTasks.length, 1);
  } finally { f.bridge.dispose(); }
}
