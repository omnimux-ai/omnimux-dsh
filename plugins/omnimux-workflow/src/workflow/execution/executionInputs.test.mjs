import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInitialOutputs } from './executionInputs.ts';

test('waiting and unavailable sources do not become synthetic text outputs', () => {
  const nodes = [
    { id: 'missing', type: 'material', data: { materialType: 'image', mediaUrl: 'https://example.test/a.png', isMissing: true } },
    { id: 'waiting', type: 'material', data: { materialType: 'video', status: 'loading' } },
    { id: 'text', type: 'material', data: { materialType: 'text', content: 'current', prompt: 'old instruction' } },
    { id: 'scheduled', type: 'material', data: { materialType: 'text', content: 'old output' } },
  ];
  const workspace = { id: 'ws_input', nodes, edges: nodes.map((node) => ({ source: node.id, target: 'target' })) };
  assert.deepEqual(buildInitialOutputs(workspace, new Set(['target', 'scheduled'])), { text: { text: 'current' } });
});

test('project media is resolved before execution and relative paths never become gateway URLs', () => {
  const workspace = { id: 'ws_input', nodes: [{ id: 'image', type: 'material', data: { nodeKind: 'import', materialType: 'image', relativePath: 'assets/image.png' } }], edges: [{ source: 'image', target: 'target' }] };
  const options = { mediaDir: '/tmp', resolveProjectFile: (id, relativePath) => { assert.equal(id, 'ws_input'); assert.equal(relativePath, 'assets/image.png'); return '/tmp/project/image.png'; } };
  const output = buildInitialOutputs(workspace, new Set(['target']), options);
  assert.equal(output.image.mediaAssets[0].url, '/tmp/project/image.png');
  assert.equal(output.image.mediaAssets[0].path, '/tmp/project/image.png');
  assert.throws(() => buildInitialOutputs(workspace, new Set(['target', 'image']), { mediaDir: '/tmp', resolveProjectFile: () => { throw new Error('deleted file'); } }), /deleted file/);
});
