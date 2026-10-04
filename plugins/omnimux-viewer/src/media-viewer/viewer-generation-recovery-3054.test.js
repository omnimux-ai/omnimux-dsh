import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMediaViewerStore } from '../../../omnimux/src/client/media-viewer/media-viewer-store.js';
import { runGenerationTask, resumePendingGenerations, resultUrl, canRetryGeneration } from './generation-runner.js';
import { serializeReferenceAssets, isAllowedReferenceUrl, makeBucketKey, activeOperation,
  deriveAdaptiveOperation, operationsOf, slotPlan } from './media-slot.js';
import { describeGenerationFailure } from './generation-failure.js';

// Integration regressions grounded in viewer-verify-3054.md; no browser/live-provider claim.
function fakeFetch(sequence) {
  const calls = [];
  return { calls, fetchImpl: async (_url, init) => {
    calls.push(JSON.parse(init.body));
    const next = sequence.shift();
    assert.ok(next, 'unexpected extra request');
    if (next instanceof Error) throw next;
    return { ok: !next.error, status: next.error ? 500 : 200, json: async () => next };
  } };
}
function task(store, patch = {}) {
  store.addMedia({ id: 'task-3054', status: 'generating', type: 'image', requestKey: 'original-key',
    request: { kind: 'image', operation: 'image_edit', prompt: 'retain me', model: 'original-model', channel: 'original-channel', aspectRatio: '16:9' }, ...patch });
}

for (const failure of [
  { error: '下载暂时失败', code: 'omnimux-download-error', recoverable: true, taskRef: 'accepted-task' },
  { error: '未知收取错误', recoverable: false, taskRef: 'accepted-task' },
  new Error('fetch failed'),
]) {
  test(`accepted task recovers without resubmit: ${failure.code || failure.message || 'unknown false'}`, async () => {
    const store = createMediaViewerStore();
    task(store);
    const fetch = fakeFetch([{ mode: 'submitted', taskRef: 'accepted-task' }, failure, { mode: 'live', url: '/var/cache/result.png', dest: '/var/cache/result.png' }]);
    await runGenerationTask('task-3054', { store, ...fetch });
    const failed = store.getSnapshot().mediaList[0];
    assert.equal(failed.status, 'failed');
    assert.equal(failed.taskRef, 'accepted-task');
    assert.equal(canRetryGeneration(failed), true);
    await runGenerationTask('task-3054', { store, ...fetch });
    assert.equal(fetch.calls.filter((call) => !call.wait).length, 1);
    assert.deepEqual(fetch.calls.slice(1).map((call) => [call.taskRef, call.requestKey, call.model, call.channel]), [
      ['accepted-task', 'original-key', 'original-model', 'original-channel'],
      ['accepted-task', 'original-key', 'original-model', 'original-channel'],
    ]);
    assert.equal(store.getSnapshot().mediaList[0].url, '/omnimux-workflow/api/local-file?path=%2Fvar%2Fcache%2Fresult.png');
  });
}

test('only confirmed upstream terminal allows a new key; lost response keeps that new key', async () => {
  const store = createMediaViewerStore();
  task(store, { status: 'failed', taskRef: 'terminal-task', recoverable: false, failure: { code: 'omnimux-failed', retryable: true } });
  const fetch = fakeFetch([new Error('lost response'), { mode: 'live', url: 'https://example.test/result.png' }]);
  await runGenerationTask('task-3054', { store, ...fetch });
  await runGenerationTask('task-3054', { store, ...fetch });
  assert.notEqual(fetch.calls[0].requestKey, 'original-key');
  assert.equal(fetch.calls[0].requestKey, fetch.calls[1].requestKey);
  assert.equal(fetch.calls[0].taskRef, undefined);
  assert.equal(fetch.calls[1].taskRef, undefined);
});

test('pre-acceptance unknown failure reuses original intent key', async () => {
  const store = createMediaViewerStore();
  task(store, { status: 'failed', failure: { retryable: true } });
  const fetch = fakeFetch([{ mode: 'live', url: 'https://example.test/result.png' }]);
  await runGenerationTask('task-3054', { store, ...fetch });
  assert.equal(fetch.calls[0].requestKey, 'original-key');
});

