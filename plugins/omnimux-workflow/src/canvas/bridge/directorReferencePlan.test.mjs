import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDirectorReferenceImage } from './directorReferencePlan.ts';
import { planDirectorOutput, rollbackDirectorOutput } from './directorOutputPlan.ts';
import { directorFingerprint } from '../../shared/directorFingerprint.ts';
import { readNodeInputSource } from '../../shared/graph/nodeInputSource.ts';

const source = { id: 'director_1', type: 'director', position: { x: 10, y: 20 }, data: { directorRevision: 3, directorSceneId: 'scene_1' } };
const image = { assetId: 'asset_1', storageKey: 'artifacts/director/ws/director_1/image.png', url: '/omnimux-workflow/api/workspaces/ws/file?rel=artifacts%2Fdirector%2Fws%2Fdirector_1%2Fimage.png', mimeType: 'image/png', bytes: 400, width: 32, height: 32 };

function input(overrides = {}) {
  return { nodes: [structuredClone(source)], sourceNodeId: source.id, sceneId: 'scene_1', sourceRevision: 3, image: structuredClone(image), title: '参考图', ...overrides };
}

function reference(overrides = {}) {
  const result = planDirectorReferenceImage(input(overrides));
  return { result, node: result.nodes.find(item => item.id === result.nodeId) };
}

function otherImage() {
  const storageKey = 'assets/imported/other image.png';
  return { ...image, assetId: 'asset_2', storageKey, url: `/omnimux-workflow/api/workspaces/ws/file?rel=${encodeURIComponent(storageKey)}` };
}

function compensationPlan(result) {
  const node = result.nodes.find(item => item.id === result.nodeId);
  return { nodes: result.nodes, outputNodeIds: {}, changes: result.created ? [{ nodeId: node.id, previousFingerprint: null, fingerprint: directorFingerprint(node) }] : [] };
}

test('registered director reference becomes an ordinary image import node without another scene authority', () => {
  const result = planDirectorReferenceImage({ nodes: [source], sourceNodeId: source.id, sceneId: 'scene_1', sourceRevision: 3, image, title: '参考图' });
  assert.equal(result.created, true);
  const node = result.nodes.find(item => item.id === result.nodeId);
  assert.equal(node.type, 'material');
  assert.equal(node.data.materialType, 'image');
  assert.equal(node.data.nodeKind, 'import');
  assert.equal(node.data.assetId, image.assetId);
  assert.equal(node.data.relativePath, image.storageKey);
  assert.equal(source.data.scene, undefined);
});

test('shared input projection consumes the canonical registered image with and without workspace context', () => {
  const before = input();
  const snapshot = structuredClone(before);
  const { result, node } = reference(before);
  assert.deepEqual(before, snapshot);
  assert.notStrictEqual(result.nodes, before.nodes);
  assert.strictEqual(result.nodes[0], before.nodes[0]);
  assert.equal(node.data.selectedTool, 'import');
  assert.equal(node.data.status, 'completed');
  assert.deepEqual(node.position, { x: 430, y: 20 });
  assert.deepEqual(node.data.dimensions, { width: 32, height: 32 });
  assert.equal(node.data.directorReferenceSourceNodeId, source.id);
  assert.equal(node.data.directorReferenceSourceSceneId, 'scene_1');
  assert.equal(node.data.directorReferenceSourceRevision, 3);
  for (const workspace of [undefined, 'ws']) {
    const projected = readNodeInputSource(node, workspace);
    assert.equal(projected.availability, 'ready');
    assert.equal(projected.materialType, 'image');
    assert.equal(projected.outputId, image.assetId);
    assert.equal(projected.label, '参考图');
    assert.deepEqual(projected.output.mediaAssets, [{ type: 'image', url: image.url, relativePath: image.storageKey, assetId: image.assetId, mimeType: image.mimeType, sizeBytes: image.bytes }]);
  }
  for (const key of ['scene', 'directorSceneId', 'directorRevision', 'directorSourceNodeId', 'directorSourceSceneId', 'directorSourceShotId', 'directorCaptureSceneId', 'directorCaptureShotId', 'directorCaptureRevision']) {
    assert.equal(Object.hasOwn(node.data, key), false, key);
  }
});

