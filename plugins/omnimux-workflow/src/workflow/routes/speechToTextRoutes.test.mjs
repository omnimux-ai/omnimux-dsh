import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { buildSync } from 'esbuild';

const buildDir = mkdtempSync(join(tmpdir(), 'speech-route-build-'));
const bundle = join(buildDir, 'runtime.mjs');
buildSync({
  stdin: { contents: `
    export { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
    export { createWorkflowDispatcher } from './canvasRoutes.ts';
    export { mountWorkflowHost } from '../index.ts';
  `, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle,
});
const { createWorkspaceStore, createWorkflowDispatcher, mountWorkflowHost } = await import(pathToFileURL(bundle).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));

const text = '1\r\n00:00:00,000 --> 00:00:01,000\r\n你好\r\n\r\n';
const model = 'doubao-asr-bigmodel';
const result = { mode: 'live', model, text };
const request = { nodeId: 'audio-node', audioPath: '/tmp/selected-audio.mp3' };

function harness(t, execute = async () => result) {
  const root = mkdtempSync(join(tmpdir(), 'speech-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createWorkspaceStore({ workspacesDir: join(root, 'workspaces') });
  const workspace = store.create('转写');
  const calls = [];
  const state = { seam: { async execute(input) { calls.push(input); return execute(input); } } };
  const dispatcher = createWorkflowDispatcher({
    store, mediaDir: join(root, 'media'), libraryRoot: join(root, 'library'), executionManager: {},
    gateway: { capabilities: async () => ({}) },
    getSeam: (name) => { assert.equal(name, 'speechToText'); return state.seam; },
  });
  const url = `/omnimux-workflow/api/workspaces/${workspace.id}/speech-to-text`;
  const call = (body = request, extra = {}) => dispatcher.dispatch({
    method: 'POST', url, body, origin: 'http://127.0.0.1:45120', ...extra,
  });
  return { call, calls, state, store, workspace, url };
}

test('workflow STT defaults to Doubao SRT without writing the graph or starting audio generation', async (t) => {
  const h = harness(t);
  const response = await h.call();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, model, text, code: 0, data: { text, model }, message: '' });
  assert.deepEqual(h.calls, [{ model, audio: request.audioPath, response_format: 'srt' }]);
  assert.deepEqual(h.store.get(h.workspace.id), h.workspace);
});

test('workflow STT forwards URL, alias model and selected formats to the seam', async (t) => {
  const h = harness(t);
  for (const responseFormat of ['json', 'text', 'verbose_json', 'srt', 'vtt']) {
    const body = { ...request, audioPath: 'https://cdn.example/voice.mp3?sig=fixture', model: 'seedasr-auc', responseFormat };
    assert.equal((await h.call(body)).status, 200);
    assert.deepEqual(h.calls.at(-1), { model: 'seedasr-auc', audio: body.audioPath, response_format: responseFormat });
  }
});

