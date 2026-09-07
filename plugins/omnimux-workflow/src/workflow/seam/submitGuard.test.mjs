import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOmnimuxSeamClient } from './omnimuxGateway.ts';
import { createMockGateway } from './mockGateway.ts';
import { resolveCanvasSubmission, resolveExecutorSubmission } from './submitGuard.ts';
import { buildContractView, buildUpstreamFingerprint, evaluateModelCompat } from '../../shared/validation/compatKernel.ts';
import { catalogFor, operation, slot } from './submissionFixtures.mjs';

const root = mkdtempSync(join(tmpdir(), 'submit-guard-469-'));
after(() => rmSync(root, { recursive: true, force: true }));
const first = slot('image', 'first_frame', 1, 1, 'start_frame');
const last = slot('image', 'last_frame', 1, 1, 'end_frame');
const frameOp = operation('first_last_frame', 'video', [first, last], false);
const catalog = catalogFor('video', 'seedance-2-0-fast', [
  frameOp, operation('text_to_video', 'video'),
  { ...operation('draft', 'video'), listed: false }, operation('wrong-output', 'image'),
]);
const reference = (role = 'first_frame', targetSlot = 'start_frame') => ({
  type: 'image', role, targetSlot, pathOrUrl: 'https://example.test/frame.png',
  sourceNodeId: 'frame-node', edgeId: `edge-${targetSlot}`, mimeType: 'image/png', sizeBytes: 100,
});
const request = (overrides = {}) => ({ capability: 'video', model: 'seedance-2-0-fast',
  operation: 'text_to_video', prompt: 'A real prompt', dest: join(root, 'out.mp4'), ...overrides });

for (const mode of ['live', 'mock']) {
  test(`${mode}: invalid model/operation, slots and assets are rejected before execution`, async () => {
    let seamCalls = 0;
    const gateway = mode === 'mock' ? createMockGateway({ minLatencyMs: 0, maxLatencyMs: 0, catalog: () => catalog })
      : createOmnimuxSeamClient({ getSeam: (name) => name === 'modelCatalog' ? { list: () => catalog }
        : { execute: async () => { seamCalls++; return { mode: 'submitted', taskId: 'forbidden' }; } } });
    const cases = [
      [{ model: 'unknown' }, 'model-not-allowed'],
      [{ operation: undefined }, 'operation-required'],
      [{ operation: '   ' }, 'operation-required'],
      [{ operation: 't2v' }, 'operation-not-allowed'],
      [{ operation: 'draft' }, 'operation-not-allowed'],
      [{ operation: 'wrong-output' }, 'operation-not-allowed'],
      [{ prompt: '  ' }, 'prompt_required'],
      [{ operation: 'first_last_frame', references: [reference()] }, 'min_unsatisfied'],
      [{ references: [reference()] }, 'role_conflict'],
      [{ operation: 'first_last_frame', references: [reference(), { ...reference('last_frame', 'end_frame'), pathOrUrl: 'blob:preview' }] }, 'input_unavailable'],
      [{ operation: 'first_last_frame', references: [reference(), { ...reference('last_frame', 'end_frame'), pathOrUrl: join(root, 'missing.png') }] }, 'input_unavailable'],
      [{ operation: 'first_last_frame', references: [reference(), { ...reference('last_frame', 'end_frame'), mimeType: 'audio/wav' }] }, 'mime_unsupported'],
      [{ operation: 'first_last_frame', references: [reference(), reference('first_frame', 'end_frame')] }, 'role_conflict'],
      [{ operation: 'first_last_frame', references: [reference(), reference(), reference('last_frame', 'end_frame')] }, 'slot_capacity'],
      [{ references: [{ type: 'document', pathOrUrl: 'https://example.test/a.pdf' }] }, 'operation_incompatible'],
    ];
    for (const [overrides, code] of cases) {
      await assert.rejects(gateway.submit(request(overrides)), { name: 'SeamGatewayError', code });
    }
    assert.equal(seamCalls, 0);
    assert.equal(existsSync(join(root, 'out.mp4')), false, 'rejected mock submits never create artifacts');
  });
}

test('partial frame input accepts connections but is not ready to submit', () => {
  const fingerprint = buildUpstreamFingerprint({ assets: [{ ...reference(), sourceNodeId: 'frame-node' }] });
  const verdict = evaluateModelCompat(buildContractView(catalog).models[0], fingerprint, { operationId: 'first_last_frame', outputType: 'video' });
  assert.equal(verdict.acceptsCurrentInputs, true);
  assert.equal(verdict.readyToSubmit, false);
  assert.throws(() => resolveCanvasSubmission(request({ operation: 'first_last_frame', references: [reference()] }), catalog), { code: 'min_unsatisfied' });
});

