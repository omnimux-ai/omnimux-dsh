/**
 * #3289 public seams: planDirectorOutput / rollbackDirectorOutput.
 * New test authorization: DIRECTOR-3289-OUTPUT-PLAN-TEST, exact absolute path
 * registered in both task and product-root .tmp/anti-cheat-exemptions.json.
 * Pure graph/shared material projection evidence only; no UI/live proof.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planDirectorOutput, rollbackDirectorOutput } from './directorOutputPlan.ts';
import { readNodeInputSource } from '../../shared/graph/nodeInputSource.ts';
import { getNodeOutputInfo } from '../../shared/graph/connectionConfig.ts';
import { resolveNodeKind } from '../../shared/graph/materialNode.ts';

const source = { id: 'director-a', type: 'director', position: { x: 100, y: 200 }, data: { directorRevision: 7, directorSceneId: 'scene-a' } };
const image = { assetId: 'asset-image-1', storageKey: 'artifacts/director/workspace-a/director-a/image.png', url: '/omnimux-workflow/api/workspaces/workspace-a/file?rel=image.png', mimeType: 'image/png', bytes: 12345, width: 1920, height: 1080 };
const video = { assetId: 'asset-video-1', storageKey: 'artifacts/director/workspace-a/director-a/video.webm', url: '/omnimux-workflow/api/workspaces/workspace-a/file?rel=video.webm', mimeType: 'video/webm', bytes: 56789, width: 1920, height: 1080, durationSec: 5 };
function input(overrides = {}) {
  return { nodes: [source], sourceNodeId: source.id, sourceRevision: 7, sceneId: 'scene-a', shotId: 'shot-a', resources: { image, video }, ...overrides };
}

test('historical screenshot keeps its original capture revision separate from current projection', () => {
  const args = input({ resources: { image: { ...image, confirmed: true, capturedSource: { sceneId: 'scene-a', shotId: 'shot-a', revision: 3 } } } });
  const before = structuredClone(args);
  const plan = planDirectorOutput(args);
  const output = plan.nodes.find(node => node.id === plan.outputNodeIds.image);
  assert.deepEqual({ sceneId: output.data.directorCaptureSceneId, shotId: output.data.directorCaptureShotId, revision: output.data.directorCaptureRevision }, { sceneId: 'scene-a', shotId: 'shot-a', revision: 3 });
  assert.deepEqual({ nodeId: output.data.directorSourceNodeId, sceneId: output.data.directorSourceSceneId, shotId: output.data.directorSourceShotId, revision: output.data.directorSourceRevision }, { nodeId: 'director-a', sceneId: 'scene-a', shotId: 'shot-a', revision: 7 });
  assert.equal(output.data.metadataProvenance, 'media-inspector');
  assert.equal(readNodeInputSource(output).outputId, 'asset-image-1');
  assert.equal(output.data.fileSize, 12345);
  assert.deepEqual(output.data.dimensions, { width: 1920, height: 1080 });
  assert.equal(plan.nodes[0], source);
  assert.deepEqual(args, before);
});

test('capture source refuses future, cross-scene, cross-shot and malformed provenance atomically', () => {
  const valid = { sceneId: 'scene-a', shotId: 'shot-a', revision: 3 };
  for (const capturedSource of [
    { ...valid, revision: 8 }, { ...valid, revision: 0 }, { ...valid, revision: -1 }, { ...valid, revision: 1.5 },
    { ...valid, revision: NaN }, { ...valid, revision: Infinity }, { ...valid, revision: '3' },
    { ...valid, sceneId: 'other-scene' }, { ...valid, shotId: 'other-shot' },
    { ...valid, sceneId: 'scene-a\u0000' }, { ...valid, shotId: 'https://foreign/shot' },
    { ...valid, time: NaN }, { ...valid, time: Infinity }, { ...valid, time: -1 }, { ...valid, time: '1' },
    null, [], {},
  ]) {
    const args = input({ resources: { image, video: { ...video, capturedSource } } });
    const before = structuredClone(args);
    assert.throws(() => planDirectorOutput(args), 'invalid second resource must reject the entire plan');
    assert.deepEqual(args, before);
  }
  for (const capturedSource of [{ ...valid, revision: 7 }, { ...valid, time: 0 }, { ...valid, time: 1.25 }]) {
    const plan = planDirectorOutput(input({ resources: { image: { ...image, capturedSource } } }));
    assert.equal(plan.nodes[1].data.directorCaptureRevision, capturedSource.revision);
  }
});

test('unknown legacy screenshots and fresh exports never inherit or invent capture source', () => {
  const captured = { sceneId: 'scene-a', shotId: 'shot-a', revision: 3 };
  const first = planDirectorOutput(input({ resources: { image: { ...image, confirmed: true, capturedSource: captured } } }));
  const old = { ...first.nodes[1], selected: true, position: { x: 800, y: 900 }, data: { ...first.nodes[1].data, userNote: 'keep', isMissing: true, fileCorrupted: true } };
  const args = input({ nodes: [source, old], resources: { image } });
  const before = structuredClone(args);
  const refreshed = planDirectorOutput(args);
  const output = refreshed.nodes[1];
  for (const key of ['directorCaptureSceneId', 'directorCaptureShotId', 'directorCaptureRevision', 'metadataProvenance']) assert.equal(Object.hasOwn(output.data, key), false, key);
  assert.equal(output.data.directorSourceRevision, 7);
  assert.equal(output.data.userNote, 'keep');
  assert.equal(output.selected, true);
  assert.deepEqual(output.position, { x: 800, y: 900 });
  assert.equal(readNodeInputSource(output).availability, 'ready');
  assert.deepEqual(args, before, 'old missing flags and input snapshots remain untouched');
  for (const resource of [image, { ...image, capturedSource: undefined }, { ...image, confirmed: true }]) {
    const exported = planDirectorOutput(input({ resources: { image: resource } })).nodes[1];
    for (const key of ['directorCaptureSceneId', 'directorCaptureShotId', 'directorCaptureRevision']) assert.equal(Object.hasOwn(exported.data, key), false, key);
  }
});

test('source identities and managed resource URIs reject controls, traversal and foreign addresses', () => {
  for (const identity of ['scene-a\n', 'scene-a\u0000', 'https://foreign/scene', '../scene', 'scene%2Fa', 'a'.repeat(121)]) {
    const node = { ...source, data: { ...source.data, directorSceneId: identity } };
    const args = input({ nodes: [node], sceneId: identity, resources: { image: { ...image, capturedSource: { sceneId: identity, shotId: 'shot-a', revision: 3 } } } });
    assert.throws(() => planDirectorOutput(args));
  }
  for (const patch of [
    { sourceNodeId: 'director-a\n', nodes: [{ ...source, id: 'director-a\n' }] }, { shotId: 'https://foreign/shot' },
    { resources: { image: { ...image, assetId: 'asset\u0000' } } },
    ...['https://foreign/image.png', '//foreign/image.png', '/omnimux-workflow/../outside.png', '/omnimux-workflow/%2e%2e/outside.png', '/omnimux-workflow/image.png\n', '/omnimux-workflow/%00image.png', '/omnimux-workflow/%5cimage.png', '/omnimux-workflow/%zz'].map(url => ({ resources: { image: { ...image, url } } })),
    ...['artifacts/image.png?external=1', 'artifacts/%2e%2e/image.png', 'artifacts/image.png\u0000'].map(storageKey => ({ resources: { image: { ...image, storageKey } } })),
  ]) {
    const args = input(patch), before = structuredClone(args);
    assert.throws(() => planDirectorOutput(args));
    assert.deepEqual(args, before);
  }
});

test('repeat history projection retains capture identity and preserves user layout, edges and source', () => {
  const resource = { ...image, confirmed: true, capturedSource: { sceneId: 'scene-a', shotId: 'shot-a', revision: 3, time: 1.25 } };
  const first = planDirectorOutput(input({ resources: { image: resource } }));
  const edited = { ...first.nodes[1], selected: true, position: { x: 800, y: 900 }, data: { ...first.nodes[1].data, label: '原截图', userNote: 'keep' } };
  const advanced = { ...source, data: { ...source.data, directorRevision: 9 } };
  const args = input({ nodes: [advanced, edited], sourceRevision: 9, resources: { image: { ...resource, capturedSource: { ...resource.capturedSource, time: 2 } } } });
  const before = structuredClone(args);
  const edges = [{ id: 'edge-history', source: edited.id, target: 'consumer', targetHandle: 'in' }], originalEdges = structuredClone(edges);
  const plan = planDirectorOutput(args), output = plan.nodes[1];
  assert.equal(plan.outputNodeIds.image, first.outputNodeIds.image);
  assert.equal(output.data.directorCaptureRevision, 3);
  assert.equal(output.data.directorSourceRevision, 9);
  assert.equal(output.data.directorCaptureSceneId, 'scene-a');
  assert.equal(output.data.directorCaptureShotId, 'shot-a');
  assert.equal(output.data.assetId, 'asset-image-1');
  assert.equal(output.data.label, '原截图');
  assert.equal(output.data.userNote, 'keep');
  assert.deepEqual(output.position, { x: 800, y: 900 });
  assert.equal(output.selected, true);
  assert.equal(plan.nodes[0], advanced);
  assert.deepEqual(args, before);
  assert.deepEqual(edges, originalEdges);
  assert.equal(Object.hasOwn(plan, 'edges'), false);
});

test('capture and projection fingerprints roll back only owned unchanged versions', () => {
  const first = planDirectorOutput(input({ resources: { image: { ...image, capturedSource: { sceneId: 'scene-a', shotId: 'shot-a', revision: 3 } } } }));
  const nextSource = { ...source, data: { ...source.data, directorRevision: 8 } };
  const plan = planDirectorOutput(input({ nodes: [nextSource, first.nodes[1]], sourceRevision: 8, resources: { image: { ...image, capturedSource: { sceneId: 'scene-a', shotId: 'shot-a', revision: 4 } } } }));
  const sourceEdit = { ...nextSource, position: { x: 900, y: 700 }, data: { ...nextSource.data, title: 'concurrent source edit' } };
  const current = [sourceEdit, plan.nodes[1]], before = structuredClone(current);
  const restored = rollbackDirectorOutput(current, first.nodes, plan);
  assert.deepEqual(restored.conflicts, []);
  assert.equal(restored.nodes[0], sourceEdit);
  assert.equal(restored.nodes[1], first.nodes[1]);
  assert.equal(restored.nodes[1].data.directorCaptureRevision, 3);
  assert.equal(restored.nodes[1].data.directorSourceRevision, 7);
  assert.deepEqual(current, before);
  for (const patch of [
    { position: { x: 801, y: 901 } }, { data: { ...plan.nodes[1].data, userNote: 'concurrent output edit' } },
    { data: { ...plan.nodes[1].data, directorCaptureRevision: 5 } }, { data: { ...plan.nodes[1].data, directorSourceRevision: 9 } },
  ]) {
    const edited = { ...plan.nodes[1], ...patch };
    const result = rollbackDirectorOutput([sourceEdit, edited], first.nodes, plan);
    assert.equal(result.nodes[0], sourceEdit);
    assert.equal(result.nodes[1], edited);
    assert.deepEqual(result.conflicts, [{ nodeId: edited.id, reason: 'changed' }]);
  }
});

test('confirmed resources become import nodes consumable by existing material projection', () => {
  const args = input();
  const before = structuredClone(args);
  const plan = planDirectorOutput(args);
  assert.deepEqual(args, before, 'planning must not mutate its graph or resources');
  assert.equal(plan.nodes.length, 3);
  assert.equal(plan.nodes[0], source);
  for (const [kind, resource] of [['image', image], ['video', video]]) {
    const node = plan.nodes.find(item => item.id === plan.outputNodeIds[kind]);
    assert.match(node.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/, 'the existing public receipt must accept the output identity');
    assert.equal(node.type, 'material');
    assert.equal(resolveNodeKind(node.data), 'import');
    assert.equal(node.data.selectedTool, 'import');
    assert.equal(node.data.status, 'completed');
    assert.equal(node.data.directorSourceNodeId, 'director-a');
    assert.equal(node.data.directorSourceRevision, 7);
    assert.equal(node.data.directorSourceSceneId, 'scene-a');
    assert.equal(node.data.directorSourceShotId, 'shot-a');
    assert.deepEqual(node.data.dimensions, { width: 1920, height: 1080 });
    assert.equal(node.data.fileSize, resource.bytes);
    assert.equal(node.data.duration, kind === 'video' ? 5 : null);
    assert.deepEqual(getNodeOutputInfo(node), { nodeType: 'material', materialType: kind, hasOutput: true });
    const projected = readNodeInputSource(node);
    assert.equal(projected.availability, 'ready');
    assert.equal(projected.outputId, resource.assetId);
    assert.deepEqual(projected.output.mediaAssets, [{ type: kind, url: resource.url, relativePath: resource.storageKey, assetId: resource.assetId, mimeType: resource.mimeType, sizeBytes: resource.bytes, ...(kind === 'video' ? { durationSec: 5 } : {}) }]);
  }
  assert.deepEqual(plan.nodes[1].position, { x: 520, y: 200 });
  assert.deepEqual(plan.nodes[2].position, { x: 520, y: 550 });
});

test('different scenes and shots cannot replace each other; same shot retains layout, selection and edges', () => {
  const first = planDirectorOutput(input());
  const oldImage = first.nodes.find(node => node.id === first.outputNodeIds.image);
  const edited = { ...oldImage, selected: true, position: { x: 888, y: 999 }, parentId: 'group-a', width: 321, data: { ...oldImage.data, label: '我的构图', userNote: 'keep' } };
  const nodes = first.nodes.map(node => node.id === edited.id ? edited : node);
  const edges = [{ id: 'edge-a', source: edited.id, target: 'consumer-a', sourceHandle: 'out', targetHandle: 'in' }];
  const state = { nodes, edges };
  const repeated = planDirectorOutput(input({ nodes: state.nodes, resources: { image: { ...image, assetId: 'asset-image-2', bytes: 22222, storageKey: 'artifacts/director/workspace-a/director-a/image-2.png' } } }));
  const updated = repeated.nodes.find(node => node.id === edited.id);
  assert.equal(repeated.outputNodeIds.image, first.outputNodeIds.image);
  assert.equal(repeated.nodes.length, 3);
  assert.deepEqual(updated.position, { x: 888, y: 999 });
  assert.equal(updated.selected, true);
  assert.equal(updated.parentId, 'group-a');
  assert.equal(updated.width, 321);
  assert.equal(updated.data.label, '我的构图');
  assert.equal(updated.data.userNote, 'keep');
  assert.equal(readNodeInputSource(updated).outputId, 'asset-image-2', 'old mediaAssets must not mask the new asset');
  assert.deepEqual(state.edges, edges);
  assert.equal(Object.hasOwn(repeated, 'edges'), false, 'plan never replaces edges');
  const otherShot = planDirectorOutput(input({ nodes: repeated.nodes, shotId: 'shot-b', resources: { image } }));
  assert.notEqual(otherShot.outputNodeIds.image, first.outputNodeIds.image);
  assert.equal(otherShot.nodes.find(node => node.id === edited.id), updated);
  const newSceneSource = { ...source, data: { ...source.data, directorSceneId: 'scene-b' } };
  const otherScene = planDirectorOutput(input({ nodes: otherShot.nodes.map(node => node.id === source.id ? newSceneSource : node), sceneId: 'scene-b', resources: { image } }));
  assert.notEqual(otherScene.outputNodeIds.image, otherShot.outputNodeIds.image);
  assert.equal(otherScene.nodes.length, 5);
});

test('stale source identity/revision and unconfirmed metadata refuse an output plan without mutating nodes', () => {
  for (const patch of [
    { nodes: [] },
    { nodes: [{ ...source, type: 'material' }] },
    { sourceRevision: 6 }, { sceneId: 'other-scene' }, { sourceRevision: NaN }, { shotId: '' },
    { resources: {} },
    { resources: { image: { ...image, assetId: '' } } },
    { resources: { image: { ...image, storageKey: '../outside.png' } } },
    { resources: { image: { ...image, url: 'blob:expired' } } },
    { resources: { image: { ...image, mimeType: 'video/webm' } } },
    { resources: { image: { ...image, bytes: 0 } } },
    { resources: { image: { ...image, width: NaN } } },
    { resources: { video: { ...video, durationSec: undefined } } },
    { resources: { image, video: { ...video, height: -1 } } },
  ]) {
    const args = input(patch);
    const original = structuredClone(args);
    assert.throws(() => planDirectorOutput(args));
    assert.deepEqual(args, original);
  }
  const initial = planDirectorOutput(input({ resources: { image } }));
  const impersonator = { ...initial.nodes[1], data: { ...initial.nodes[1].data, directorSourceShotId: 'another-shot' } };
  assert.throws(() => planDirectorOutput(input({ nodes: [source, impersonator], resources: { image } })), 'an occupied output identity must not overwrite a foreign node');
});

test('failed output rolls back only unchanged owned versions and retains concurrent graph changes', () => {
  const oldPlan = planDirectorOutput(input({ resources: { image } }));
  const previous = oldPlan.nodes;
  const plan = planDirectorOutput(input({ nodes: previous, resources: { image: { ...image, assetId: 'new-image', bytes: 22222 }, video } }));
  const changedSource = { ...source, data: { ...source.data, title: 'concurrent source edit' } };
  const unrelated = { id: 'unrelated', type: 'material', position: { x: 0, y: 0 }, data: { content: 'concurrent insert' } };
  const current = [...plan.nodes.map(node => node.id === source.id ? changedSource : node), unrelated];
  const before = structuredClone(current);
  const result = rollbackDirectorOutput(current, previous, plan);
  assert.deepEqual(current, before);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(new Set(result.rolledBackNodeIds), new Set([plan.outputNodeIds.image, plan.outputNodeIds.video]));
  assert.equal(result.nodes.find(node => node.id === source.id), changedSource);
  assert.equal(result.nodes.find(node => node.id === unrelated.id), unrelated);
  assert.equal(result.nodes.find(node => node.id === plan.outputNodeIds.image), previous[1]);
  assert.equal(result.nodes.some(node => node.id === plan.outputNodeIds.video), false);
});

test('rollback reports edited/replaced/deleted outputs without overwriting or resurrecting them', () => {
  const old = planDirectorOutput(input());
  const plan = planDirectorOutput(input({ nodes: old.nodes, resources: { image: { ...image, assetId: 'new-image' }, video: { ...video, assetId: 'new-video' } } }));
  for (const patch of [{ selected: true }, { position: { x: 5000, y: 6000 } }, { data: { ...plan.nodes[1].data, label: 'user edit' } }, { data: { ...plan.nodes[1].data, assetId: 'concurrent-asset' } }]) {
    const edited = { ...plan.nodes[1], ...patch };
    const current = plan.nodes.map(node => node.id === edited.id ? edited : node);
    const result = rollbackDirectorOutput(current, old.nodes, plan);
    assert.equal(result.nodes.find(node => node.id === edited.id), edited);
    assert.deepEqual(result.conflicts, [{ nodeId: edited.id, reason: 'changed' }]);
    assert.equal(result.nodes.find(node => node.id === old.nodes[2].id), old.nodes[2]);
  }
  const deleted = rollbackDirectorOutput(plan.nodes.filter(node => node.id !== plan.outputNodeIds.image), old.nodes, plan);
  assert.deepEqual(deleted.conflicts, [{ nodeId: plan.outputNodeIds.image, reason: 'missing' }]);
  assert.equal(deleted.nodes.some(node => node.id === plan.outputNodeIds.image), false);
  const invalidPrevious = old.nodes.map(node => node.id === old.outputNodeIds.image ? { ...node, data: { ...node.data, label: 'wrong previous snapshot' } } : node);
  const invalid = rollbackDirectorOutput(plan.nodes, invalidPrevious, plan);
  assert.deepEqual(invalid.conflicts, [{ nodeId: plan.outputNodeIds.image, reason: 'previous-mismatch' }]);
  assert.equal(invalid.nodes.find(node => node.id === plan.outputNodeIds.image), plan.nodes[1]);
});

test('re-export replaces stale media state while retaining user data and has deterministic visible plans', () => {
  const first = planDirectorOutput(input());
  const broken = { ...first.nodes[1], data: { ...first.nodes[1].data, isMissing: true, fileMissing: true, fileCorrupted: true, isOffline: true, probeStatus: 'missing', executionStatus: 'failed', errorMessage: 'old failure', realPath: '/old/local/path', userNote: 'retain' } };
  const plan = planDirectorOutput(input({ nodes: [source, broken], resources: { image } }));
  const node = plan.nodes[1];
  assert.equal(readNodeInputSource(node).availability, 'ready');
  assert.equal(node.data.userNote, 'retain');
  assert.equal(node.data.realPath, undefined);
  assert.equal(node.data.errorMessage, undefined);
  assert.deepEqual(planDirectorOutput(input()), planDirectorOutput(input()), 'shared factory random IDs must not escape the deterministic plan');
  assert.throws(() => planDirectorOutput(input({ nodes: [source, { ...first.nodes[1], data: { ...first.nodes[1].data, directorSourceRevision: 8 } }], resources: { image } })), 'never downgrade a newer owned output');
});

test('rollback of a new output leaves a user-edited new node intact', () => {
  const plan = planDirectorOutput(input());
  const edited = { ...plan.nodes[2], data: { ...plan.nodes[2].data, label: '保留用户视频' } };
  const result = rollbackDirectorOutput(plan.nodes.map(node => node.id === edited.id ? edited : node), [source], plan);
  assert.equal(result.nodes.find(node => node.id === edited.id), edited);
  assert.deepEqual(result.conflicts, [{ nodeId: edited.id, reason: 'changed' }]);
  assert.equal(result.nodes.some(node => node.id === plan.outputNodeIds.image), false);
});
