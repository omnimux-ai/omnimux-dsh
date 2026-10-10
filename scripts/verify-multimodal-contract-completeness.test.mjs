import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import {
  parseCordisMultimodalModels,
  parseTextModelsSpec,
  verifyMultimodalContracts,
} from './verify-multimodal-contract-completeness.mjs';
import { loadAll } from '../plugins/omnimux/src/catalog/contract/load.js';
import { spawnSync } from 'node:child_process';
import { loadKnownGaps } from './verify-multimodal-contract-completeness.mjs';

function fixture() {
  const prompt = { slot: 'prompt', type: 'text', role: 'prompt', valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction' } };
  const model = { id: 'mm-text', operations: [{ id: 'vision_chat', output: { type: 'text' }, inputs: [prompt, { slot: 'reference_images', type: 'image', role: 'reference', min: 0, max: 2, allowedMimes: ['image/png'] }] }] };
  return {
    cordisModels: [{ id: model.id, input: ['text', 'image'] }],
    textModels: [model],
    catalog: { models: [model] },
    resolveSlotOperation: () => 'vision_chat',
    deriveSlotLayout: () => ({ preset: 'reference_images', slots: [{}], addButton: true }),
    allowedModelIds: [model.id],
  };
}

function codes(result) { return result.findings.map((entry) => entry.code); }

test('每个多模态源恰好归matched/unpaired，matched必须实查', () => {
  const input = fixture();
  input.cordisModels.push({ id: 'route-only', input: ['image'] });
  const result = verifyMultimodalContracts(input);
  assert.equal(result.ok, false, '新增未配对源必须阻断');
  assert.ok(codes(result).includes('ROUTE_MODEL_UNPAIRED'));
  assert.deepEqual(result.counts, { source: 2, contract: 1, matched: 1, checked: 1, canvas: 1, unpaired: 1, known: 0, new: 1, stale: 0, invalid: 0, structural: 0 });
  assert.deepEqual(result.coverage, [{ modelId: 'mm-text', status: 'matched', checked: true }, { modelId: 'route-only', status: 'unpaired', checked: false }]);
  assert.deepEqual(result.unpaired, ['route-only']);
});

test('缺canvas依赖、白名单归零、全漏匹配和空源不能静默变绿', () => {
  for (const key of ['catalog', 'resolveSlotOperation', 'deriveSlotLayout', 'allowedModelIds']) {
    const input = fixture();
    delete input[key];
    assert.equal(verifyMultimodalContracts(input).ok, false, key);
  }
  const empty = fixture();
  empty.allowedModelIds = [];
  assert.equal(verifyMultimodalContracts(empty).ok, false);
  empty.canvasEmptyReason = 'fixture product deliberately exposes no text models';
  assert.equal(verifyMultimodalContracts(empty).ok, true);
  assert.equal(verifyMultimodalContracts(empty).counts.checked, 1);
  const stillAdmitted = fixture();
  stillAdmitted.canvasEmptyReason = 'not allowed to skip matched sources';
  assert.equal(verifyMultimodalContracts(stillAdmitted).counts.canvas, 1);
  const unpaired = fixture();
  unpaired.textModels[0].id = 'different';
  assert.equal(verifyMultimodalContracts(unpaired).ok, false);
  for (const key of ['cordisModels', 'textModels']) {
    assert.throws(() => verifyMultimodalContracts({ ...fixture(), [key]: [] }));
    assert.throws(() => verifyMultimodalContracts({ ...fixture(), [key]: {} }));
  }
});

test('源模型、operation、inputs形状和重复身份必须失败', () => {
  const cases = [
    (i) => { i.cordisModels.push(i.cordisModels[0]); },
    (i) => { i.cordisModels[0].input = 'image'; },
    (i) => { i.textModels[0].operations = {}; },
    (i) => { i.textModels[0].operations[0].inputs = {}; },
    (i) => { i.textModels[0].operations.push(i.textModels[0].operations[0]); },
    (i) => { i.textModels[0].operations[0].inputs[0].valueSources = {}; },
    (i) => { i.textModels[0].operations[0].inputs[0].composition = []; },
    (i) => { i.textModels[0].operations[0].inputs[1].allowedMimes = 'image/png'; },
    (i) => { i.textModels[0].operations[0].inputs[0].type = ''; },
  ];
  for (const change of cases) {
    const input = fixture();
    change(input);
    assert.throws(() => verifyMultimodalContracts(input));
  }
});

test('缺vision、错误槽名/容量/格式以及prompt来源/组合被真正checker拦截', () => {
  for (const [change, expected] of [
    [(m) => { m.operations[0].inputs.pop(); }, 'CONTRACT_INCOMPLETE'],
    [(m) => { m.operations[0].inputs[1].slot = 'images'; }, 'SLOT_NAMING_ERROR'],
    [(m) => { m.operations[0].inputs[1].min = 1; }, 'SLOT_MIN_INVALID'],
    [(m) => { delete m.operations[0].inputs[1].max; }, 'SLOT_MAX_INVALID'],
    [(m) => { m.operations[0].inputs[1].allowedMimes = []; }, 'SLOT_MIMES_MISSING'],
    [(m) => { delete m.operations[0].inputs[0].valueSources; }, 'PROMPT_SOURCES_MISSING'],
    [(m) => { delete m.operations[0].inputs[0].composition; }, 'PROMPT_COMPOSITION_MISSING'],
  ]) {
    const input = fixture();
    change(input.textModels[0]);
    const result = verifyMultimodalContracts(input);
    assert.equal(result.ok, false);
    assert.ok(codes(result).includes(expected), expected);
    assert.equal(result.counts.checked, 1);
  }
});

test('折叠、解析为空、无效layout及catalog漏模型由真正checker判红', () => {
  for (const overrides of [
    { deriveSlotLayout: () => ({ preset: 'none', slots: [], addButton: false }) },
    { resolveSlotOperation: () => undefined },
    { deriveSlotLayout: () => ({ slots: null }) },
    { catalog: { models: [{ id: 'wrong' }] } },
  ]) assert.equal(verifyMultimodalContracts({ ...fixture(), ...overrides }).ok, false);
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cordisPath = resolve(root, 'plugins/omnimux/cordis.patch.yml');
const textModelsPath = resolve(root, 'plugins/omnimux/src/catalog/specs/text-models.yaml');

function withFile(content, check) {
  const scratch = resolve(root, '.tmp/3248');
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(resolve(scratch, 'fixture-'));
  const path = resolve(dir, 'source.yaml');
  try {
    writeFileSync(path, content);
    check(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('精确基线保留已知发现，新增、stale、invalid及结构异常失败', () => {
  const input = fixture();
  delete input.textModels[0].operations[0].inputs[0].composition;
  const entry = { code: 'PROMPT_COMPOSITION_MISSING', modelId: 'mm-text', operationId: 'vision_chat', reason: '历史组合声明欠账，尚未修复', issue: '#3249' };
  const known = verifyMultimodalContracts({ ...input, baseline: [entry] });
  assert.equal(known.ok, true);
  assert.equal(known.counts.known, 1);
  assert.equal(known.findings.length, 1);
  assert.equal(known.capabilitiesComplete, false);
  delete input.textModels[0].operations[0].inputs[0].valueSources;
  const added = verifyMultimodalContracts({ ...input, baseline: [entry] });
  assert.equal(added.ok, false);
  assert.equal(added.unexpected[0].code, 'PROMPT_SOURCES_MISSING');
  const stale = verifyMultimodalContracts({ ...fixture(), baseline: [entry] });
  assert.equal(stale.ok, false);
  assert.equal(stale.stale.length, 1);
  for (const baseline of [null, {}, [entry, entry], [{ ...entry, reason: '' }], [{ ...entry, issue: '' }], [{ ...entry, issue: '#3248' }], [{ ...entry, modelId: '*' }], [{ ...entry, operationId: '' }], [{ ...entry, code: 'CANVAS_CONTEXT_MISSING' }]]) {
    assert.equal(verifyMultimodalContracts({ ...fixture(), baseline }).ok, false, JSON.stringify(baseline));
  }
  const structural = verifyMultimodalContracts({ ...input, catalog: undefined, baseline: [entry] });
  assert.equal(structural.ok, false);
  assert.ok(structural.structural.length > 0);
  assert.equal(verifyMultimodalContracts({ ...input, baseline: [entry], useBaseline: false }).counts.known, 0);
});

test('真实文件实查覆盖与30历史prompt欠账必须同时可见', async () => {
  const { getHealthyContractIndex, projectCatalog } = await import('../plugins/omnimux/src/catalog/project.js');
  const { resolveSlotOperation, deriveSlotLayout } = await import('../plugins/omnimux-workflow/src/shared/graph/feedSlot/index.ts');
  const { CANVAS_GENERATION_POLICY } = await import('../plugins/omnimux-workflow/src/shared/generationPolicy.ts');
  const result = verifyMultimodalContracts({ cordisPath, textModelsPath,
    catalog: projectCatalog(getHealthyContractIndex()), resolveSlotOperation, deriveSlotLayout,
    allowedModelIds: CANVAS_GENERATION_POLICY.text.allowedModelIds, baseline: loadKnownGaps() });
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.capabilitiesComplete, false, '已知欠账不是功能已通过');
  assert.deepEqual(result.counts, { source: 10, contract: 13, matched: 9, checked: 9, canvas: 2, unpaired: 1, known: 31, new: 0, stale: 0, invalid: 0, structural: 0 });
  assert.deepEqual(result.unpaired, ['deepseek-v4-flash-vision-exp']);
  assert.deepEqual(result.canvasChecked, ['gemini-3.8-flash', 'claude-sonnet-4-6']);
  assert.equal(result.coverage.length, 10);
  assert.equal(result.coverage.filter((row) => row.checked).length, 9);
  assert.deepEqual(new Set(result.checked), new Set(result.matched));
  assert.equal(result.findings.filter((entry) => entry.code === 'PROMPT_SOURCES_MISSING').length, 15);
  assert.equal(result.findings.filter((entry) => entry.code === 'PROMPT_COMPOSITION_MISSING').length, 15);
});

test('未配对精确基线只允许已登记源，新增和stale均失败', () => {
  const input = fixture();
  input.cordisModels.push({ id: 'historical-source', input: ['image'] });
  const baseline = [{ code: 'ROUTE_MODEL_UNPAIRED', modelId: 'historical-source', operationId: null,
    issue: '#3249', reason: '已追踪的历史未配对源，不是能力完备' }];
  assert.equal(verifyMultimodalContracts({ ...input, baseline }).ok, true);
  input.cordisModels.push({ id: 'new-source', input: ['image'] });
  const added = verifyMultimodalContracts({ ...input, baseline });
  assert.equal(added.ok, false);
  assert.deepEqual(added.unexpected.map((entry) => entry.modelId), ['new-source']);
  assert.equal(verifyMultimodalContracts({ ...fixture(), baseline }).ok, false, '历史未配对不再存在时基线必须清理');
});

test('画布实查计数与真正layout调用一致，不按尝试对象增长', () => {
  const input = fixture();
  let matcherCalls = 0;
  let layoutCalls = 0;
  input.resolveSlotOperation = () => { matcherCalls++; return 'vision_chat'; };
  input.deriveSlotLayout = () => { layoutCalls++; return { preset: 'reference_images', slots: [{}], addButton: true }; };
  const ready = verifyMultimodalContracts(input);
  assert.equal(ready.counts.canvas, layoutCalls);
  assert.equal(matcherCalls, 1);
  input.catalog = { models: [] };
  matcherCalls = 0; layoutCalls = 0;
  const missing = verifyMultimodalContracts(input);
  assert.equal(missing.ok, false);
  assert.equal(missing.counts.canvas, 0);
  assert.equal(matcherCalls, 0);
  assert.equal(layoutCalls, 0);
});

test('CLI返回真实覆盖计数、欠账状态及无基线非零退出码', () => {
  const script = resolve(root, 'scripts/verify-multimodal-contract-completeness.mjs');
  for (const [args, status, known, unexpected] of [[[], 0, 31, 0], [['--no-baseline'], 1, 0, 31]]) {
    const child = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(child.status, status, child.stderr);
    const report = JSON.parse(child.stdout.trim().split('\n').at(-1));
    assert.equal(report.counts.source, 10);
    assert.equal(report.counts.checked, 9);
    assert.equal(report.counts.known, known);
    assert.equal(report.counts.new, unexpected);
    assert.equal(report.capabilitiesComplete, false);
  }
  assert.equal(spawnSync(process.execPath, [script, '--invalid'], { cwd: root }).status, 1);
});

test('真实路由与正式文本加载器返回非空源，不允许空跑通过', () => {
  const routes = parseCordisMultimodalModels(cordisPath);
  const models = parseTextModelsSpec(textModelsPath);
  assert.equal(routes.length, 10);
  assert.equal(models.length, 13);
  assert.deepEqual(models, loadAll().all().filter((m) => m.sourceFile === 'text-models.yaml'));
  withFile(readFileSync(textModelsPath, 'utf8'), (path) => {
    const stripSource = (rows) => rows.map(({ sourceFile, ...model }) => model);
    assert.deepEqual(stripSource(parseTextModelsSpec(path)), stripSource(models));
  });
});

test('路由结构漂移、缺列表、空列表、缺文件和没有多模态源必须失败', () => {
  for (const text of [
    'plugins: {}',
    '- id: llm-pi-ai\n  config: {}',
    '- id: llm-pi-ai\n  config: {providers: {omnimux: {models: []}}}',
    '- id: llm-pi-ai\n  config: {providers: {omnimux: {models: [{id: text-only, input: [text]}]}}}',
    '- id: llm-pi-ai\n  config: {providers: {omnimux: {models: [{id: mm, input: [image, 42]}]}}}',
    '- id: llm-pi-ai\n  config: {providers: {omnimux: {models: [{id: mm, input: [image]}, {id: mm}]}}}',
  ]) withFile(text, (path) => assert.throws(() => parseCordisMultimodalModels(path)));
  assert.throws(() => parseCordisMultimodalModels(resolve(root, '.tmp/3248/absent-route.yaml')));
});

test('正式文本源拒绝数组根、空models、错误组、残缺模型与缺文件', () => {
  for (const text of [
    '- id: fake',
    'schemaVersion: "1.1"\nmanagementGroup: text\nmodels: []',
    'schemaVersion: "1.1"\nmanagementGroup: image\nmodels: []',
    'schemaVersion: "1.1"\nmanagementGroup: text\nmodels: [{id: fake}]',
  ]) withFile(text, (path) => assert.throws(() => parseTextModelsSpec(path)));
  assert.throws(() => parseTextModelsSpec(resolve(root, '.tmp/3248/absent-text.yaml')));
});