for (const [name, overrides] of [
  ['missing source', { nodes: [] }],
  ['wrong source type', { nodes: [{ ...source, type: 'material' }] }],
  ['duplicate source identity', { nodes: [source, structuredClone(source)] }],
  ['stale revision request', { sourceRevision: 2 }],
  ['stale source revision mirror', { sourceRevision: 4 }],
  ['stale source scene mirror', { sceneId: 'scene_2' }],
  ['missing revision mirror', { nodes: [{ ...source, data: { directorSceneId: 'scene_1' } }] }],
  ['missing scene mirror', { nodes: [{ ...source, data: { directorRevision: 3 } }] }],
  ['zero revision', { sourceRevision: 0 }],
  ['fractional revision', { sourceRevision: 3.5 }],
  ['unsafe revision', { sourceRevision: Number.MAX_SAFE_INTEGER + 1 }],
  ['string revision', { sourceRevision: '3' }],
  ['unsafe source identity', { sourceNodeId: '../director_1', nodes: [{ ...source, id: '../director_1' }] }],
  ['unsafe scene identity', { sceneId: '../scene_1', nodes: [{ ...source, data: { ...source.data, directorSceneId: '../scene_1' } }] }],
  ['unsafe explicit reference identity', { referenceId: '../reference_1' }],
]) {
  test(`rejects ${name} without mutating the supplied graph`, () => {
    const request = input(overrides);
    const before = structuredClone(request);
    assert.throws(() => planDirectorReferenceImage(request), /参考图所属导演场景或修订已变化/);
    assert.deepEqual(request, before);
  });
}

for (const [name, patch] of [
  ['empty asset identity', { assetId: '' }],
  ['traversing asset identity', { assetId: '../asset_1' }],
  ['overlong asset identity', { assetId: 'a'.repeat(121) }],
  ['non-string asset identity', { assetId: 1 }],
  ['absolute storage path', { storageKey: '/tmp/image.png' }],
  ['unmanaged storage path', { storageKey: 'other/image.png' }],
  ['parent storage segment', { storageKey: 'artifacts/../image.png' }],
  ['current storage segment', { storageKey: 'artifacts/./image.png' }],
  ['empty storage segment', { storageKey: 'artifacts//image.png' }],
  ['encoded storage traversal', { storageKey: 'artifacts/%2e%2e/image.png' }],
  ['backslash storage path', { storageKey: 'artifacts/dir\\image.png' }],
  ['external URL', { url: 'https://example.invalid/image.png' }],
  ['blob URL', { url: 'blob:reference-image' }],
  ['data URL', { url: 'data:image/png;base64,AAAA' }],
  ['wrong managed path', { url: '/omnimux-workflow/api/workspaces/ws/file?rel=artifacts%2Fother.png' }],
  ['unencoded managed path', { url: `/omnimux-workflow/api/workspaces/ws/file?rel=${image.storageKey}` }],
  ['extra managed query', { url: `${image.url}&extra=1` }],
  ['managed URL fragment', { url: `${image.url}#image` }],
  ['non-string URL', { url: null }],
  ['unsupported image MIME', { mimeType: 'image/gif' }],
  ['non-image MIME', { mimeType: 'video/mp4' }],
  ['noncanonical MIME', { mimeType: 'IMAGE/PNG' }],
  ['missing MIME', { mimeType: undefined }],
]) {
  test(`rejects resource with ${name}`, () => {
    const request = input({ image: { ...image, ...patch } });
    const before = structuredClone(request);
    assert.throws(() => planDirectorReferenceImage(request), /参考图素材身份或元信息尚未确认/);
    assert.deepEqual(request, before);
  });
}

for (const field of ['bytes', 'width', 'height']) {
  for (const [name, value] of [['zero', 0], ['negative', -1], ['fractional', 1.5], ['infinite', Infinity], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1], ['string', '32']]) {
    test(`rejects ${name} ${field}`, () => {
      assert.throws(() => planDirectorReferenceImage(input({ image: { ...image, [field]: value } })), /参考图素材身份或元信息尚未确认/);
    });
  }
}

test('rejects a missing resource and a non-string title', () => {
  assert.throws(() => planDirectorReferenceImage(input({ image: null })), /参考图素材身份或元信息尚未确认/);
  assert.throws(() => planDirectorReferenceImage(input({ title: null })), /参考图素材身份或元信息尚未确认/);
});

test('reuses the original reference object without losing user title position selection or custom data', () => {
  const { node } = reference({ referenceId: 'reference_1' });
  const custom = { notes: ['用户备注'], flags: { pinned: true } };
  const existing = { ...node, position: { x: -120, y: 987 }, selected: true, data: { ...node.data, label: '用户改名', custom } };
  const request = input({ nodes: [source, existing], title: '不应覆盖的标题', referenceId: 'reference_1' });
  const before = structuredClone(request);
  const result = planDirectorReferenceImage(request);
  assert.equal(result.created, false);
  assert.equal(result.nodeId, existing.id);
  assert.equal(result.nodes.length, 2);
  assert.notStrictEqual(result.nodes, request.nodes);
  assert.strictEqual(result.nodes[1], existing);
  assert.strictEqual(result.nodes[1].data, existing.data);
  assert.strictEqual(result.nodes[1].position, existing.position);
  assert.strictEqual(result.nodes[1].data.custom, custom);
  assert.deepEqual(request, before);
});