test('explicit valid frames need no prompt and resume ignores changed catalog or removed source', async () => {
  const local = join(root, 'input.png');
  writeFileSync(local, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const references = [reference(), reference('last_frame', 'end_frame')].map((ref) => ({ ...ref, pathOrUrl: local }));
  const captured = [];
  let catalogReads = 0;
  const gateway = createOmnimuxSeamClient({ getSeam: (name) => name === 'modelCatalog'
    ? { list() { assert.equal(catalogReads++, 0); return catalog; } }
    : name === 'videoGenerate' ? { execute: async (req) => {
      captured.push(req);
      return req.taskId ? { mode: 'live', type: 'video', url: 'https://example.test/done.mp4', mimeType: 'video/mp4', durationSec: 3 }
        : { mode: 'submitted', taskId: 'resume' };
    } } : undefined });
  const submitted = await gateway.submit(request({ operation: 'first_last_frame', prompt: '', references }));
  rmSync(local);
  const settled = await gateway.awaitTask(submitted.taskId, join(root, 'resume.mp4'));
  assert.equal(captured.length, 2);
  assert.deepEqual(captured[0].references, references.map((ref) => ({ ...ref, sizeBytes: 4 })));
  assert.deepEqual(captured[1], { taskId: 'resume', dest: join(root, 'resume.mp4') });
  assert.equal(settled.durationSec, 3);
  assert.equal(settled.type, 'video');
});

test('executor resolves unique/automatic operations but never silently replaces an explicit choice', () => {
  const textCatalog = catalogFor('text', 'gpt-5.5', [operation('chat', 'text'), operation('vision_chat', 'text', [slot('image', 'reference', 1)])]);
  const text = { capability: 'text', prompt: 'one word', dest: '/unused' };
  assert.equal(resolveExecutorSubmission(text, textCatalog).operation, 'chat');
  assert.equal(resolveExecutorSubmission({ ...text, references: [{ ...reference('reference'), targetSlot: undefined }] }, textCatalog).operation, 'vision_chat');
  assert.throws(() => resolveExecutorSubmission({ ...text, operation: 'chat', references: [reference()] }, textCatalog), { code: 'role_conflict' });
  const only = catalogFor('video', 'single', [operation('single_video', 'video')]);
  assert.equal(resolveExecutorSubmission({ capability: 'video', prompt: 'go', dest: '/unused' }, only).operation, 'single_video');
  assert.throws(() => resolveExecutorSubmission(request({ operation: undefined }), catalog), /请选择生成方式/);
});

test('metadata constraints reject missing, oversized and overlong references in both gateways', async () => {
  const limited = catalogFor('video', 'seedance-2-0-fast', [operation('reference_video', 'video', [{
    ...slot('video', 'reference', 1), maxSizeMb: 1, minDurationSec: 1, maxDurationSec: 5, allowedMimes: ['video/mp4'],
  }])]);
  for (const mode of ['live', 'mock']) {
    let calls = 0;
    const gateway = mode === 'mock' ? createMockGateway({ catalog: () => limited })
      : createOmnimuxSeamClient({ getSeam: (name) => name === 'modelCatalog' ? { list: () => limited }
        : { execute: async () => { calls++; } } });
    const ref = { type: 'video', role: 'reference', pathOrUrl: 'https://example.test/in.mp4', mimeType: 'video/mp4', sizeBytes: 10, durationSec: 2 };
    for (const [patch, code] of [[{ sizeBytes: undefined }, 'metadata_required'], [{ durationSec: undefined }, 'metadata_required'],
      [{ sizeBytes: 2 * 1024 * 1024 }, 'size_exceeded'], [{ durationSec: 6 }, 'duration_exceeded']]) {
      await assert.rejects(gateway.submit(request({ operation: 'reference_video', references: [{ ...ref, ...patch }] })), { code });
    }
    assert.equal(calls, 0);
  }
});

test('invalid text output is rejected before creating a text file', async () => {
  const textCatalog = catalogFor('text', 'gpt-5.5', [operation('chat', 'text')]);
  const gateway = createOmnimuxSeamClient({ getSeam: (name) => name === 'modelCatalog' ? { list: () => textCatalog }
    : name === 'textComplete' ? { execute: async () => ({ type: 'image', url: 'https://example.test/wrong.png' }) } : undefined });
  const submitted = await gateway.submit({ capability: 'text', operation: 'chat', prompt: 'go', dest: join(root, 'text.txt') });
  await assert.rejects(gateway.awaitTask(submitted.taskId, join(root, 'text.txt')), { code: 'omnimux-invalid-response' });
  assert.equal(existsSync(join(root, 'text.txt')), false);
});