test('inline payload persistence preserves identity and can collect after reload but cannot replay terminal', async (t) => {
  const previous = globalThis.window;
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const store = createMediaViewerStore();
  task(store, { status: 'failed', taskRef: 'accepted-task', recoverable: true, failure: { retryable: true },
    request: { kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'image_edit', aspectRatio: '16:9',
      references: [{ url: 'data:image/png;base64,AA==', path: 'data:image/png;base64,AA==', type: 'image', slot: 'reference_image', role: 'reference', name: 'source' }] } });
  const restored = createMediaViewerStore();
  const item = restored.getSnapshot().mediaList[0];
  assert.equal(item.requestReplayable, false);
  assert.deepEqual(item.request, { kind: 'image', model: 'original-model', channel: 'original-channel', operation: 'image_edit', aspectRatio: '16:9',
    references: [{ type: 'image', slot: 'reference_image', role: 'reference', name: 'source' }] });
  const fetch = fakeFetch([{ mode: 'live', url: 'https://example.test/result.png' }]);
  await runGenerationTask(item.id, { store: restored, ...fetch });
  assert.equal(fetch.calls[0].wait, true);
  assert.equal(fetch.calls[0].taskRef, 'accepted-task');
  assert.equal(fetch.calls[0].model, 'original-model');
  restored.updateMedia(item.id, { status: 'failed', recoverable: false, failure: { code: 'omnimux-failed', retryable: true } });
  assert.equal(canRetryGeneration(restored.getSnapshot().mediaList[0]), false);
  await runGenerationTask(item.id, { store: restored, ...fetch });
  assert.equal(fetch.calls.length, 1);
});

test('local file references normalize once while public HTTP/blob/data URLs remain intact', () => {
  for (const url of ['/var/cache/image.png', 'file:///var/cache/image.png']) {
    assert.equal(resultUrl({ url }), '/omnimux-workflow/api/local-file?path=%2Fvar%2Fcache%2Fimage.png');
  }
  assert.equal(resultUrl({ dest: '/var/cache/a b.mp4' }), '/omnimux-workflow/api/local-file?path=%2Fvar%2Fcache%2Fa%20b.mp4');
  assert.equal(resultUrl({ url: 'file:///var/cache/a%20b.png' }), '/omnimux-workflow/api/local-file?path=%2Fvar%2Fcache%2Fa%20b.png');
  for (const url of ['/omnimux-viewer/asset?token=example', '/omnimux-workflow/api/local-file?path=%2Fx.png', 'https://example.test/x.png', 'blob:example', 'data:image/png;base64,AA==']) {
    assert.equal(resultUrl({ url }), url);
  }
  const store = createMediaViewerStore();
  task(store, { status: 'completed', url: '/var/cache/legacy.png' });
  resumePendingGenerations({ store });
  assert.equal(store.getSnapshot().mediaList[0].url, '/omnimux-workflow/api/local-file?path=%2Fvar%2Fcache%2Flegacy.png');
});