test('reuses an unchanged resource from the same scene after the source revision advances', () => {
  const { node } = reference();
  const newerSource = { ...source, data: { ...source.data, directorRevision: 4 } };
  const result = planDirectorReferenceImage(input({ nodes: [newerSource, node], sourceRevision: 4 }));
  assert.equal(result.created, false);
  assert.strictEqual(result.nodes[1], node);
  assert.equal(node.data.directorReferenceSourceRevision, 3);
});

for (const [name, patch] of [
  ['future reference revision', { directorReferenceSourceRevision: 4 }],
  ['invalid reference revision', { directorReferenceSourceRevision: 0 }],
  ['changed resource path', { relativePath: 'artifacts/other.png' }],
  ['changed resource identity', { assetId: 'asset_other' }],
  ['changed media URL', { mediaUrl: '/omnimux-workflow/other.png' }],
  ['changed MIME', { mimeType: 'image/jpeg' }],
  ['changed bytes', { sizeBytes: 401 }],
  ['changed dimensions', { dimensions: { width: 64, height: 32 } }],
  ['non-import tool', { selectedTool: 'generate' }],
  ['non-import kind', { nodeKind: 'generate' }],
  ['incomplete reference', { status: 'empty' }],
  ['missing file', { fileMissing: true }],
  ['multiple media assets', { mediaAssets: [ { type: 'image', url: image.url }, { type: 'image', url: image.url } ] }],
  ['wrong projected media identity', { mediaAssets: [{ type: 'image', url: image.url, relativePath: image.storageKey, assetId: 'asset_other', mimeType: image.mimeType, sizeBytes: image.bytes }] }],
  ['shot output provenance', { directorSourceShotId: 'shot_1' }],
  ['capture provenance', { directorCaptureRevision: 3 }],
]) {
  test(`rejects reuse with ${name}`, () => {
    const { node } = reference();
    const changed = { ...node, data: { ...node.data, ...patch } };
    const before = structuredClone(changed);
    assert.throws(() => planDirectorReferenceImage(input({ nodes: [source, changed] })), /参考图画布引用来源或素材已变化/);
    assert.deepEqual(changed, before);
  });
}

test('creates a separate node for a different resource and preserves the previous reference', () => {
  const { node } = reference();
  const result = planDirectorReferenceImage(input({ nodes: [source, node], image: otherImage() }));
  assert.equal(result.created, true);
  assert.notEqual(result.nodeId, node.id);
  assert.equal(result.nodes.length, 3);
  assert.strictEqual(result.nodes[1], node);
  assert.equal(result.nodes[2].data.assetId, 'asset_2');
});

test('creates a separate node for the same resource from a different director', () => {
  const { node } = reference();
  const secondSource = { ...structuredClone(source), id: 'director_2' };
  const result = planDirectorReferenceImage(input({ nodes: [source, secondSource, node], sourceNodeId: secondSource.id }));
  assert.equal(result.created, true);
  assert.notEqual(result.nodeId, node.id);
  assert.strictEqual(result.nodes[2], node);
  assert.equal(result.nodes[3].data.directorReferenceSourceNodeId, secondSource.id);
});

test('creates a separate node for the same resource after the director changes scenes', () => {
  const { node } = reference();
  const secondScene = { ...source, data: { ...source.data, directorSceneId: 'scene_2' } };
  const result = planDirectorReferenceImage(input({ nodes: [secondScene, node], sceneId: 'scene_2' }));
  assert.equal(result.created, true);
  assert.notEqual(result.nodeId, node.id);
  assert.strictEqual(result.nodes[1], node);
  assert.equal(result.nodes[2].data.directorReferenceSourceSceneId, 'scene_2');
});

test('never reuses an actual shot output as a reference even when the resource is identical', () => {
  const output = planDirectorOutput({ nodes: [source], sourceNodeId: source.id, sourceRevision: 3, sceneId: 'scene_1', shotId: 'shot_1', resources: { image } });
  const shotNode = output.nodes.find(node => node.id === output.outputNodeIds.image);
  const before = structuredClone(shotNode);
  const result = planDirectorReferenceImage(input({ nodes: output.nodes }));
  assert.equal(result.created, true);
  assert.notEqual(result.nodeId, shotNode.id);
  assert.equal(result.nodes.length, 3);
  assert.strictEqual(result.nodes[1], shotNode);
  assert.deepEqual(shotNode, before);
  assert.equal(result.nodes[2].data.directorSourceShotId, undefined);
});

for (const [name, overrides] of [
  ['different resource', { image: otherImage() }],
  ['different source', { sourceNodeId: 'director_2' }],
  ['different scene', { sceneId: 'scene_2' }],
]) {
  test(`rejects an occupied explicit reference identity for a ${name}`, () => {
    const { node } = reference({ referenceId: 'reference_1' });
    const currentSource = { ...structuredClone(source), id: overrides.sourceNodeId ?? source.id, data: { ...source.data, directorSceneId: overrides.sceneId ?? 'scene_1' } };
    const request = input({ nodes: [currentSource, node], referenceId: 'reference_1', ...overrides });
    const before = structuredClone(request);
    assert.throws(() => planDirectorReferenceImage(request), /参考图画布引用来源或素材已变化/);
    assert.deepEqual(request, before);
  });
}

