import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioSaveSource, readSavedAudio, saveRemoteAudio } from './saveRemoteAudio.ts';
import { savedAudioPatch } from './savedAudioPatch.ts';
import { readNodeInputSource } from '../../../shared/graph/nodeInputSource.ts';
import { AUDIO_SAVE_LIMITS } from '../../../shared/projectAssets.ts';

const source = 'https://audio.example.test/a.wav?signature=private';
const origin = 'http://localhost:44201';
const item = { id: 'ast_audio', type: 'audio', name: 'audio.wav', relative_path: 'assets/imported/audio.wav', mimeType: 'audio/wav', size: 44, durationSec: null };
const signal = () => new AbortController().signal;

test('QA2 save policy refuses canonicalized traversal and local query wrappers without blocking genuine media keys', () => {
  for (const path of ['/omnimux/inspiration/media/../../api/private', '/omnimux/inspiration/media/%2e%2e/%2e%2e/api/private', '/omnimux/inspiration/media/a.wav?url=https://evil.test', '/omnimux/inspiration/media/a.wav#fragment', '/omnimux/inspiration/media/%2fapi%2fprivate']) {
    assert.throws(() => audioSaveSource(path, origin), /audio-save-source/);
  }
  assert.equal(audioSaveSource('/omnimux/inspiration/media/clips/a-b_2.wav', origin).credentials, 'same-origin');
  assert.equal(audioSaveSource(source, origin).credentials, 'omit');
});

test('QA2 remote reader accepts exact budget, rejects empty/opaque responses and honours pre-aborted signals', async () => {
  assert.equal((await readSavedAudio(new Response(new Uint8Array(AUDIO_SAVE_LIMITS.bytes)), signal())).size, AUDIO_SAVE_LIMITS.bytes);
  await assert.rejects(readSavedAudio(new Response(new Uint8Array()), signal()), /audio-save-network/);
  const opaque = new Response('x'); Object.defineProperty(opaque, 'type', { value: 'opaque' });
  await assert.rejects(readSavedAudio(opaque, signal()), /audio-save-network/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readSavedAudio(new Response('x'), controller.signal), { name: 'AbortError' });
});

test('QA2 timeout remains active during upload and unlocks another save without queueing', async t => {
  const originalFetch = globalThis.fetch; const originalTimer = globalThis.setTimeout;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer; });
  let expire; let uploaded; let requestSignal;
  const started = new Promise(resolve => { uploaded = resolve; });
  globalThis.setTimeout = (fn, ms) => { assert.equal(ms, 20_000); expire = fn; return 1; };
  globalThis.fetch = async (url, options) => {
    if (url === source) return new Response(new Uint8Array(44));
    requestSignal = options.signal; uploaded();
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const pending = saveRemoteAudio(source, 'ws_audio', origin, signal());
  const rejected = assert.rejects(pending, /audio-save-timeout/);
  await started;
  await assert.rejects(saveRemoteAudio(source, 'ws_audio', origin, signal()), /audio-save-busy/);
  expire(); await rejected;
  assert.equal(requestSignal.aborted, true);
  globalThis.fetch = async url => url === source ? new Response(new Uint8Array(44)) : Response.json({ item, rev: 1 });
  assert.equal((await saveRemoteAudio(source, 'ws_audio', origin, signal())).item.id, item.id);
});

test('QA2 malformed or failed upload receipt never returns a usable saved asset', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  for (const receipt of [{ error: 'audio-save-busy' }, { item: { ...item, type: 'image' } }, { item: { ...item, relative_path: '/outside.wav' } }, {}]) {
    globalThis.fetch = async url => url === source ? new Response(new Uint8Array(44)) : Response.json(receipt, { status: receipt.error ? 409 : 200 });
    await assert.rejects(saveRemoteAudio(source, 'ws_audio', origin, signal()), /audio-save-(busy|failed)/);
  }
});

test('QA2 actual shared input projection follows the saved selection with measured size and unknown duration', () => {
  const history = { type: 'audio', url: 'https://audio.example.test/older.wav' };
  const data = { materialType: 'audio', mediaUrl: '/unrelated', duration: 999, durationSec: 999, fileSize: 777, realPath: '/unrelated', mediaAssets: [{ type: 'audio', url: source, durationSec: 999, sizeBytes: 777, path: '/unrelated' }, history], sttText: 'keep', params: { model: 'keep' } };
  const patch = savedAudioPatch(data, source, 'ws_audio', item);
  const saved = { ...data, ...patch };
  const projected = readNodeInputSource({ id: 'audio', data: saved }, 'ws_audio');
  assert.equal(projected.availability, 'ready');
  assert.equal(projected.outputId, item.id);
  assert.equal(projected.output.mediaAssets[0].relativePath, item.relative_path);
  assert.equal(projected.output.mediaAssets[0].durationSec, undefined);
  assert.equal(projected.output.mediaAssets[0].sizeBytes, 44);
  assert.equal(projected.output.mediaAssets[0].path, undefined);
  assert.equal(saved.mediaAssets[1], history);
  assert.equal(saved.sttText, 'keep'); assert.equal(saved.params, data.params);
});
