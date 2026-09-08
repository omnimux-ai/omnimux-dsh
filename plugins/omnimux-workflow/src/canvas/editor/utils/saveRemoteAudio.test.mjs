import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioSaveSource, readSavedAudio, saveRemoteAudio } from './saveRemoteAudio.ts';
import { savedAudioPatch } from './savedAudioPatch.ts';
import { AUDIO_SAVE_LIMITS } from '../../../shared/projectAssets.ts';
const origin = 'http://localhost:45120';
const source = 'https://audio.example.test/a.wav?signature=private';
const item = { id: 'ast_audio', type: 'audio', name: 'audio.wav', relative_path: 'assets/imported/audio.wav', mimeType: 'audio/wav', size: 44, durationSec: null };
const signal = () => new AbortController().signal;

test('save URL policy refuses HTTP, userinfo, unrecognized same-origin routes and URL wrapping', () => {
  for (const url of ['http://example.test/a.wav', 'https://user:pass@example.test/a.wav', 'file:///a.wav', 'blob:a', '/api/secrets', '/omnimux/inspiration/media/?url=https://evil.test', '/omnimux/inspiration/media/https%3A%2F%2Fevil.test']) {
    assert.throws(() => audioSaveSource(url, origin), /audio-save-source/);
  }
  assert.equal(audioSaveSource(source, origin).credentials, 'omit');
  assert.equal(audioSaveSource('/omnimux/inspiration/media/clips/a.wav', origin).credentials, 'same-origin');
});

test('streamed reader supports missing length, refuses actual overflow, cancels pending reads', async () => {
  const bytes = await readSavedAudio(new Response(new Uint8Array([1, 2, 3])), signal());
  assert.equal(bytes.size, 3);
  let cancelled = 0;
  await assert.rejects(readSavedAudio(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(AUDIO_SAVE_LIMITS.bytes)); c.enqueue(new Uint8Array([1])); }, cancel() { cancelled++; } })), signal()), /audio-save-budget/);
  assert.equal(cancelled, 1);
  await assert.rejects(readSavedAudio(new Response('x', { headers: { 'content-length': AUDIO_SAVE_LIMITS.bytes + 1 } }), signal()), /audio-save-budget/);
  const controller = new AbortController();
  const stream = new ReadableStream({ cancel() { cancelled++; } });
  const pending = readSavedAudio(new Response(stream), controller.signal); controller.abort();
  await assert.rejects(pending); assert.equal(stream.locked, false); assert.equal(cancelled, 2);
});

test('remote fetch uses CORS without credentials/referrer/redirect and sends only bounded bytes', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? new Response(new Uint8Array(44)) : Response.json({ item, rev: 1 });
  };
  const result = await saveRemoteAudio(source, 'ws_audio', origin, signal());
  assert.equal(result.item.id, item.id);
  assert.equal(calls[0].options.mode, 'cors'); assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer'); assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[1].url, '/omnimux-workflow/api/workspaces/ws_audio/assets/audio-bytes');
  assert.equal(calls[1].options.body.size, 44);
  assert.equal(calls[1].options.headers['Content-Type'], 'application/octet-stream');
  assert.ok(!JSON.stringify(calls[1]).includes('signature'));
});

test('CORS and network failures share truthful retryable error; redirects are rejected', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  for (const cause of [new TypeError('Failed to fetch'), new Error('CORS')]) {
    globalThis.fetch = async () => { throw cause; };
    await assert.rejects(saveRemoteAudio(source, 'ws_audio', origin, signal()), /audio-save-network/);
  }
  globalThis.fetch = async () => { const response = new Response('audio'); Object.defineProperty(response, 'redirected', { value: true }); return response; };
  await assert.rejects(saveRemoteAudio(source, 'ws_audio', origin, signal()), /audio-save-network/);
});

test('save concurrency, abort and 20-second timeout unlock retries without uploads', async t => {
  const originalFetch = globalThis.fetch; const originalTimer = globalThis.setTimeout;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer; });
  let timed;
  globalThis.setTimeout = (fn, ms) => { assert.equal(ms, 20_000); timed = fn; return 1; };
  let calls = 0;
  globalThis.fetch = (_url, options) => { calls++; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))); };
  const controller = new AbortController();
  const first = saveRemoteAudio(source, 'ws_audio', origin, controller.signal);
  await assert.rejects(saveRemoteAudio(source, 'ws_audio', origin, signal()), /audio-save-busy/);
  controller.abort(); await assert.rejects(first); assert.equal(calls, 1);
  const timeout = saveRemoteAudio(source, 'ws_audio', origin, signal()); timed();
  await assert.rejects(timeout, /audio-save-timeout/); assert.equal(calls, 2);
});

test('saved patch updates selected output identity and metadata but preserves historical results and configuration', () => {
  const prior = { type: 'image', url: 'https://image.test/a.png' };
  const other = { type: 'audio', url: 'https://audio.test/older.wav' };
  const data = { materialType: 'audio', mediaAssets: [prior, { type: 'audio', url: source, relativePath: 'unrelated', path: '/unrelated', custom: 'keep' }, other], mediaUrl: '/unrelated', sttText: 'ASR', contentFormat: 'srt', params: { model: 'seed' } };
  const patch = savedAudioPatch(data, source, 'ws_audio', item);
  assert.equal(patch.mediaAssets[0], prior); assert.equal(patch.mediaAssets[2], other);
  assert.equal(patch.mediaAssets[1].assetId, item.id); assert.equal(patch.mediaAssets[1].path, undefined);
  assert.equal(patch.mediaAssets[1].custom, 'keep'); assert.equal(patch.durationSec, null);
  assert.equal(patch.params, undefined); assert.equal(patch.sttText, undefined);
  assert.equal(savedAudioPatch(data, 'changed', 'ws_audio', item), null);
});