test('rejects multiple references claiming the same explicit identity', () => {
  const { node } = reference({ referenceId: 'reference_1' });
  const duplicate = { ...structuredClone(node), id: 'duplicate_reference' };
  assert.throws(() => planDirectorReferenceImage(input({ nodes: [source, node, duplicate], referenceId: 'reference_1' })), /参考图存在多个冲突的画布引用/);
});

test('rejects ambiguous same-resource references without an explicit identity', () => {
  const { node } = reference();
  const duplicate = { ...structuredClone(node), id: 'duplicate_reference' };
  assert.throws(() => planDirectorReferenceImage(input({ nodes: [source, node, duplicate] })), /参考图存在多个冲突的画布引用/);
});

test('existing compensation removes only the unchanged newly created reference', () => {
  const previous = [structuredClone(source)];
  const result = planDirectorReferenceImage(input({ nodes: previous }));
  const plan = compensationPlan(result);
  const concurrentSource = { ...previous[0], selected: true };
  const unrelated = { id: 'unrelated', type: 'material', position: { x: 1, y: 1 }, data: { label: '并发新增' } };
  const current = [concurrentSource, result.nodes[1], unrelated];
  const before = structuredClone(current);
  const rolledBack = rollbackDirectorOutput(current, previous, plan);
  assert.deepEqual(rolledBack.rolledBackNodeIds, [result.nodeId]);
  assert.deepEqual(rolledBack.conflicts, []);
  assert.deepEqual(rolledBack.nodes, [concurrentSource, unrelated]);
  assert.strictEqual(rolledBack.nodes[0], concurrentSource);
  assert.strictEqual(rolledBack.nodes[1], unrelated);
  assert.deepEqual(current, before);
});

for (const [name, editNode] of [
  ['title', node => ({ ...node, data: { ...node.data, label: '用户并发改名' } })],
  ['position', node => ({ ...node, position: { x: 999, y: -400 } })],
  ['selection', node => ({ ...node, selected: true })],
  ['custom data', node => ({ ...node, data: { ...node.data, userNotes: '保留我' } })],
]) {
  test(`compensation retains a concurrently edited ${name} and reports a changed conflict`, () => {
    const previous = [structuredClone(source)];
    const result = planDirectorReferenceImage(input({ nodes: previous }));
    const plan = compensationPlan(result);
    const edited = editNode(result.nodes[1]);
    assert.notEqual(directorFingerprint(edited), plan.changes[0].fingerprint);
    const current = [previous[0], edited];
    const before = structuredClone(current);
    const rolledBack = rollbackDirectorOutput(current, previous, plan);
    assert.deepEqual(rolledBack.rolledBackNodeIds, []);
    assert.deepEqual(rolledBack.conflicts, [{ nodeId: edited.id, reason: 'changed' }]);
    assert.strictEqual(rolledBack.nodes[1], edited);
    assert.deepEqual(current, before);
  });
}

test('compensation independently removes an unchanged addition while preserving an edited addition', () => {
  const previous = [structuredClone(source)];
  const first = planDirectorReferenceImage(input({ nodes: previous }));
  const second = planDirectorReferenceImage(input({ nodes: first.nodes, image: otherImage() }));
  const plan = { nodes: second.nodes, outputNodeIds: {}, changes: [...compensationPlan(first).changes, ...compensationPlan(second).changes] };
  const edited = { ...second.nodes[2], data: { ...second.nodes[2].data, label: '保留第二张' } };
  const result = rollbackDirectorOutput([previous[0], first.nodes[1], edited], previous, plan);
  assert.deepEqual(result.rolledBackNodeIds, [first.nodeId]);
  assert.deepEqual(result.conflicts, [{ nodeId: second.nodeId, reason: 'changed' }]);
  assert.deepEqual(result.nodes, [previous[0], edited]);
  assert.strictEqual(result.nodes[1], edited);
});

test('a reused reference has no compensation changes and is never deleted', () => {
  const { node } = reference();
  const previous = [source, node];
  const reused = planDirectorReferenceImage(input({ nodes: previous }));
  assert.equal(reused.created, false);
  const plan = compensationPlan(reused);
  assert.deepEqual(plan.changes, []);
  const result = rollbackDirectorOutput(reused.nodes, previous, plan);
  assert.deepEqual(result.rolledBackNodeIds, []);
  assert.deepEqual(result.conflicts, []);
  assert.strictEqual(result.nodes[1], node);
});