test('workflow STT validates body, path and parameter shapes before any seam call', async (t) => {
  const h = harness(t);
  for (const body of [
    null, [], 'bad json', {}, { ...request, nodeId: '' }, { ...request, nodeId: 1 },
    { ...request, audioPath: '' }, { ...request, audioPath: 42 }, { ...request, audioPath: 'relative.mp3' },
    { ...request, audioPath: 'blob:source' }, { ...request, audioPath: 'file:///tmp/a.mp3' },
    { ...request, audioPath: 'https://user:password@example.com/a.mp3' }, { ...request, audioPath: '/tmp/\0a.mp3' },
    { ...request, responseFormat: 'xml' }, { ...request, responseFormat: [] }, { ...request, model: {} },
  ]) {
    const response = await h.call(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(response.body.ok, false);
    assert.equal(response.body.code, 400);
    assert.equal(typeof response.body.message, 'string');
  }
  assert.deepEqual(h.calls, []);
});

test('workflow STT keeps local-write protection and validates workspace existence', async (t) => {
  const h = harness(t);
  assert.equal((await h.call(request, { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await h.call(request, { secFetchSite: 'cross-site' })).status, 403);
  assert.equal((await h.call(request, { url: h.url.replace(h.workspace.id, 'ws_missing') })).status, 404);
  assert.equal((await h.call(request, { url: h.url.replace(h.workspace.id, 'bad-id') })).status, 400);
  assert.equal((await h.call(request, { method: 'GET' })).status, 404);
  assert.deepEqual(h.calls, []);
});

test('workflow STT returns needs-provider when absent, then uses a seam injected after mount', async (t) => {
  const h = harness(t);
  const seam = h.state.seam;
  for (const missing of [undefined, {}, { execute: 'not a function' }]) {
    h.state.seam = missing;
    const response = await h.call();
    assert.equal(response.status, 503);
    assert.equal(response.body.error, 'needs-provider');
  }
  h.state.seam = seam;
  assert.equal((await h.call()).status, 200);
  assert.equal(h.calls.length, 1);
});

for (const [code, status] of [
  ['omnimux-invalid-request', 400], ['needs-omnimux', 401], ['quota-exceeded', 402],
  ['capability-disabled', 403], ['omnimux-request-failed', 502], ['omnimux-download-failed', 502],
  ['omnimux-unconfigured', 503], ['unexpected-provider-error', 500],
]) {
  test(`workflow STT safely maps ${code} to HTTP ${status}`, async (t) => {
    const h = harness(t, async () => { throw Object.assign(new Error('private upstream stack / credential'), { code }); });
    const response = await h.call();
    assert.equal(response.status, status);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.data, null);
    assert.doesNotMatch(JSON.stringify(response.body), /private upstream|credential|stack/);
  });
}

test('workflow STT rejects stub, empty and malformed outputs rather than reporting success', async (t) => {
  const h = harness(t);
  for (const invalid of [null, {}, { ...result, mode: 'stub' }, { ...result, text: '  ' }, { ...result, text: 42 }, { ...result, model: '' }]) {
    h.state.seam = { execute: async () => invalid };
    const response = await h.call();
    assert.equal(response.status, 502);
    assert.equal(response.body.error, 'omnimux-invalid-response');
  }
});

test('mounted workflow Host registers the route and resolves ctx.get speechToText on every request', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'speech-host-'));
  const handlers = new Map();
  let seam;
  const calls = [];
  const dispose = mountWorkflowHost({
    webServer: { register: (route) => { handlers.set(route.path, route.handler); return () => {}; } },
    get: (name) => name === 'speechToText' ? seam : undefined,
  }, {
    paths: { root, workspacesDir: join(root, 'workspaces'), executionsDir: join(root, 'executions'), mediaDir: join(root, 'media') },
    libraryRoot: join(root, 'library'), gateway: { capabilities: async () => ({}) },
  });
  t.after(() => { dispose(); rmSync(root, { recursive: true, force: true }); });
  const handler = handlers.get('/omnimux-workflow');
  const call = async (url, body) => {
    let status;
    let payload;
    await handler({
      method: 'POST', url, headers: { origin: 'http://localhost:45120' },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); },
    }, { writeHead(value) { status = value; }, end(text) { payload = JSON.parse(text); } });
    return { status, body: payload };
  };
  const created = await call('/omnimux-workflow/api/workspaces', { name: 'Host STT' });
  const workspaceId = created.body.workspace?.id;
  assert.ok(workspaceId, JSON.stringify(created));
  const url = `/omnimux-workflow/api/workspaces/${workspaceId}/speech-to-text`;
  assert.equal((await call(url, request)).status, 503);
  seam = { execute: async (input) => { calls.push(input); return result; } };
  const response = await call(url, request);
  assert.equal(response.status, 200);
  assert.equal(response.body.text, text);
  assert.deepEqual(calls, [{ model, audio: request.audioPath, response_format: 'srt' }]);
});
