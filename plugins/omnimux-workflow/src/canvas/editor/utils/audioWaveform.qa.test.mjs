import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAudioPeaks, readAudioBytes, WAVEFORM_LIMITS } from './audioWaveform.ts';

function mockDecoder(t) {
  const originalFetch = globalThis.fetch;
  const originalContext = globalThis.AudioContext;
  const calls = { fetched: 0, closed: 0, decoded: 0 };
  let decode = async () => ({ duration: 1, length: 2, numberOfChannels: 1, getChannelData: () => new Float32Array([0, 0.5]) });
  globalThis.fetch = async () => { calls.fetched += 1; return new Response(new Uint8Array([1, 2])); };
  globalThis.AudioContext = class {
    constructor(options) { assert.equal(options.sampleRate, WAVEFORM_LIMITS.sampleRate); }
    async decodeAudioData(bytes) { calls.decoded += 1; return decode(bytes); }
    async close() { calls.closed += 1; }
  };
  t.after(() => { globalThis.fetch = originalFetch; globalThis.AudioContext = originalContext; });
  return { calls, setDecode: fn => { decode = fn; } };
}
const signal = () => new AbortController().signal;

test('QA decode rejection releases AudioContext and allows a subsequent request', async t => {
  const f = mockDecoder(t);
  f.setDecode(async () => { throw new Error('invalid audio'); });
  await assert.rejects(loadAudioPeaks('qa:decode-failure', 1, signal()), /invalid audio/);
  assert.equal(f.calls.closed, 1);
  f.setDecode(async () => ({ duration: 1, length: 1, numberOfChannels: 1, getChannelData: () => new Float32Array([0.25]) }));
  assert.deepEqual(await loadAudioPeaks('qa:decode-recovery', 1, signal()), [0.25]);
  assert.equal(f.calls.closed, 2);
});

test('QA decoded duration/channel overflows close context and do not populate cache', async t => {
  const f = mockDecoder(t);
  for (const buffer of [{ duration: 601, numberOfChannels: 1 }, { duration: 1, numberOfChannels: 9 }]) {
    f.setDecode(async () => buffer);
    await assert.rejects(loadAudioPeaks('qa:decoded-overflow', 1, signal()), /waveform-budget/);
  }
  assert.equal(f.calls.fetched, 2);
  assert.equal(f.calls.closed, 2);
});

test('QA peak cache evicts oldest entries and expires after five minutes', async t => {
  const f = mockDecoder(t);
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });
  for (let i = 0; i <= WAVEFORM_LIMITS.cacheEntries; i += 1) await loadAudioPeaks(`qa:cache-${i}`, 1, signal());
  const count = f.calls.fetched;
  await loadAudioPeaks('qa:cache-0', 1, signal());
  assert.equal(f.calls.fetched, count + 1);
  await loadAudioPeaks('qa:cache-0', 1, signal());
  assert.equal(f.calls.fetched, count + 1);
  now += WAVEFORM_LIMITS.cacheMs + 1;
  await loadAudioPeaks('qa:cache-0', 1, signal());
  assert.equal(f.calls.fetched, count + 2);
});

test('QA streamed overflow cancels the source and releases its reader lock', async () => {
  let cancelled = 0;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(WAVEFORM_LIMITS.bytes)); controller.enqueue(new Uint8Array([1])); },
    cancel() { cancelled += 1; },
  });
  await assert.rejects(readAudioBytes(new Response(stream), signal()), /waveform-budget/);
  assert.equal(cancelled, 1);
  assert.equal(stream.locked, false);
});
