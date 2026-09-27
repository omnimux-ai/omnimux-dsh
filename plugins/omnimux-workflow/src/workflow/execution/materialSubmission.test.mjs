import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { catalogFor, operation, slot } from '../seam/submissionFixtures.mjs';

const root = mkdtempSync(join(tmpdir(), 'material-submit-469-'));
after(() => rmSync(root, { recursive: true, force: true }));
const context = (overrides = {}) => ({ upstreamOutputs: new Map(), mediaDir: root,
  signal: new AbortController().signal, ...overrides });
const node = (type = 'video', params = {}) => ({ id: 'output', type: 'material', data: { materialType: type, prompt: 'go', params } });

function captureGateway(catalog, result = { url: 'https://example.test/output.mp4', type: 'video' }) {
  const requests = [];
  return { requests, capabilities: async () => catalog,
    submit: async (req) => { requests.push(req); return { taskId: 'capture', mode: 'submitted' }; },
    awaitTask: async () => result };
}

test('binding identity, roles, slots and metadata reach the request without deduplicating distinct roles', async () => {
  const catalog = catalogFor('video', 'frames', [operation('frames', 'video', [
    slot('image', 'first_frame', 1, 1, 'start_frame'), slot('image', 'last_frame', 1, 1, 'end_frame'),
    slot('audio', 'audio_track', 1, 1, 'soundtrack'),
  ])]);
  const gateway = captureGateway(catalog);
  const image = { mediaAssets: [{ type: 'image', url: 'https://example.test/frame.png', mimeType: 'image/png', sizeBytes: 123 }] };
  const audio = { mediaAssets: [{ type: 'audio', url: 'https://example.test/voice.mp3', mimeType: 'audio/mpeg', sizeBytes: 456, durationSec: 3.5 }] };
  const bindings = [
    { sourceNodeId: 'same-image', edgeId: 'first', role: 'first_frame', targetSlot: 'start_frame', output: image },
    { sourceNodeId: 'same-image', edgeId: 'last', role: 'last_frame', targetSlot: 'end_frame', output: image },
    { sourceNodeId: 'audio', edgeId: 'sound', role: 'audio_track', targetSlot: 'soundtrack', output: audio },
  ];
  await createMaterialGatewayExecutor({ gateway }).execute(node(), context({ upstreamBindings: [...bindings, { ...bindings[0], edgeId: 'duplicate' }] }));
  assert.equal(gateway.requests.length, 1);
  const req = gateway.requests[0];
  assert.equal(req.operation, 'frames');
  assert.equal(req.model, 'frames');
  assert.deepEqual(req.references, bindings.slice(0, 2).map(({ output, ...binding }) => ({ ...binding,
    type: 'image', pathOrUrl: image.mediaAssets[0].url, mimeType: 'image/png', sizeBytes: 123 })));
  assert.deepEqual(req.audioTrack, { role: 'audio_track', type: 'audio', pathOrUrl: audio.mediaAssets[0].url,
    edgeId: 'sound', sourceNodeId: 'audio', targetSlot: 'soundtrack', mimeType: 'audio/mpeg', sizeBytes: 456, durationSec: 3.5 });
});

test('a slot-only binding receives its catalog role instead of becoming a generic reference', async () => {
  const catalog = catalogFor('video', 'first', [operation('first_frame', 'video', [slot('image', 'first_frame', 1, 1, 'start_frame')])]);
  const gateway = captureGateway(catalog);
  await createMaterialGatewayExecutor({ gateway }).execute(node(), context({ upstreamBindings: [{
    sourceNodeId: 'input', edgeId: 'frame', targetSlot: 'start_frame',
    output: { mediaAssets: [{ type: 'image', url: 'https://example.test/frame.png' }] },
  }] }));
  assert.equal(gateway.requests[0].references[0].role, 'first_frame');
  assert.equal(gateway.requests[0].operation, 'first_frame');
});

test('executor guards missing required assets and connected empty outputs before gateway.submit', async () => {
  const catalog = catalogFor('video', 'frame', [operation('frame', 'video', [slot('image', 'first_frame', 1)])]);
  const gateway = captureGateway(catalog);
  const executor = createMaterialGatewayExecutor({ gateway });
  await assert.rejects(executor.execute(node(), context()), { code: 'min_unsatisfied' });
  await assert.rejects(executor.execute(node(), context({ upstreamBindings: [{ sourceNodeId: 'empty', output: {} }] })), { code: 'min_unsatisfied' });
  await assert.rejects(executor.execute(node(), context({ upstreamBindings: [{ sourceNodeId: 'lost', output: { mediaAssets: [{ type: 'image', url: 'blob:lost' }] } }] })), /素材/);
  assert.equal(gateway.requests.length, 0);
});

for (const [label, result] of [
  ['declared type', { type: 'image', url: 'https://example.test/out.png' }],
  ['MIME', { type: 'video', mimeType: 'audio/wav', url: 'https://example.test/out.mp4' }],
  ['URL type', { url: 'https://example.test/out.png' }],
  ['text response', { text: 'not a video' }],
]) {
  test(`mismatched ${label} never reaches project persistence`, async () => {
    const gateway = captureGateway(catalogFor('video'), result);
    let writes = 0;
    await assert.rejects(createMaterialGatewayExecutor({ gateway }).execute(node(), context({ persistGenerated: async () => { writes++; } })), { code: 'omnimux-invalid-response' });
    assert.equal(writes, 0);
  });
}

