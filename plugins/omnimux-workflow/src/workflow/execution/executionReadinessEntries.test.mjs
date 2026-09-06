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
