/**
 * Issue #3109 — upstream supply that this generation will not consume must stay visible.
 *
 * Seam: the REAL ConfigPanel rendered with the real canvas i18n dictionary, driven by the
 * exact Dev snapshot of the reported symptom. Asserts the rendered `.wf-slot-well` set and
 * the `[data-testid="wf-input-unused"]` chips, so a silent drop cannot come back unnoticed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, '../..');
const configPanelDir = resolve(pluginRoot, 'src/canvas/editor/components/MaterialNode/ConfigPanel');
const tmp = await mkdtemp(resolve(tmpdir(), 'omnimux-3109-e2e-'));
const output = resolve(tmp, 'render.cjs');

const stubs = {
  useUpstreamMedia: `export const useUpstreamMedia = () => globalThis.__uUpstreams ?? []; export const toUpstreamSnapshots = items => items;`,
  useModelParameterSchema: `export const getCachedCatalog = () => null; export const useModelParameterSchema = (kind, id, catalog) => ({ schema: {}, modelItem: catalog?.[kind]?.find(m => m.id === id), aspectRatioOptions: [], defaultAspectRatio: '16:9', isAspectRatioValid: () => true, defaultDuration: 5, isDurationValid: () => true });`,
  canvasStore: `const state = () => ({ nodes: globalThis.__uNodes ?? [], edges: globalThis.__uEdges ?? [], catalogRuntime: globalThis.__uCatalog }); export const useCanvasStore = Object.assign(selector => selector(state()), { getState: state, subscribe: () => () => {} });`,
  generationPreferencesStore: `export const rememberGenerationModel = async () => {};`,
  i18n: `import zh from ${JSON.stringify(resolve(pluginRoot, 'src/canvas/i18n/dict.zh.ts'))}; export const useT = () => key => zh[key] ?? key;`,
  ui: `import React from 'react'; export const CustomSelect = () => null; export const CustomSlider = () => null; export const toast = { error: () => {} };`,
};

await build({
  absWorkingDir: pluginRoot,
  stdin: {
    contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import ConfigPanel from ${JSON.stringify(resolve(configPanelDir, 'index.tsx'))};
export function render(nodeData, catalog, upstreams = [], edges = []) {
  globalThis.__uCatalog = catalog;
  globalThis.__uUpstreams = upstreams;
  globalThis.__uEdges = edges;
  globalThis.__uNodes = [{ id: 'target', type: 'material', position: { x: 0, y: 0 }, data: nodeData }];
  return renderToStaticMarkup(React.createElement(ConfigPanel, { nodeId: 'target', nodeData, catalog, onUpdateNodeData: () => {}, onGenerate: () => {}, execBusy: false }));
}`,
    resolveDir: pluginRoot,
  },
  bundle: true, jsx: 'automatic', platform: 'node', format: 'cjs', outfile: output, logLevel: 'silent',
  plugins: [{ name: 'u3109-boundaries', setup(b) {
    b.onResolve({ filter: /(?:useUpstreamMedia|useModelParameterSchema|\/canvasStore|generationPreferencesStore|\/i18n|\/ui)$/ }, (args) => {
      const name = args.path.split('/').pop();
      return name in stubs ? { path: name, namespace: 'u3109' } : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'u3109' }, (args) => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: pluginRoot }));
  } }],
});
const { render } = createRequire(import.meta.url)(output);
await rm(tmp, { recursive: true, force: true });

const promptSlot = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field',
  valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' }, min: 1, max: 1 };
const referenceSlot = { slot: 'reference_image', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 1 };

function catalogFor(operation, extraInputs = []) {
  const model = { id: 'gate-model', label: 'Gate model', listed: true,
    operations: [{ id: operation, label: operation, listed: true, output: { type: 'image' },
      inputs: [promptSlot, ...extraInputs], execution: { status: 'live' } }] };
  return { source: 'omnimux', text: [], image: [], video: [], audio: [], models: [model] };
}

/** Exact Dev snapshot from Issue #3109: image-to-image node whose operation only declares a prompt. */
const REPRO_NODE = {
  label: '', materialType: 'image', status: 'empty', selectedTool: 'image-to-image',
  nodeKind: 'generate', inputBindingVersion: 1, slotBindings: {}, slotConflicts: [],
  params: { model: 'gate-model', operation: 'text_to_image' },
};
const UPSTREAM = [{ edgeId: 'e-img', nodeId: 'img1', label: 'HTufQo8a4AA6tsR', materialType: 'image',
  url: 'https://fixture.test/HTufQo8a4AA6tsR.jpeg', mimeType: 'image/jpeg', hasMedia: true, availability: 'ready' }];
const EDGES = [{ id: 'e-img', source: 'img1', target: 'target', targetHandle: 'in' }];

const wellTags = (html) => html.match(/<(?:button|div)[^>]*class="[^"]*wf-slot-well[^"]*"[^>]*>/g) || [];
const filledWells = (html) => wellTags(html).filter((tag) => tag.includes('--filled')).length;
const emptyWells = (html) => wellTags(html).filter((tag) => tag.includes('--empty') || tag.includes('--append')).length;
const unusedChips = (html) => (html.match(/<button[^>]*data-testid="wf-input-unused"[^>]*>/g) || [])
  .map((tag) => tag.match(/data-unused-reason="([^"]+)"/)?.[1]);

test('E2E #3109: 已就绪的上游图片在当前生成方式不接纳时，必须在卡槽外显式呈现而不是消失', () => {
  const html = render({ ...REPRO_NODE }, catalogFor('text_to_image'), UPSTREAM, EDGES);
  assert.deepEqual(unusedChips(html), ['no_matching_slot'],
    '上游图片必须作为「未使用」条目出现，并给出 no_matching_slot 原因');
  assert.equal(filledWells(html), 0, '当前 operation 没有图片槽位，不得伪造已装填卡');
  assert.equal(emptyWells(html), 1, '空态仍然只显示 1 个追加 +');
  assert.match(html, /HTufQo8a4AA6tsR · 当前生成方式不支持该素材/,
    '未使用条目必须给出可读原因，禁止静默');
});

test('E2E #3109: 同一份上游图片在 operation 声明图片槽位时照常入槽，且不再报未使用', () => {
  const html = render({ ...REPRO_NODE, params: { model: 'gate-model', operation: 'multi_reference' } },
    catalogFor('multi_reference', [referenceSlot]), UPSTREAM, EDGES);
  assert.deepEqual(unusedChips(html), [], '被消费的供给不得出现在未使用列表');
  assert.equal(filledWells(html), 1, '图片必须装填进卡槽并渲染为已装填卡');
});

test('E2E #3109: 用户主动置为待命的供给不进入未使用列表（待命池语义不变）', () => {
  const html = render({ ...REPRO_NODE, slotStandbyEdgeIds: ['e-img'] }, catalogFor('text_to_image'), UPSTREAM, EDGES);
  assert.deepEqual(unusedChips(html), [], '待命池中的供给是用户主动排除，不得再报未使用');
  assert.equal(filledWells(html), 0);
});