test('actual file bytes override a misleading destination extension before persistence', async () => {
  const dest = join(root, 'output.mp4');
  writeFileSync(dest, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
  try {
    const gateway = captureGateway(catalogFor('video'), { url: dest, type: 'video' });
    let writes = 0;
    await assert.rejects(createMaterialGatewayExecutor({ gateway }).execute(node(), context({ persistGenerated: async () => { writes++; } })), { code: 'omnimux-invalid-response' });
    assert.equal(writes, 0);
  } finally { rmSync(dest); }
});

for (const persist of [false, true]) {
  test(`output metadata survives ${persist ? 'project persistence' : 'direct URL'} without using request duration`, async () => {
    const result = { type: 'video', url: 'https://example.test/out.mp4', mimeType: 'video/mp4',
      sizeBytes: 2000, durationSec: 7, relativePath: 'artifacts/original.mp4', assetId: 'original' };
    const gateway = captureGateway(catalogFor('video'), result);
    const output = await createMaterialGatewayExecutor({ gateway }).execute(node('video', { duration: 20 }), context(persist ? {
      persistGenerated: async (input) => {
        assert.equal(input.modelId, 'test-model');
        return { url: '/project/out.mp4', relativePath: 'artifacts/out.mp4', assetId: 'persisted', sizeBytes: 2200 };
      },
    } : {}));
    assert.deepEqual(output.mediaAssets[0], { type: 'video', url: persist ? '/project/out.mp4' : result.url,
      relativePath: persist ? 'artifacts/out.mp4' : result.relativePath, assetId: persist ? 'persisted' : result.assetId,
      mimeType: 'video/mp4', sizeBytes: persist ? 2200 : 2000, durationSec: 7 });
  });
}

test('untrusted node identifiers never become output path components', async () => {
 const destinations = [];
 for (const id of ['../../outside', '/absolute', '..\\outside', 'a/b', 'a_b', '中文节点']) {
  const gateway = captureGateway(catalogFor('text'), { type: 'text', text: 'result' });
  gateway.awaitTask = async (_id, dest) => { destinations.push(dest); writeFileSync(dest, 'result'); return { type: 'text', text: 'result', url: dest }; };
  const output = await createMaterialGatewayExecutor({ gateway }).execute({ ...node('text'), id }, context());
  assert.equal(output.text, 'result');
 }
 assert.equal(new Set(destinations).size, destinations.length);
 for (const dest of destinations) assert.match(dest.slice(root.length + 1), /^[a-f0-9]{64}-[a-f0-9-]+\.txt$/);
});

test('auto-enriches remote media sizeBytes and mimeType via HEAD probe before gateway submission (#2722)', async () => {
  const catalog = catalogFor('video', 'minimax-h3', [operation('first_frame', 'video', [
    slot('prompt', 'prompt', 1, 1, 'prompt'),
    {
      ...slot('image', 'first_frame', 1, 1, 'first_frame'),
      allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
      maxSizeMb: 30,
    },
  ])]);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, opts) => {
      if (opts?.method === 'HEAD' && url === 'https://example.test/product.png') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-length': '30642',
            'content-type': 'image/png; charset=utf-8',
          },
        });
      }
      return originalFetch(url, opts);
    };

    const gateway = captureGateway(catalog);
    const remoteImage = {
      mediaAssets: [{
        type: 'image',
        url: 'https://example.test/product.png',
      }],
    };
    const bindings = [{
      sourceNodeId: 'node-slot-product-image',
      edgeId: 'edge-img-to-video',
      role: 'first_frame',
      targetSlot: 'first_frame',
      output: remoteImage,
    }];

    await createMaterialGatewayExecutor({ gateway }).execute(
      node('video', { model: 'minimax-h3', operation: 'first_frame' }),
      context({ upstreamBindings: bindings }),
    );

    assert.equal(gateway.requests.length, 1);
    const req = gateway.requests[0];
    assert.equal(req.operation, 'first_frame');
    assert.equal(req.model, 'minimax-h3');
    const [firstRef] = req.references;
    assert.equal(firstRef.pathOrUrl, 'https://example.test/product.png');
    assert.equal(firstRef.sizeBytes, 30642);
    assert.equal(firstRef.mimeType, 'image/png');
    assert.equal(firstRef.targetSlot, 'first_frame');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('gracefully falls back when remote media HEAD probe fails or times out (#2722)', async () => {
  const catalog = catalogFor('image', 'mock-img', [operation('text_to_image', 'image', [
    slot('prompt', 'prompt', 1, 1, 'prompt'),
    slot('image', 'reference', 0, 1, 'reference'),
  ])]);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error('connection timeout');
    };

    const gateway = captureGateway(catalog, { url: 'https://example.test/output.png', type: 'image' });
    const bindings = [{
      sourceNodeId: 'node-slot-ref',
      edgeId: 'edge-ref-to-img',
      role: 'reference',
      targetSlot: 'reference',
      output: {
        mediaAssets: [{
          type: 'image',
          url: 'https://example.test/broken.png',
        }],
      },
    }];

    // Should not throw unhandled exception during executor HEAD probe phase
    await createMaterialGatewayExecutor({ gateway }).execute(
      node('image', { model: 'mock-img', operation: 'text_to_image' }),
      context({ upstreamBindings: bindings }),
    );

    assert.equal(gateway.requests.length, 1);
    const [firstRef] = gateway.requests[0].references;
    assert.equal(firstRef.pathOrUrl, 'https://example.test/broken.png');
    assert.equal(firstRef.sizeBytes, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