// Execute existing source function bodies, not a duplicate implementation; the real DOM journey is Lead-owned.
test('FileReader failure creates existing failed-item outlet, preserves draft acknowledgment and submits nothing', async (t) => {
  const source = await readFile(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf8');
  const materialSource = source.slice(source.indexOf('const MAX_MATERIALIZE_FILE_SIZE'), source.indexOf('const noSubscription')).replace('export async function', 'async function');
  const materialize = new Function('isAllowedReferenceUrl', `${materialSource}; return materializeAssetFile;`)(isAllowedReferenceUrl);
  const previous = globalThis.FileReader;
  globalThis.FileReader = class { readAsDataURL() { this.onerror(new Error('fake FileReader failure')); } };
  t.after(() => { if (previous === undefined) delete globalThis.FileReader; else globalThis.FileReader = previous; });
  const store = createMediaViewerStore();
  let accepted = 0;
  let submitted = 0;
  const handlerSource = source.slice(source.indexOf('  const handleDirectSubmit ='), source.indexOf('  // 缩放平移'));
  const submit = new Function('store', 'sessionId', 'materializeAssetFile', 'serializeReferenceAssets', 'describeGenerationFailure', 'runGenerationTask', `${handlerSource}; return handleDirectSubmit;`)(store, 'session', materialize, serializeReferenceAssets, describeGenerationFailure, async () => { submitted += 1; });
  for (const file of [{ size: 10 }, { size: 6 * 1024 * 1024 }]) {
    await submit({ prompt: 'draft retained', kind: 'image', params: { batch: 1 }, assets: [{ type: 'image', url: 'blob:fake', file }], onAccepted: () => { accepted += 1; } });
  }
  assert.equal(accepted, 0);
  assert.equal(submitted, 0);
  assert.equal(store.getSnapshot().mediaList.length, 2);
  for (const item of store.getSnapshot().mediaList) {
    assert.equal(item.status, 'failed');
    assert.equal(item.failure.retryable, false);
    assert.equal(item.requestReplayable, false);
  }
  assert.match(store.getSnapshot().mediaList[0].failure.reason, /读取失败/);
  assert.match(store.getSnapshot().mediaList[1].failure.reason, /超过 5MB/);
});

async function composerSubmissionHarness({ materialize } = {}) {
  const composer = await readFile(new URL('./MediaViewerComposer.jsx', import.meta.url), 'utf8');
  const tab = await readFile(new URL('./MediaViewerTab.jsx', import.meta.url), 'utf8');
  const body = composer.slice(composer.indexOf('  const handleSend ='), composer.indexOf('  const handleKeyDown ='));
  const direct = tab.slice(tab.indexOf('  const handleDirectSubmit ='), tab.indexOf('  // 缩放平移'));
  assert.ok(body.includes('const handleSend =')); assert.ok(direct.includes('const handleDirectSubmit ='));
  let release;
  let started;
  const held = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const store = createMediaViewerStore();
  const calls = { materialize: 0, runner: [], pending: [] };
  const submit = new Function('store', 'sessionId', 'materializeAssetFile', 'serializeReferenceAssets',
    'describeGenerationFailure', 'runGenerationTask', `${direct}; return handleDirectSubmit;`)(store, 'session',
    async asset => {
      calls.materialize++; started(); await held;
      return materialize ? materialize(asset, calls.materialize)
        : { ...asset, url: 'data:image/png;base64,AA==', file: undefined };
    }, serializeReferenceAssets, describeGenerationFailure, async id => { calls.runner.push(id); });
  const model = { id: 'fixture', operations: [{ id: 'image_edit', inputs: [
    { type: 'image', role: 'reference', slot: 'reference_image', min: 1, max: 1 },
  ] }] };
  const slots = slotPlan(model, 'image', 'image_edit');
  const bucketKey = slot => makeBucketKey('image', model.id, slot.key);
  const buckets = { [bucketKey(slots[0])]: [{ type: 'image', url: 'blob:offline', file: { size: 4 } }] };
  const refs = { submittingRef: { current: false }, currentDraftRef: { current: 'original draft' },
    userPromptSuffixRef: { current: 'original draft' }, bucketsRef: { current: buckets }, paramsRef: { current: { batch: 1 } } };
  let draft = 'original draft'; let suffix = draft;
  const dependencies = { useCallback: fn => fn, disabled: false, closePopovers: () => {}, setPickerOpen: () => {},
    mode: 'image', model, currentOperationId: 'image_edit', videoModeId: '', config: { imageOpMode: '编辑' },
    slots, buckets, bucketKey, savedAnnotations: [], setNotice: message => { throw new Error(message); },
    setPrompt: value => { draft = value; }, setUserPromptSuffix: value => { suffix = value; },
    onDirectSubmit: args => { const pending = submit(args); calls.pending.push(pending); return pending; },
    makeBucketKey, activeOperation, deriveAdaptiveOperation, operationsOf, slotPlan, isAllowedReferenceUrl, ...refs };
  const render = () => {
    const scope = { ...dependencies, prompt: draft };
    return new Function(...Object.keys(scope), `${body}; return handleSend;`)(...Object.values(scope));
  };
  return { calls, store, refs, entered, release, render, get draft() { return draft; }, get suffix() { return suffix; },
    editDraft: value => { draft = value; suffix = value; refs.currentDraftRef.current = value; refs.userPromptSuffixRef.current = value; } };
}

for (const newDraft of [false, true]) test(`real composer asynchronous double click produces one task and ${newDraft ? 'preserves newer draft' : 'clears only accepted draft'}`, async () => {
  const h = await composerSubmissionHarness();
  const send = h.render(); send(); send(); await h.entered;
  assert.equal(h.calls.materialize, 1); assert.equal(h.calls.pending.length, 1);
  assert.equal(h.refs.submittingRef.current, true); assert.equal(h.store.getSnapshot().mediaList.length, 0);
  if (newDraft) { h.editDraft('new unsent draft'); h.render()(); assert.equal(h.calls.pending.length, 1); }
  h.release(); await Promise.all(h.calls.pending);
  const items = h.store.getSnapshot().mediaList;
  assert.equal(items.length, 1); assert.deepEqual(h.calls.runner, [items[0].id]);
  assert.equal(items[0].request.prompt, 'original draft');
  assert.equal(h.draft, newDraft ? 'new unsent draft' : '');
  assert.equal(h.suffix, newDraft ? 'new unsent draft' : '');
  assert.equal(h.refs.userPromptSuffixRef.current, newDraft ? 'new unsent draft' : '');
  assert.equal(h.refs.submittingRef.current, false);
});

test('real Tab rejection releases composer lock and retains draft for a subsequent accepted attempt', async () => {
  const h = await composerSubmissionHarness({ materialize: (asset, attempt) => {
    if (attempt === 1) throw new Error('offline materialization failure');
    return { ...asset, url: 'data:image/png;base64,AA==', file: undefined };
  } });
  h.render()(); await h.entered; h.release(); await h.calls.pending[0];
  assert.equal(h.draft, 'original draft'); assert.equal(h.refs.submittingRef.current, false);
  assert.equal(h.calls.runner.length, 0);
  assert.equal(h.store.getSnapshot().mediaList[0].status, 'failed');
  h.render()(); await h.calls.pending[1];
  assert.equal(h.calls.runner.length, 1); assert.equal(h.draft, '');
  assert.equal(h.refs.submittingRef.current, false);
});
