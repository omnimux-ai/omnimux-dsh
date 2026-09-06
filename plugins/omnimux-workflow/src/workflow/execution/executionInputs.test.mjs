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
