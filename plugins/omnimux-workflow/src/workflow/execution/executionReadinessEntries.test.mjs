import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const bundle = await build({ stdin: { contents: "export { createExecutionRoutes } from '../routes/executionRoutes.ts'; export { createWorkflowRunTool } from '../agent/agentReadTools.ts';", resolveDir: dir }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { createExecutionRoutes, createWorkflowRunTool } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('HTTP and Agent reject the same empty current source before creating an execution', async () => {
  let creates = 0;
  const snapshot = { id: 'ws_test', name: 'test', version: 1, settings: {}, nodes: [
    { id: 'source', type: 'material', data: { materialType: 'text', content: 'historical', generatedContent: '' } },
    { id: 'target', type: 'material', data: { materialType: 'text', prompt: 'local instruction' } },
  ], edges: [{ source: 'source', target: 'target' }] };
  const deps = { store: { get: () => snapshot }, mediaDir: '/tmp', executionManager: { createExecution: () => { creates++; } } };
  const http = await createExecutionRoutes(deps).tryHandle('POST', '/omnimux-workflow/api/workspaces/ws_test/executions', { body: { mode: 'single', nodeIds: ['target'] } });
  const agent = await createWorkflowRunTool(deps).execute({ workspace_id: 'ws_test', mode: 'single', node_ids: ['target'] });
  assert.equal(http.status, 400);
  assert.deepEqual(http.body, agent);
  assert.equal(agent.reasonCode, 'input_waiting');
  assert.equal(creates, 0);
});

const catalog = { defaults: { text: 'text-model' }, models: [{ id: 'text-model', listed: true, operations: [{
  id: 'text_generate', listed: true, output: { type: 'text' }, inputs: [
    { slot: 'prompt', role: 'prompt', type: 'text', source: 'node_field', min: 1, max: 1 },
  ],
}] }] };

test('IN-03/27: whitespace and invalid configuration cannot bypass HTTP or Agent admission', async () => {
  for (const scenario of [
    { prompt: ' \n ', catalog, reason: 'prompt_required' },
    { prompt: 'valid', catalog: null, reason: 'catalog_unavailable' },
    { prompt: 'valid', catalog, model: 'missing-model', reason: 'unknown_model' },
  ]) {
    let creates = 0;
    const workspace = { id: 'ws_empty', name: 'test', version: 1, settings: {}, edges: [], nodes: [
      { id: 'target', type: 'material', data: { materialType: 'text', prompt: scenario.prompt, params: { model: scenario.model ?? 'text-model' } } },
    ] };
    const deps = { store: { get: () => workspace }, mediaDir: '/tmp', getCatalog: () => scenario.catalog,
      executionManager: { createExecution: () => { creates++; } } };
    const http = await createExecutionRoutes(deps).tryHandle('POST', '/omnimux-workflow/api/workspaces/ws_empty/executions', { body: { mode: 'single', nodeIds: ['target'] } });
    const agent = await createWorkflowRunTool(deps).execute({ workspace_id: 'ws_empty', mode: 'single', node_ids: ['target'] });
    assert.equal(http.status, 400);
    assert.deepEqual(http.body, agent);
    assert.equal(agent.reasonCode, scenario.reason);
    assert.equal(creates, 0);
  }
});

test('IN-01/27: valid current source enters the same execution snapshot through HTTP and Agent', async () => {
  const captures = [];
  const workspace = { id: 'ws_ready', name: 'test', version: 1, settings: {}, edges: [{ source: 'source', target: 'target' }], nodes: [
    { id: 'source', type: 'material', data: { materialType: 'text', content: 'old', generatedContent: '1dog', prompt: 'not inherited' } },
    { id: 'target', type: 'material', data: { materialType: 'text', prompt: '', params: { model: 'text-model' } } },
  ] };
  const deps = { store: { get: () => workspace }, mediaDir: '/tmp', getCatalog: () => catalog,
    executionManager: { createExecution: (options) => {
      captures.push(options);
      return { context: { id: 'captured', workflowId: 'ws_ready', status: 'pending' }, createdAt: 1 };
    } } };
  const http = await createExecutionRoutes(deps).tryHandle('POST', '/omnimux-workflow/api/workspaces/ws_ready/executions', { body: { mode: 'single', nodeIds: ['target'], expectedVersion: 1 } });
  const agent = await createWorkflowRunTool(deps).execute({ workspace_id: 'ws_ready', mode: 'single', node_ids: ['target'] });
  assert.equal(http.status, 200);
  assert.equal(agent.executionId, 'captured');
  assert.equal(captures.length, 2);
  assert.deepEqual(captures[0], captures[1]);
  assert.deepEqual(captures[0].initialOutputs, { source: { text: '1dog' } });
});
