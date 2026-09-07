import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConnection, validateConnectionDetailed, validateDynamicModelCapacity, rejectReasonKey } from './connectionValidator.ts';
import { createCompatTestCatalog } from '../../../shared/validation/compatTestCatalog.ts';
import zh from '../../i18n/dict.zh.ts';
import en from '../../i18n/dict.en.ts';
const catalog = createCompatTestCatalog();
const target = { id: 'target', type: 'material', data: { materialType: 'image', nodeKind: 'generate', selectedTool: 'image-to-image', params: { model: 'alias-img', operation: 'image_to_image' } } };
const source = (id, type = 'image', data = {}) => ({ id, type: 'material', data: { materialType: type, nodeKind: 'import', selectedTool: 'import', mimeType: `${type}/png`, ...data } });
test('fifth edge beyond max four is accepted with unused supply advisory', () => {
  const images = Array.from({ length: 5 }, (_, i) => source(`i${i}`));
  const edges = images.slice(0, 4).map((node) => ({ id: node.id, source: node.id, target: target.id }));
  const connection = { source: 'i4', target: target.id };
  const result = validateConnectionDetailed(connection, [target, ...images], edges, catalog);
  assert.equal(result.valid, true); assert.equal(result.advisory.unusedWouldRemain, true);
  assert.equal(result.reasonCode, undefined); assert.equal(validateConnection(connection, [target, ...images], edges, catalog), true);
});
for (const [name, inputCatalog, data] of [['no catalog', null, {}], ['undefined catalog', undefined, {}], ['unknown model', catalog, {}], ['MIME unsupported', catalog, { mimeType: 'image/gif' }], ['oversized', catalog, { fileSize: 100e6 }]]) {
  test(`${name} never rejects a structurally valid media supply`, () => {
    const dst = name === 'unknown model' ? { ...target, data: { ...target.data, params: { model: 'unknown' } } } : target;
    const detail = validateConnectionDetailed({ source: 'source', target: target.id }, [dst, source('source', 'image', data)], [], inputCatalog);
    assert.equal(detail.valid, true); assert.equal(detail.blockedBy, undefined);
  });
}
for (const [name, connection, nodes, edges] of [
  ['self_connection', { source: 'target', target: 'target' }, [target], []],
  ['missing_node', { source: 'missing', target: 'target' }, [target], []],
  ['duplicate_edge', { source: 'source', target: 'target' }, [target, source('source')], [{ id: 'e', source: 'source', target: 'target' }]],
  ['type_contract', { source: 'source', target: 'target' }, [target, source('source', 'video')], []],
  ['cycle', { source: 'b', target: 'a' }, [{ ...target, id: 'a' }, { ...target, id: 'b' }], [{ id: 'e', source: 'a', target: 'b' }]],
]) {
  test(`Stage 1 still rejects ${name}`, () => {
    const detail = validateConnectionDetailed(connection, nodes, edges, catalog);
    assert.equal(detail.valid, false); assert.equal(detail.reasonCode, name);
    assert.ok(zh[rejectReasonKey(name)]); assert.ok(en[rejectReasonKey(name)]);
  });
}
test('Stage 2 does not gate import targets and prompt-only input', () => {
  assert.equal(validateDynamicModelCapacity({ source: 'source', target: 'target' }, [source('target'), source('source')], [], null).valid, true);
  assert.equal(validateConnectionDetailed({ source: 'source', target: 'target' }, [target, source('source', 'text')], [], null).valid, true);
});
test('capacity and operation failures are not edge rejection messages', () => {
  for (const code of ['slot_capacity', 'min_unsatisfied', 'operation_incompatible']) assert.equal(rejectReasonKey(code), 'edge.reject.invalid');
  assert.equal(rejectReasonKey('cycle'), 'edge.reject.cycle');
});
