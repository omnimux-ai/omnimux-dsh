import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveModelContract, prepareAndInjectWorkflowSnapshot, executeAppWorkflow } from './executionBridge.ts';

const model = 'gpt-image-2.5';
const contract = {
  id: model,
  parameters: { resolution: { options: ['1K', '2K', '4K'], defaultValue: '1K' }, n: { options: [1, 2, 4], defaultValue: 1 } },
  channelGroups: [{ id: 'standard', default: true, constraints: { parameters: { resolution: { fixed: '1K' }, n: { fixed: 1 } } } }, { id: 'economy' }],
};
function manifest(resolution = '1K', n = 1, exposed = false) {
  return { appId: 'qa3071', workflowBinding: { workspaceId: 'qa3071', snapshot: { nodes: [{ id: 'image', type: 'material', data: { materialType: 'image', content: 'cat', params: { model, resolution, n } } }], edges: [] } }, formSchema: { type: 'object', properties: {} }, fieldMappings: exposed ? { resolution: { nodeId: 'image', targetPath: 'data.params.resolution', mappingType: 'param' } } : {} };
}
test('Apps default line projects actual channelGroups without mutating model union', () => {
  const original = structuredClone(contract);
  const projected = resolveModelContract(model, [contract]);
  assert.deepEqual(projected.parameters.resolution.options, ['1K']);
  assert.deepEqual(projected.parameters.n.options, [1]);
  assert.deepEqual(contract, original);
  assert.deepEqual(resolveModelContract('unrelated', [{ ...contract, id: 'unrelated', channelGroups: [{ id: 'economy' }] }]).parameters.resolution.options, ['1K', '2K', '4K']);
});
test('saved and exposed 4K/count requests are rejected without launches or mutation', async () => {
  for (const [resolution, n, exposed] of [['4K', 1, false], ['1K', 4, false], ['1K', 1, true]]) {
    const app = manifest(resolution, n, exposed);
    const original = structuredClone(app);
    let launches = 0;
    await assert.rejects(executeAppWorkflow({ manifest: app, formValues: exposed ? { resolution: '4K' } : {}, modelCatalog: [contract], headlessSeam: { executeHeadless: async () => { launches++; return { executionId: 'unexpected' }; } } }), { code: 'validation_failed' });
    assert.equal(launches, 0);
    assert.deepEqual(app, original);
  }
  const prepared = prepareAndInjectWorkflowSnapshot(manifest(), {}, { modelCatalog: [contract] });
  assert.deepEqual(prepared.nodes[0].data.params, { model, resolution: '1K', n: 1 });
});
test('saved economy/pro routing preserves high-resolution intent with model selection', () => {
  const lines = { ...contract, channelGroups: [...contract.channelGroups, { id: 'pro' }] };
  for (const line of ['economy', 'pro']) {
    for (const formValues of [{}, { __model__: model }]) {
      const app = manifest('4K', 4);
      app.workflowBinding.snapshot.nodes[0].data.params.routing = { allowedGroups: [line] };
      const prepared = prepareAndInjectWorkflowSnapshot(app, formValues, { modelCatalog: [lines] });
      assert.equal(prepared.nodes[0].data.params.resolution, '4K');
      assert.equal(prepared.nodes[0].data.params.n, 4);
      assert.deepEqual(prepared.nodes[0].data.params.routing, { allowedGroups: [line] });
    }
  }
});
test('contradictory default constraint fails closed instead of keeping 4K union', () => {
  const contradictory = { ...contract, parameters: { ...contract.parameters, resolution: { options: ['4K'] } } };
  for (const resolution of ['1K', '4K']) {
    assert.throws(() => prepareAndInjectWorkflowSnapshot(manifest(resolution), {}, { modelCatalog: [contradictory] }), { code: 'validation_failed' });
  }
});
