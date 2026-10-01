import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildModelCatalog } from '../../../../omnimux/src/catalog/list.js';
import { executeOmnimuxMedia } from '../../../../omnimux/src/media/execute.js';
import { executeOmnimuxText } from '../../../../omnimux/src/text/execute.js';
import { createOmnimuxSeamClient } from '../seam/omnimuxGateway.ts';
import { createMaterialGatewayExecutor } from './materialGatewayExecutor.ts';
import { deriveSlotLayout } from '../../shared/graph/feedSlot/deriveSlotLayout.ts';

const rows = [
  ['text', 'gemini-3.8-flash', 'chat'],
  ['image', 'gpt-image-2.5', 'text_to_image'],
  ['video', 'seedance-2-5', 'text_to_video'],
  ['audio', 'seed-audio-1.0', 'text_to_speech'],
];
const env = { OMNIMUX_API_KEY: 'fixture-offline-only', OMNIMUX_BASE_URL: 'https://fixture.invalid/v1' };

for (const [kind, modelId, operationId] of rows) {
  test(`production ${kind} contract/executor/gateway/Hub/mapper sends A only and restores once`, async t => {
    const dir = mkdtempSync(join(tmpdir(), 'omnimux-2848-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const bodies = [];
    const catalog = buildModelCatalog({ env: {} });
    const op = catalog.models.find(model => model.id === modelId).operations.find(op => op.id === operationId);
    const textSlot = op.inputs.find(slot => slot.type === 'text' && slot.role === 'prompt');
    assert.equal(op.listed, true);
    assert.deepEqual(textSlot.valueSources, ['local_field', 'upstream_output']);
    assert.equal(textSlot.composition.kind, kind === 'audio' ? 'single_body' : 'content_with_instruction');
    assert.equal(deriveSlotLayout(catalog, modelId, operationId).addButton, true);
    const fetcher = async (url, init) => {
      assert.equal(init.method, 'POST', 'capture stops at the provider transport, not polling');
      const body = JSON.parse(init.body);
      bodies.push({ url: String(url), body });
      if (kind === 'text') return Response.json({ choices: [{ message: { content: 'offline result' } }] });
      if (kind === 'image') return Response.json({ data: [{ b64_json: 'cG5n' }] });
      if (kind === 'video') return Response.json({ error: { message: 'offline capture stops before polling' } }, { status: 400 });
      return new Response(Buffer.from([0x49, 0x44, 0x33, 0, 1]), { headers: { 'content-type': 'audio/mpeg' } });
    };
    const seams = {
      modelCatalog: { list: () => catalog },
      textComplete: { execute: req => executeOmnimuxText({ ...req, env, fetcher, allowedGroups: ['standard'] }) },
      imageGenerate: { execute: req => executeOmnimuxMedia('image', { ...req, env, fetcher }) },
      videoGenerate: { execute: req => executeOmnimuxMedia('video', { ...req, env, fetcher }) },
      audioGenerate: { execute: req => executeOmnimuxMedia('audio', { ...req, env, fetcher }) },
    };
    const gateway = createOmnimuxSeamClient({ getSeam: name => seams[name], env: {} });
    const executor = createMaterialGatewayExecutor({ gateway });
    const target = { id: 'target', type: 'material', data: { materialType: kind, nodeKind: 'generate',
      inputBindingVersion: 1, prompt: '本地正文。', params: { model: modelId, operation: operationId },
      slotBindings: { [textSlot.slot]: [{ edgeId: 'ea', sourceNodeId: 'a', outputId: 'a:current',
        pinned: true, ordinal: 0, use: 'active', role: textSlot.role }] } } };
    const ctx = { mediaDir: dir, signal: new AbortController().signal,
      upstreamOutputs: new Map([['a', { text: '已选正文。' }], ['b', { text: '未选供给。' }]]),
      upstreamBindings: [{ edgeId: 'ea', sourceNodeId: 'a', output: { text: '已选正文。' } },
        { edgeId: 'eb', sourceNodeId: 'b', output: { text: '未选供给。' } }] };
    const run = async () => {
      // Video stops after the real submission, before poll/download; other outputs settle offline.
      if (kind === 'video') {
        const before = bodies.length;
        await assert.rejects(executor.execute(target, ctx), /offline capture stops before polling/);
        assert.equal(bodies.length, before + 1);
      } else await executor.execute(target, ctx);
    };
    const bodyText = capture => kind === 'audio' ? capture.body.input
      : kind === 'text' ? capture.body.messages[0].content[0].text : capture.body.prompt;
    await run();
    assert.equal(bodyText(bodies[0]), kind === 'audio' ? '已选正文。\n\n本地正文。' : '来源 1：\n已选正文。\n\n补充要求：\n本地正文。');
    assert.equal(bodyText(bodies[0]).split('已选正文。').length - 1, 1);
    assert.ok(!JSON.stringify(bodies).includes('未选供给。'));
    target.data.slotBindings[textSlot.slot][0].use = 'inactive';
    await run();
    assert.equal(bodyText(bodies[1]), '本地正文。');
    target.data.slotBindings[textSlot.slot][0].use = 'active';
    await run();
    assert.equal(bodyText(bodies[2]), bodyText(bodies[0]));
    target.data.slotBindings = {};
    await run();
    assert.equal(bodyText(bodies[3]), '本地正文。');
    assert.equal(bodies.length, 4);
    assert.equal(ctx.upstreamBindings.length, 2);
    assert.ok(bodies.every(row => row.url.startsWith('https://fixture.invalid/')));
    console.log('PRODUCTION_TRANSPORT_CAPTURE', JSON.stringify({ modelId, operationId, kind, captures: bodies }));
  });
}

test('A6 production current text identity and body freeze together before catalog await; next request follows edited current output', async t => {
  const { readNodeInputSource } = await import('../../shared/graph/nodeInputSource.ts');
  const { collectMaterialSlotInputs } = await import('./materialSlotInputs.ts');
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-2848-identity-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const catalog = buildModelCatalog({ env: {} }); const bodies = []; const requests = [];
  const source = { id: 'a', type: 'material', data: { materialType: 'text', nodeKind: 'generate', taskId: 'current-task', generatedContent: 'Current body.' } };
  const selected = readNodeInputSource(source);
  const target = { id: 'target', type: 'material', data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    prompt: '', params: { model: 'gemini-3.8-flash', operation: 'chat' }, slotBindings: { prompt: [{ edgeId: 'ea', sourceNodeId: 'a', outputId: 'old-task',
      ordinal: 6, pinned: true, role: 'prompt', use: 'active' }] } } };
  const ctx = { mediaDir: dir, signal: new AbortController().signal, upstreamOutputs: new Map([['a', selected.output]]),
    upstreamBindings: [{ edgeId: 'ea', sourceNodeId: 'a', output: selected.output }] };
  const resolved = collectMaterialSlotInputs(target.data, ctx, catalog);
  assert.equal(resolved.textInputs[0].outputId, 'current-task'); assert.equal(resolved.textInputs[0].textContent, 'Current body.');
  const seams = { modelCatalog: { list: () => catalog }, textComplete: { execute: req => executeOmnimuxText({ ...req, env, allowedGroups: ['standard'],
    fetcher: async (url, init) => { bodies.push({ url: String(url), body: JSON.parse(init.body) }); return Response.json({ choices: [{ message: { content: 'offline' } }] }); } }) } };
  const production = createOmnimuxSeamClient({ getSeam: name => seams[name], env: {} });
  let resume; const pendingCatalog = new Promise(resolve => { resume = resolve; });
  const gateway = { ...production, capabilities: () => pendingCatalog, submit: request => { requests.push(structuredClone({ ...request, signal: undefined })); return production.submit(request); } };
  const executor = createMaterialGatewayExecutor({ gateway }); const pending = executor.execute(target, ctx);
  ctx.upstreamBindings[0].output.text = 'Edited body.'; ctx.upstreamBindings[0].output.assetId = 'edited-task';
  target.data.slotBindings.prompt[0].outputId = 'edited-saved'; resume(catalog); await pending;
  assert.equal(requests[0].textInputs[0].outputId, 'current-task');
  assert.equal(bodies[0].body.messages[0].content[0].text, 'Current body.');
  await executor.execute(target, { ...ctx, catalog });
  assert.equal(requests[1].textInputs[0].outputId, 'edited-task');
  assert.equal(bodies[1].body.messages[0].content[0].text, 'Edited body.');
  assert.ok(!JSON.stringify(bodies).includes('textInputs')); assert.ok(!JSON.stringify(bodies).includes('old-task'));
  console.log('CURRENT_OUTPUT_IDENTITY_CAPTURE', JSON.stringify({ selectedOutputIds: requests.map(req => req.textInputs[0].outputId), captures: bodies }));
});

test('R2 production Add resumes saved intent once and OCR1/OCR20 invalid identities stop before Hub transport', async t => {
  const { planCanvasInputSelection } = await import('../../shared/graph/canvasInputMutationGateway.ts');
  const { readNodeInputSource } = await import('../../shared/graph/nodeInputSource.ts');
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-2848-r2-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const catalog = buildModelCatalog({ env: {} }); const bodies = [];
  const source = { id: 'a', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', taskId: 'new-task', generatedContent: 'New body.' } };
  const saved = { sourceNodeId: 'a', edgeId: 'ea', outputId: 'old-task', ordinal: 6, role: 'prompt', pinned: true, use: 'inactive' };
  const target = { id: 'target', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'text', nodeKind: 'generate', inputBindingVersion: 1,
    prompt: '', params: { model: 'gemini-3.8-flash', operation: 'chat' }, slotBindings: { prompt: [saved] } } };
  const graph = { nodes: [source, target], edges: [{ id: 'ea', source: 'a', target: 'target' }] }; const before = structuredClone(graph);
  const plan = planCanvasInputSelection(graph, { targetNodeId: 'target', chosenOperationId: 'chat', selections: [{ sourceNodeId: 'a', outputId: 'new-task', targetSlot: 'prompt', role: 'prompt' }] }, { catalog });
  assert.equal(plan.status, 'allowed'); const next = plan.nodes.find(n => n.id === 'target');
  assert.deepEqual(next.data.slotBindings.prompt, [{ ...saved, use: 'active', outputId: 'new-task' }]);
  const seams = { modelCatalog: { list: () => catalog }, textComplete: { execute: req => executeOmnimuxText({ ...req, env, allowedGroups: ['standard'],
    fetcher: async (url, init) => { bodies.push({ url: String(url), body: JSON.parse(init.body) }); return Response.json({ choices: [{ message: { content: 'offline' } }] }); } }) } };
  const executor = createMaterialGatewayExecutor({ gateway: createOmnimuxSeamClient({ getSeam: name => seams[name], env: {} }) });
  const output = readNodeInputSource(source).output;
  const ctx = { mediaDir: dir, signal: new AbortController().signal, upstreamOutputs: new Map([['a', { text: 'Map must not replace' }]]),
    upstreamBindings: [{ edgeId: 'ea', sourceNodeId: 'a', output }] };
  await executor.execute(next, ctx); assert.equal(bodies.length, 1); assert.equal(bodies[0].body.messages[0].content[0].text, 'New body.');
  await assert.rejects(executor.execute(next, { ...ctx, upstreamBindings: [] }), { code: 'input_unavailable' });
  assert.equal(bodies.length, 1);
  for (const copies of [[next.data.slotBindings.prompt[0], { ...saved, edgeId: 'ea2', use: 'active', ordinal: 7 }],
    [saved, next.data.slotBindings.prompt[0]]]) {
    const malformed = { ...next, data: { ...next.data, slotBindings: { prompt: copies } } };
    await assert.rejects(executor.execute(malformed, { ...ctx, upstreamBindings: [...ctx.upstreamBindings, { edgeId: 'ea2', sourceNodeId: 'a', output }] }), { code: 'input_unavailable' });
    assert.equal(bodies.length, 1);
  }
  assert.deepEqual(graph, before);
  console.log('R2_BINDING_IDENTITY_TRANSPORT_CAPTURE', JSON.stringify({ saved, active: next.data.slotBindings.prompt, captures: bodies, invalidSubmissions: 0 }));
});
