import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectAssetsStore } from './workspace/ProjectAssetsStore.ts';
import { createAudioBytesRoutes } from './routes/audioBytesRoutes.ts';
import { AUDIO_SAVE_LIMITS } from '../shared/projectAssets.ts';

const wav = Buffer.alloc(44);
wav.write('RIFF'); wav.write('WAVE', 8); wav.write('fmt ', 12);
const endpoint = '/omnimux-workflow/api/workspaces/ws_audio/assets/audio-bytes';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'audio-qa2-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const other = join(root, 'other');
  const workspacesDir = join(root, 'workspaces');
  mkdirSync(project); mkdirSync(other);
  mkdirSync(join(workspacesDir, 'ws_audio'), { recursive: true });
  writeFileSync(join(workspacesDir, 'ws_audio', 'canvas.json'), '{}');
  let bound = project;
  const store = createProjectAssetsStore({ workspacesDir, resolveProjectRoot: () => ({ path: bound }) });
  return { root, project, other, store, bind: path => { bound = path; } };
}
function request(body = wav, url = endpoint, headers = {}) {
  const req = body instanceof PassThrough ? body : Readable.from([body]);
  return Object.assign(req, { method: 'POST', url, socket: {}, headers: {
    host: 'localhost:44201', origin: 'http://localhost:44201', 'content-type': 'application/octet-stream', ...headers,
  } });
}
function response() {
  const res = new EventEmitter();
  res.destroyed = false; res.headersSent = false;
  res.writeHead = status => { res.status = status; res.headersSent = true; };
  res.end = text => { res.body = JSON.parse(text); };
  return res;
}
const signal = () => new AbortController().signal;

test('QA2 canonical, legacy and encoded native paths all authenticate before consuming body', async t => {
  const { store } = fixture(t);
  let checks = 0;
  const routes = createAudioBytesRoutes(store, () => ({ requestRejection: () => { checks++; return 401; } }));
  for (const url of [endpoint, endpoint.replace('omnimux-workflow', 'dsh-workflow'), endpoint.replace('assets/audio-bytes', 'audio-file-action'), endpoint.replace('assets/audio-bytes', '%61udio-file-action')]) {
    const req = request(wav, url); const res = response();
    assert.equal(await routes.handle(req, res), true);
    assert.equal(res.status, 401); assert.equal(req.readableDidRead, false);
  }
  assert.equal(checks, 4);
});

test('QA2 conflicting origins and credentials fail while a same-origin Referer-only native request proceeds', async t => {
  const { store } = fixture(t);
  const routes = createAudioBytesRoutes(store, () => ({ requestRejection: () => undefined }));
  for (const headers of [{ origin: 'null' }, { referer: 'http://localhost:44202/' }, { origin: 'http://user:pass@localhost:44201' }, { host: 'localhost:44201/other' }]) {
    const req = request(wav, endpoint, headers); const res = response();
    await routes.handle(req, res);
    assert.equal(res.status, 403); assert.equal(req.readableDidRead, false);
  }
  const req = request(wav, endpoint.replace('assets/audio-bytes', 'audio-file-action'), { origin: undefined, referer: 'http://localhost:44201/canvas' });
  assert.equal(await routes.handle(req, response()), false);
  assert.equal(req.readableDidRead, false);
});

test('QA2 response disconnect cancels an upload, removes temporary bytes and releases the global lock', async t => {
  const { store, project } = fixture(t);
  const routes = createAudioBytesRoutes(store, () => ({ requestRejection: () => undefined }));
  const stream = new PassThrough(); const res = response();
  const pending = routes.handle(request(stream), res);
  stream.write(wav); res.destroyed = true; res.emit('close');
  await pending;
  assert.deepEqual(readdirSync(join(project, 'assets/imported')), []);
  assert.equal(store.get('ws_audio').items.length, 0);
  const retry = response(); await routes.handle(request(), retry);
  assert.equal(retry.status, 201);
});

test('QA2 binding changes during upload cannot register in either project', async t => {
  const f = fixture(t); const stream = new PassThrough();
  const pending = f.store.ingestAudio('ws_audio', stream, signal());
  stream.write(wav); f.bind(f.other); stream.end();
  await assert.rejects(pending, { code: 'path-denied' });
  assert.deepEqual(f.store.get('ws_audio').items, []);
  assert.deepEqual(readdirSync(join(f.project, 'assets/imported')), []);
  assert.deepEqual(readdirSync(f.other), []);
});

test('QA2 exactly 16 MiB is accepted without Content-Length and an empty body is rejected', async t => {
  const { store, project } = fixture(t);
  const data = Buffer.alloc(AUDIO_SAVE_LIMITS.bytes); wav.copy(data);
  const result = await store.ingestAudio('ws_audio', Readable.from([data]), signal());
  assert.equal(result.item.size, AUDIO_SAVE_LIMITS.bytes);
  assert.deepEqual(readFileSync(join(project, result.item.relative_path)), data);
  await assert.rejects(store.ingestAudio('ws_audio', Readable.from([]), signal()), { code: 'unsupported-audio' });
  assert.equal(store.get('ws_audio').items.length, 1);
});

test('QA2 temporary inode substitution is rejected without deleting the replacement file', async t => {
  const { project, store } = fixture(t); const stream = new PassThrough();
  const pending = store.ingestAudio('ws_audio', stream, signal());
  const dir = join(project, 'assets/imported'); const name = readdirSync(dir)[0];
  renameSync(join(dir, name), join(dir, 'held-original'));
  writeFileSync(join(dir, name), 'other-owner');
  stream.end(wav);
  await assert.rejects(pending, { code: 'audio-file-changed' });
  assert.equal(readFileSync(join(dir, name), 'utf8'), 'other-owner');
  assert.equal(store.get('ws_audio').items.length, 0);
});

test('QA2 concurrent local ingest must not erase a successfully registered audio upload', async t => {
  const { root, project, store } = fixture(t);
  const local = join(root, 'local.wav'); writeFileSync(local, wav);
  // Local copy awaits filesystem I/O after taking its ledger snapshot.
  const localPending = store.ingest('ws_audio', { paths: [local] });
  const saved = await store.ingestAudio('ws_audio', Readable.from([wav]), signal());
  assert.ok(store.get('ws_audio').items.some(item => item.id === saved.item.id));
  await localPending;
  assert.ok(readFileSync(join(project, saved.item.relative_path)).equals(wav));
  const final = store.get('ws_audio');
  assert.equal(final.items.length, 2, 'Both successful imports must remain in the ledger');
  assert.ok(final.items.some(item => item.id === saved.item.id));
  assert.equal(final.rev, 2);
});
