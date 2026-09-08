import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { Readable, PassThrough } from 'node:stream';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectAssetsStore } from './workspace/ProjectAssetsStore.ts';
import { ingestAudioBytes } from './ingest/AudioBytesIngest.ts';
import { createAudioBytesRoutes } from './routes/audioBytesRoutes.ts';
import { AUDIO_SAVE_LIMITS } from '../shared/projectAssets.ts';
import { readJsonBody, MAX_JSON_BODY_BYTES } from '../http/helpers.ts';

const wav = Buffer.alloc(44);
wav.write('RIFF'); wav.write('WAVE', 8); wav.write('fmt ', 12);
const endpoint = '/omnimux-workflow/api/workspaces/ws_audio/assets/audio-bytes';
const signal = () => new AbortController().signal;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'audio-bytes-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const workspacesDir = join(root, 'workspaces');
  mkdirSync(project);
  mkdirSync(join(workspacesDir, 'ws_audio'), { recursive: true });
  writeFileSync(join(workspacesDir, 'ws_audio', 'canvas.json'), '{}');
  const store = createProjectAssetsStore({ workspacesDir, resolveProjectRoot: id => id === 'ws_audio' ? { path: project } : null });
  return { root, project, store };
}
function request(payload = wav, headers = {}, url = endpoint) {
  const req = Readable.from([payload]);
  req.method = 'POST'; req.url = url; req.socket = {};
  req.headers = { host: 'localhost:45120', origin: 'http://localhost:45120', 'content-type': 'application/octet-stream', ...headers };
  return req;
}
function response() {
  const res = new EventEmitter();
  res.headersSent = false; res.destroyed = false;
  res.writeHead = status => { res.status = status; res.headersSent = true; };
  res.end = body => { res.body = JSON.parse(body); };
  return res;
}

test('raw route fails closed before body reads without connection authentication', async t => {
  const { store } = fixture(t);
  for (const seat of [undefined, {}, { requestRejection: () => 401 }, { requestRejection: () => 403 }]) {
    const req = request(); const res = response();
    assert.equal(await createAudioBytesRoutes(store, () => seat).handle(req, res), true);
    assert.equal(req.readableDidRead, false);
    assert.ok([401, 403, 503].includes(res.status));
  }
});

test('raw audio and native entrypoints require exact origin and existing workspace', async t => {
  const { store } = fixture(t);
  const routes = createAudioBytesRoutes(store, () => ({ requestRejection: () => undefined }));
  for (const path of [endpoint, endpoint.replace('assets/audio-bytes', 'audio-file-action')]) {
    for (const headers of [{ origin: undefined }, { origin: 'http://localhost:45121' }, { origin: 'https://localhost:45120' }, { origin: 'http://127.0.0.1:45120' }, { referer: 'http://evil.test/' }, { host: undefined }, { 'sec-fetch-site': 'cross-site' }]) {
      const req = request(wav, headers, path); const res = response();
      await routes.handle(req, res); assert.equal(res.status, 403); assert.equal(req.readableDidRead, false);
    }
  }
  for (const [path, status] of [[endpoint.replace('ws_audio', 'bad'), 400], [endpoint.replace('ws_audio', 'ws_missing'), 404], [endpoint + '?url=https://evil.test/a', 400], [endpoint + '?sourcePath=/tmp/a', 400]]) {
    const req = request(wav, {}, path); const res = response();
    await routes.handle(req, res); assert.equal(res.status, status); assert.equal(req.readableDidRead, false);
  }
});

test('audio route streams valid bytes, preserves canonical metadata, and never returns absolute path', async t => {
  const { store, project } = fixture(t);
  const res = response();
  await createAudioBytesRoutes(store, () => ({ requestRejection: () => undefined })).handle(request(), res);
  assert.equal(res.status, 201);
  assert.equal(res.body.item.type, 'audio'); assert.equal(res.body.item.mimeType, 'audio/wav');
  assert.match(res.body.item.relative_path, /^assets\/imported\/audio-.*\.wav$/);
  assert.deepEqual(readFileSync(join(project, res.body.item.relative_path)), wav);
  assert.equal(statSync(join(project, res.body.item.relative_path)).mode & 0o777, 0o600);
  assert.equal(store.get('ws_audio').items[0].mimeType, 'audio/wav');
  assert.equal(res.body.item.lineage, undefined);
  assert.ok(!JSON.stringify(res.body).includes(project));
});

test('MIME, URL JSON, compressed body and claimed over-budget uploads fail', async t => {
  const { store } = fixture(t);
  const routes = createAudioBytesRoutes(store, () => ({ requestRejection: () => undefined }));
  for (const [body, headers, status] of [[wav, { 'content-type': 'audio/wav' }, 415], [wav, { 'content-encoding': 'gzip' }, 415], [wav, { 'content-length': String(AUDIO_SAVE_LIMITS.bytes + 1) }, 413], [Buffer.from('{"url":"https://example.test/a"}'), {}, 415], [Buffer.from('<html>not audio</html>'), {}, 415]]) {
    const res = response(); await routes.handle(request(body, headers), res); assert.equal(res.status, status);
  }
  assert.equal(store.get('ws_audio').items.length, 0);
});

