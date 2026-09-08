import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioTime, loadAudioPeaks, projectAudioTarget, readAudioBytes, samplePeaks, WAVEFORM_LIMITS } from './audioWaveform.ts';
import { resolveMediaPreviewUrl } from './mediaUrl.ts';

const samples = (...channels) => ({ length: channels[0].length, numberOfChannels: channels.length, getChannelData: (index) => Float32Array.from(channels[index]) });

test('real peaks preserve silence and transients across channels', () => {
  assert.deepEqual(samplePeaks(samples([0, 0, 0, 0]), 2), [0, 0]);
  assert.deepEqual(samplePeaks(samples([0, -1, 0, 0], [0, 0, 0.5, 0]), 2), [1, 0.5]);
});

test('short clips do not duplicate samples and invalid samples are ignored', () => {
  assert.deepEqual(samplePeaks(samples([0.5]), 96), [0.5]);
  assert.deepEqual(samplePeaks(samples([NaN, Infinity, -2]), 3), [0, 0, 1]);
  assert.throws(() => samplePeaks(samples([0]), 0), /budget/);
});

test('time display handles zero, long audio and invalid duration', () => {
  assert.equal(audioTime(0), '0:00');
  assert.equal(audioTime(3601), '1:00:01');
  assert.equal(audioTime(Infinity), '--:--');
  assert.equal(audioTime(-1), '--:--');
});

const origin = 'http://127.0.0.1:45120';
const local = '/omnimux-workflow/api/workspaces/ws_audio/file?rel=assets%2Fimported%2Fa%20b.wav';
test('file target is bound to the selected playback source and current workspace', () => {
  const expected = { workspaceId: 'ws_audio', relativePath: 'assets/imported/a b.wav' };
  assert.deepEqual(projectAudioTarget(local, 'ws_audio', origin), expected);
  assert.deepEqual(projectAudioTarget('/omnimux-workflow/api/project-file?workspace=ws_audio&rel=assets/imported/a%20b.wav', 'ws_audio', origin), expected);
  assert.equal(projectAudioTarget(local, 'ws_other', origin), null);
  const chosen = resolveMediaPreviewUrl('audio', [{ type: 'audio', url: 'https://example.com/a.wav' }], local);
  assert.equal(projectAudioTarget(chosen, 'ws_audio', origin), null);
});

test('target parser rejects remote lookalikes, protocol-relative hosts and forbidden paths', () => {
  for (const source of ['https://evil.test' + local, '//evil.test' + local, 'file:///tmp/a.wav', 'blob:x', local.replace('assets%2Fimported%2Fa%20b.wav', '..%2Fa.wav'), local.replace('assets%2Fimported%2Fa%20b.wav', '%2Ftmp%2Fa.wav'), local.replace('assets%2Fimported%2Fa%20b.wav', 'C%3A%5Ctmp%5Ca.wav')]) {
    assert.equal(projectAudioTarget(source, 'ws_audio', origin), null);
  }
});

test('bounded streaming accepts real bytes and refuses declared or streamed overflow', async () => {
  const signal = new AbortController().signal;
  assert.deepEqual(new Uint8Array(await readAudioBytes(new Response(new Uint8Array([1, 2, 3])), signal)), new Uint8Array([1, 2, 3]));
  await assert.rejects(readAudioBytes(new Response('x', { headers: { 'content-length': String(WAVEFORM_LIMITS.bytes + 1) } }), signal), /budget/);
  await assert.rejects(readAudioBytes(new Response(new Uint8Array(WAVEFORM_LIMITS.bytes + 1)), signal), /budget/);
});

test('aborted reads and excessive duration never decode', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readAudioBytes(new Response('a'), controller.signal), { name: 'AbortError' });
  await assert.rejects(loadAudioPeaks('unused', 601, new AbortController().signal), /budget/);
});

test('decode is serialized, cleaned on abort and cached only after success', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalContext = globalThis.AudioContext;
  let finish;
  let closed = 0;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; return new Response(new Uint8Array([1])); };
  globalThis.AudioContext = class {
    decodeAudioData() { return new Promise((resolve) => { finish = resolve; }); }
    async close() { closed += 1; }
  };
  t.after(() => { globalThis.fetch = originalFetch; globalThis.AudioContext = originalContext; });
  const controller = new AbortController();
  const first = loadAudioPeaks('test:a', 1, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(loadAudioPeaks('test:b', 1, new AbortController().signal), /busy/);
  controller.abort();
  finish({ ...samples([1]), duration: 1 });
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(closed, 1);
  const second = loadAudioPeaks('test:a', 1, new AbortController().signal);
  await new Promise((resolve) => setImmediate(resolve));
  finish({ ...samples([0.5]), duration: 1 });
  assert.deepEqual(await second, [0.5]);
  assert.deepEqual(await loadAudioPeaks('test:a', 1, new AbortController().signal), [0.5]);
  assert.equal(fetched, 2);
  assert.equal(closed, 2);
});
