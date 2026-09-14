import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CANVAS_GENERATION_POLICY, projectCanvasCatalog } from '../generationPolicy.ts';
import { buildContractView, buildUpstreamFingerprint, resolveModelView, planAutoAdaptation } from './compatKernel.ts';
import { buildFilteredModelOptions } from './operationUi.ts';

const kinds = ['text', 'image', 'video', 'audio'];
const empty = () => ({ source: 'omnimux', text: [], image: [], video: [], audio: [] });
const fp = (type) => buildUpstreamFingerprint({ prompt: 'test', assets: type ? [{ sourceNodeId: 'asset', type }] : [] });
function model(id, output, input, listed = true) {
  return { id, label: id, aliases: [`${id}-wire`], operations: [{
    id: output === 'image' ? 'text_to_image' : output === 'audio' ? 'text_to_speech' : 'generate',
    listed, output: { type: output }, inputs: input ? [{ slot: 'reference', type: input, source: 'upstream_edge', role: 'reference', min: 0, max: 2 }] : [],
  }] };
}
function catalogFor(kind, m) { return { ...empty(), [kind]: [{ id: m.id, label: m.id }], models: [m] }; }

for (const kind of kinds) {
  test(`1783 ${kind}: old bucket cannot establish listed capability or default`, () => {
    const id = CANVAS_GENERATION_POLICY[kind].defaultModelId;
    const legacy = { ...empty(), [kind]: [{ id, label: id, inputCapability: { modalities: ['text'] } }] };
    assert.deepEqual(projectCanvasCatalog(legacy)[kind], []);
    assert.equal(projectCanvasCatalog(legacy).defaults[kind], '');
    assert.equal(buildContractView(legacy).available, false);
    assert.deepEqual(buildContractView(legacy).models, []);
    assert.equal(planAutoAdaptation({ catalog: legacy, fingerprint: fp(), outputType: kind }), null);
  });
  test(`1783 ${kind}: legal default and alias survive; wrong output and unlisted fail closed`, () => {
    const id = CANVAS_GENERATION_POLICY[kind].defaultModelId;
    const raw = catalogFor(kind, model(id, kind));
    const projected = projectCanvasCatalog(raw);
    assert.equal(projected.defaults[kind], id);
    assert.equal(resolveModelView(buildContractView(projected), `${id}-wire`).id, id);
    assert.equal(planAutoAdaptation({ catalog: projected, fingerprint: fp(), outputType: kind }).modelId, id);
    for (const invalid of [model(id, kind === 'text' ? 'video' : 'text'), model(id, kind, undefined, false)]) {
      const dirty = catalogFor(kind, invalid);
      assert.deepEqual(projectCanvasCatalog(dirty)[kind], []);
      assert.deepEqual(buildFilteredModelOptions({ catalog: dirty, fingerprint: fp(), outputType: kind }).options, []);
    }
  });
  test(`1783 ${kind}: authoritative output absent from type bucket is not a picker candidate`, () => {
    const m = model(CANVAS_GENERATION_POLICY[kind].defaultModelId, kind);
    assert.deepEqual(buildFilteredModelOptions({ catalog: { ...empty(), models: [m] }, fingerprint: fp(), outputType: kind }).options, []);
  });
}
for (const kind of ['image', 'audio']) {
  test(`1783 ${kind}: zero compatible input candidates cannot be resurrected`, () => {
    const raw = catalogFor(kind, model(CANVAS_GENERATION_POLICY[kind].defaultModelId, kind));
    const result = buildFilteredModelOptions({ catalog: raw, fingerprint: fp('video'), outputType: kind });
    assert.deepEqual(result.options, []);
    assert.equal(result.zeroCandidates, true);
  });
}
test('1783 multimodal video input still yields text output; empty prompt does not hide legal candidates', () => {
  const raw = catalogFor('text', model('gemini-3.8-flash', 'text', 'video'));
  assert.deepEqual(buildFilteredModelOptions({ catalog: raw, fingerprint: fp('video'), outputType: 'text' }).options.map(m => m.id), ['gemini-3.8-flash']);
  assert.deepEqual(buildFilteredModelOptions({ catalog: raw, fingerprint: fp('video'), outputType: 'video' }).options, []);
  const image = model('gpt-image-2.5', 'image');
  image.operations[0].inputs = [{ slot: 'prompt', type: 'text', source: 'node_field', role: 'prompt', min: 1, max: 1 }];
  const options = buildFilteredModelOptions({ catalog: catalogFor('image', image), fingerprint: buildUpstreamFingerprint({ prompt: '', assets: [] }), outputType: 'image' }).options;
  assert.equal(options.length, 1);
  assert.equal(options[0].verdict.readyToSubmit, false);
});