test('streamed actual limit and disconnected streams leave no assets or temporary files', async t => {
  const { store, project } = fixture(t);
  await assert.rejects(store.ingestAudio('ws_audio', Readable.from([wav, Buffer.alloc(AUDIO_SAVE_LIMITS.bytes)]), signal()), { code: 'audio-save-budget' });
  const stream = new PassThrough();
  const pending = store.ingestAudio('ws_audio', stream, signal());
  stream.write(wav); stream.destroy(new Error('disconnected'));
  await assert.rejects(pending, /disconnected/);
  const controller = new AbortController(); const hanging = new PassThrough();
  const cancelled = store.ingestAudio('ws_audio', hanging, controller.signal);
  hanging.write(wav); controller.abort();
  await assert.rejects(cancelled);
  assert.deepEqual(readdirSync(join(project, 'assets/imported')), []);
  assert.deepEqual(store.get('ws_audio').items, []);
});

test('symlink parents and insufficient disk refuse before consuming bytes', async t => {
  const { root, project, store } = fixture(t);
  const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(project, 'assets'));
  const source = Readable.from([wav]);
  await assert.rejects(store.ingestAudio('ws_audio', source, signal()), { code: 'path-denied' });
  assert.equal(source.readableDidRead, false); assert.deepEqual(readdirSync(outside), []);
  await assert.rejects(ingestAudioBytes({ projectRoot: project, source: Readable.from([wav]), signal: signal(), register: () => {}, statfs: () => ({ bavail: 0, bsize: 1 }) }), { code: 'disk-space-insufficient' });
});

test('registration reloads ledger after awaiting bytes and repeated saves never overwrite', async t => {
  const { store, project } = fixture(t);
  const stream = new PassThrough();
  const pending = store.ingestAudio('ws_audio', stream, signal());
  stream.write(wav);
  store.mkdir('ws_audio', { name: 'Concurrent folder' });
  stream.end();
  const first = await pending;
  assert.equal(first.rev, 2);
  const second = await store.ingestAudio('ws_audio', Readable.from([wav]), signal());
  assert.notEqual(first.item.relative_path, second.item.relative_path);
  assert.equal(store.get('ws_audio').items.length, 2);
  assert.equal(store.get('ws_audio').folders[0].name, 'Concurrent folder');
  assert.equal(readdirSync(join(project, 'assets/imported')).length, 2);
});

test('raw uploads serialize and timeout releases lock without registration', async t => {
  const { store } = fixture(t);
  let fire;
  const original = globalThis.setTimeout;
  globalThis.setTimeout = fn => { fire = fn; return 1; };
  t.after(() => { globalThis.setTimeout = original; });
  const routes = createAudioBytesRoutes(store, () => ({ requestRejection: () => undefined }));
  const req = new PassThrough(); Object.assign(req, { method: 'POST', url: endpoint, socket: {}, headers: request().headers });
  const first = routes.handle(req, response());
  const busy = response(); await routes.handle(request(), busy); assert.equal(busy.status, 409);
  fire(); await first;
  assert.equal(store.get('ws_audio').items.length, 0);
  const recovered = response(); await routes.handle(request(), recovered); assert.equal(recovered.status, 201);
});

test('failed registration cleans only its own upload and refuses metadata symlink escapes', async t => {
  const { root, project } = fixture(t);
  await assert.rejects(ingestAudioBytes({ projectRoot: project, source: Readable.from([wav]), signal: signal(), register: () => { throw new Error('ledger failure'); } }), /ledger failure/);
  assert.deepEqual(readdirSync(join(project, 'assets/imported')), []);
  const outside = join(root, 'metadata'); mkdirSync(outside);
  rmSync(join(project, '.omnimux'), { recursive: true });
  symlinkSync(outside, join(project, '.omnimux'));
  await assert.rejects(ingestAudioBytes({ projectRoot: project, source: Readable.from([wav]), signal: signal(), register: () => {} }), { code: 'path-denied' });
  assert.deepEqual(readdirSync(outside), []);
});

test('HTTP adapter protects native and raw routes before the unchanged JSON parser', () => {
  const source = readFileSync(new URL('./routes/canvasRoutes.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf('await dispatcher.handleAudioRequest(req, res)') < source.indexOf('body = await readJsonBody(req)'));
  assert.match(source, /createAudioBytesRoutes\(assetsStore, \(\) => deps.getSeam\?\.\('connection'\)\)/);
});

test('existing JSON routes retain their original 1 MiB body limit', async () => {
  assert.equal(MAX_JSON_BODY_BYTES, 1024 * 1024);
  await assert.rejects(readJsonBody(Readable.from([Buffer.alloc(MAX_JSON_BODY_BYTES + 1)])), { name: 'JsonBodyLimitError' });
});
