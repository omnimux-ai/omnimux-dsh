import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCoverThumbnail } from './coverThumbnail.js';

test('thumbnail decoding deduplicates, bounds dimensions and recovers corrupt cache and bad poster', async () => {
  const originals = Object.fromEntries(['document', 'location', 'caches', 'createImageBitmap'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let loads = 0, removed = 0;
  const entries = new Map();
  const dimensions = [];
  const cache = { match: async (request) => entries.get(request.url)?.clone(), put: async (request, response) => entries.set(request.url, response), keys: async () => [...entries.keys()].map((url) => new Request(url)), delete: async (request) => { removed++; return entries.delete(request.url); } };
  globalThis.location = { origin: 'http://localhost' };
  globalThis.caches = { open: async () => cache };
  globalThis.createImageBitmap = async (blob) => { if (await blob.text() === 'corrupt') throw new Error('corrupt'); return { close() {} }; };
  globalThis.document = { createElement(type) {
    if (type === 'canvas') return { width: 0, height: 0, getContext() { return { drawImage() {} }; }, toBlob(callback) { dimensions.push([this.width, this.height]); callback(new Blob(['valid'], { type: 'image/webp' })); } };
    return { naturalWidth: 2400, naturalHeight: 1200, videoWidth: 1920, videoHeight: 1080, duration: 5,
      removeAttribute() {}, pause() {}, load() {},
      set currentTime(value) { queueMicrotask(() => this.onseeked?.()); },
      set src(value) { loads++; queueMicrotask(() => { if (value.includes('broken')) this.onerror?.(); else if (type === 'video') this.onloadedmetadata?.(); else this.onload?.(); }); },
    };
  } };
  try {
    const cover = { kind: 'image', mediaUrl: '/image.png', sourceRevision: 'test-image' };
    const [a, b] = await Promise.all([loadCoverThumbnail(cover), loadCoverThumbnail(cover)]);
    assert.equal(a, b); assert.equal(loads, 1); assert.deepEqual(dimensions[0], [640, 320]);
    await loadCoverThumbnail(cover); assert.equal(loads, 1);
    for (const key of entries.keys()) entries.set(key, new Response(new Blob(['corrupt']), { headers: { 'x-cover-created': String(Date.now()) } }));
    await loadCoverThumbnail(cover); assert.equal(loads, 2); assert.equal(removed, 1);
    await loadCoverThumbnail({ kind: 'video', mediaUrl: '/movie.mp4', thumbnailUrl: '/broken.png', sourceRevision: 'test-video' });
    assert.equal(loads, 4); assert.deepEqual(dimensions.at(-1), [640, 360]);
    await assert.rejects(loadCoverThumbnail({ kind: 'image', mediaUrl: '/broken.png', sourceRevision: 'test-failure' }));
    const failedLoads = loads;
    await assert.rejects(loadCoverThumbnail({ kind: 'image', mediaUrl: '/broken.png', sourceRevision: 'test-failure' }), /retry-later/);
    assert.equal(loads, failedLoads);
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
