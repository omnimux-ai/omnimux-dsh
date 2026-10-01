// Regression coverage for Issue #2722: an App form pick must carry the library
// record's own media metadata, otherwise a remote (https) reference can never
// satisfy a slot that declares maxSizeMb and the submission is rejected forever.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCanvasSubmission } from './submitGuard.ts';
import { catalogFor, operation, slot } from './submissionFixtures.mjs';

// Mirrors video-models.yaml: minimax-h3 image_to_video first_frame.
const h3Catalog = catalogFor('video', 'minimax-h3', [
  operation('image_to_video', 'video', [
    slot('prompt', 'prompt', 1, 1, 'prompt'),
    {
      ...slot('image', 'first_frame', 1, 1, 'first_frame'),
      allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      maxSizeMb: 30,
    },
  ]),
]);

const REMOTE_URL = 'https://cdn.omnimux.ai/demo/product-image.jpg';

const h3Request = (references) => ({
  capability: 'video',
  model: 'minimax-h3',
  operation: 'image_to_video',
  prompt: 'a product hero shot',
  dest: '/tmp/never-written.mp4',
  references,
});

test('#2722 a remote pick WITH library metadata satisfies a maxSizeMb first_frame slot', () => {
  // This is the reference shape executionBridge now injects for a picked card.
  const injected = {
    type: 'image',
    role: 'first_frame',
    pathOrUrl: REMOTE_URL,
    sourceNodeId: 'node-slot-product-image',
    edgeId: 'feed-edge-node-slot-product-image-productImage',
    targetSlot: 'first_frame',
    mimeType: 'image/jpeg',
    sizeBytes: 2_048_576,
  };
  const submitted = resolveCanvasSubmission(h3Request([injected]), h3Catalog);
  const [ref] = submitted.references;
  assert.equal(ref.mimeType, 'image/jpeg');
  assert.equal(ref.sizeBytes, 2_048_576);
  assert.equal(ref.targetSlot, 'first_frame');
});

test('#2722 a remote pick WITHOUT metadata is still rejected, not silently accepted', () => {
  assert.throws(
    () => resolveCanvasSubmission(h3Request([{
      type: 'image',
      role: 'first_frame',
      pathOrUrl: REMOTE_URL,
      sourceNodeId: 'node-slot-product-image',
      edgeId: 'feed-edge-node-slot-product-image-productImage',
      targetSlot: 'first_frame',
    }]), h3Catalog),
    { code: 'metadata_required' },
  );
});
