/**
 * Issue #3034 — each slot definition renders at most one empty well (placeholder + append merged).
 *
 * Seam: rendered ConfigPanel slot wells (.wf-slot-well--empty / --append) counted per data-slot.
 * - prompt unbound → exactly 1 empty card
 * - prompt bound and at max → 0 empty cards
 * - first_frame / last_frame (two distinct definitions) → 1 each (total 2, not a conflict)
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
const root = resolve(here, '../../../../../..');
const tmp = await mkdtemp(resolve(tmpdir(), 'omnimux-empty-well-'));
const output = resolve(tmp, 'render.cjs');
const stubs = {
  useUpstreamMedia: `export const useUpstreamMedia = () => globalThis.__ewUpstreams ?? []; export const toUpstreamSnapshots = items => items;`,
  useModelParameterSchema: `export const getCachedCatalog = () => null; export const useModelParameterSchema = (kind, id, catalog) => ({ schema: {}, modelItem: catalog?.[kind]?.find(m => m.id === id), aspectRatioOptions: [], defaultAspectRatio: '16:9', isAspectRatioValid: () => true, defaultDuration: 5, isDurationValid: () => true });`,
  canvasStore: `const state = () => ({ nodes: globalThis.__ewNodes ?? [], edges: globalThis.__ewEdges ?? [], catalogRuntime: globalThis.__ewCatalog }); export const useCanvasStore = Object.assign(selector => selector(state()), { getState: state, subscribe: () => () => {} });`,
  generationPreferencesStore: `export const rememberGenerationModel = async () => {};`,
  i18n: `import zh from ${JSON.stringify(resolve(root, 'src/canvas/i18n/dict.zh.ts'))}; export const useT = () => key => zh[key] ?? key;`,
  ui: `import React from 'react'; export const CustomSelect = () => null; export const CustomSlider = () => null; export const toast = { error: () => {} };`,
};
await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import ConfigPanel from ${JSON.stringify(resolve(here, 'index.tsx'))};
export function render(nodeData, catalog, upstreams = [], edges = []) {
  globalThis.__ewCatalog = catalog;
  globalThis.__ewUpstreams = upstreams;
  globalThis.__ewEdges = edges;
  globalThis.__ewNodes = [{ id: 'target', type: 'material', position: { x: 0, y: 0 }, data: nodeData }];
  return renderToStaticMarkup(React.createElement(ConfigPanel, { nodeId: 'target', nodeData, catalog, onUpdateNodeData: () => {}, onGenerate: () => {}, execBusy: false }));
}`,
    resolveDir: root,
  },
  bundle: true, jsx: 'automatic', platform: 'node', format: 'cjs', outfile: output, logLevel: 'silent',
  plugins: [{ name: 'ew-boundaries', setup(b) {
    b.onResolve({ filter: /(?:useUpstreamMedia|useModelParameterSchema|\/canvasStore|generationPreferencesStore|\/i18n|\/ui)$/ }, (args) => {
      const name = args.path.split('/').pop();
      return name in stubs ? { path: name, namespace: 'ew' } : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'ew' }, (args) => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: root }));
  } }],
});
const { render } = createRequire(import.meta.url)(output);
await rm(tmp, { recursive: true, force: true });

const OPS = { image: 'text_to_image', video: 'text_to_video' };
const TOOLS = { image: 'text-to-image', video: 'text-to-video' };
const promptSlot = { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field',
  valueSources: ['local_field', 'upstream_output'], composition: { kind: 'content_with_instruction', localRole: 'instruction' }, min: 1, max: 1 };

function catalogFor(type, extraInputs = []) {
  const model = { id: 'gate-model', label: 'Gate model', listed: true,
    operations: [{ id: OPS[type], label: OPS[type], listed: true, output: { type },
      inputs: [promptSlot, ...extraInputs], execution: { status: 'live' } }] };
  return { source: 'omnimux', text: [], image: [], video: [], audio: [], [type]: [model], models: [model] };
}

function node(type, { legacy = false, prompt = '', slotBindings = {} } = {}) {
  const data = {
    materialType: type, kind: 'generate', nodeKind: 'generate', selectedTool: TOOLS[type],
    slotBindings, prompt, params: { model: 'gate-model', operation: OPS[type] },
  };
  if (!legacy) data.inputBindingVersion = 1;
  return data;
}

// Count empty wells (placeholder or append) — legacy required wells are
// <div role="button">, newer ones are <button>; both carry the wf-slot-well class.
const emptyWells = (html) => {
  const tags = html.match(/<(?:button|div)[^>]*class="[^"]*wf-slot-well[^"]*(?:--empty|--append)[^"]*"[^>]*>/g) || [];
  const bySlot = {};
  for (const tag of tags) {
    const slot = tag.match(/data-slot="([^"]+)"/)?.[1] ?? '(append)';
    bySlot[slot] = (bySlot[slot] ?? 0) + 1;
  }
  return { total: tags.length, bySlot };
};
const emptyWellsOf = (html, slot) => emptyWells(html).bySlot[slot] ?? 0;
const totalEmptyWells = (html) => emptyWells(html).total;

for (const legacy of [false, true]) {
  const tag = legacy ? 'legacy' : 'new';

  test(`${tag} image: unbound prompt slot renders exactly 1 empty well`, () => {
    const html = render(node('image', { legacy }), catalogFor('image'));
    assert.equal(totalEmptyWells(html), 1, `expect exactly 1 empty well, got ${totalEmptyWells(html)}`);
  });

  test(`${tag} image: bound+full media slot renders occupant + 0 empty wells`, () => {
    const mediaSlot = { slot: 'reference_image', type: 'image', role: 'reference', source: 'upstream_edge', min: 0, max: 1 };
    const html = render(
      node('image', { legacy, slotBindings: { reference_image: [{ edgeId: 'e-img', sourceNodeId: 'img1', pinned: true }] } }),
      catalogFor('image', [mediaSlot]),
      [{ edgeId: 'e-img', nodeId: 'img1', label: '图', materialType: 'image', url: 'https://example.test/a.png', mimeType: 'image/png', hasMedia: true, availability: 'ready' }],
      [{ id: 'e-img', source: 'img1', target: 'target', targetHandle: 'in' }]);
    assert.equal(emptyWellsOf(html, 'reference_image'), 0, `bound media slot must not keep an empty well, got ${emptyWellsOf(html, 'reference_image')}`);
  });
}

test('video: first_frame and last_frame each render exactly one named empty well, prompt gets one append', () => {
  const frames = [
    { slot: 'first_frame', type: 'image', role: 'first_frame', source: 'upstream_edge', min: 1, max: 1 },
    { slot: 'last_frame', type: 'image', role: 'last_frame', source: 'upstream_edge', min: 1, max: 1 },
  ];
  const html = render(node('video'), catalogFor('video', frames));
  assert.equal(totalEmptyWells(html), 3, `expect 3 empty wells total (first/last/prompt), got ${totalEmptyWells(html)}`);
  assert.equal((html.match(/aria-label="添加首帧"/g) || []).length, 1);
  assert.equal((html.match(/aria-label="添加尾帧"/g) || []).length, 1);
});
