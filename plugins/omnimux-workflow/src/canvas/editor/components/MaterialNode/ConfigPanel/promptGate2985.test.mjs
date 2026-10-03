/**
 * Issue #2985 — new-input generation nodes gate submission on the shared kernel only.
 *
 * Seam: the rendered ConfigPanel submit button (aria-disabled + reason title).
 * For image / video / text / audio nodes whose prompt slot accepts both local text and
 * upstream text (valueSources [local_field, upstream_output], min 1):
 *   1. local prompt only, no upstream → button enabled, no "还差必需素材";
 *   2. empty prompt, no upstream text → button disabled up front with the kernel copy.
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
const tmp = await mkdtemp(resolve(tmpdir(), 'omnimux-prompt-gate-'));
const output = resolve(tmp, 'render.cjs');
const stubs = {
  useUpstreamMedia: `export const useUpstreamMedia = () => []; export const toUpstreamSnapshots = items => items;`,
  useModelParameterSchema: `export const getCachedCatalog = () => null; export const useModelParameterSchema = (kind, id, catalog) => ({ schema: {}, modelItem: catalog?.[kind]?.find(m => m.id === id), aspectRatioOptions: [], defaultAspectRatio: '16:9', isAspectRatioValid: () => true, defaultDuration: 5, isDurationValid: () => true });`,
  canvasStore: `const state = () => ({ nodes: globalThis.__promptGateNodes ?? [], edges: [], catalogRuntime: globalThis.__promptGateCatalog }); export const useCanvasStore = Object.assign(selector => selector(state()), { getState: state, subscribe: () => () => {} });`,
  generationPreferencesStore: `export const rememberGenerationModel = async () => {};`,
  i18n: `import zh from ${JSON.stringify(resolve(root, 'src/canvas/i18n/dict.zh.ts'))}; export const useT = () => key => zh[key] ?? key;`,
  ui: `import React from 'react'; export const CustomSelect = () => null; export const CustomSlider = () => null; export const toast = { error: () => {} };`,
};
await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import ConfigPanel from ${JSON.stringify(resolve(here, 'index.tsx'))};
export function render(nodeData, catalog) {
  globalThis.__promptGateCatalog = catalog;
  globalThis.__promptGateNodes = [{ id: 'target', type: 'material', position: { x: 0, y: 0 }, data: nodeData }];
  return renderToStaticMarkup(React.createElement(ConfigPanel, { nodeId: 'target', nodeData, catalog, onUpdateNodeData: () => {}, onGenerate: () => {}, execBusy: false }));
}`,
    resolveDir: root,
  },
  bundle: true, jsx: 'automatic', platform: 'node', format: 'cjs', outfile: output, logLevel: 'silent',
  plugins: [{ name: 'prompt-gate-boundaries', setup(b) {
    b.onResolve({ filter: /(?:useUpstreamMedia|useModelParameterSchema|\/canvasStore|generationPreferencesStore|\/i18n|\/ui)$/ }, (args) => {
      const name = args.path.split('/').pop();
      return name in stubs ? { path: name, namespace: 'prompt-gate' } : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'prompt-gate' }, (args) => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: root }));
  } }],
});
const { render } = createRequire(import.meta.url)(output);
await rm(tmp, { recursive: true, force: true });

const OPS = { image: 'text_to_image', video: 'text_to_video', text: 'chat', audio: 'text_to_speech' };
const TOOLS = { image: 'text-to-image', video: 'text-to-video', text: 'text-to-text', audio: 'text-to-speech' };

function catalogFor(type) {
  const composition = type === 'audio'
    ? { kind: 'single_body', localRole: 'body' }
    : { kind: 'content_with_instruction', localRole: 'instruction' };
  const operation = {
    id: OPS[type], label: OPS[type], listed: true, output: { type },
    inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field',
      valueSources: ['local_field', 'upstream_output'], composition, min: 1, max: 1 }],
    execution: { status: 'live' },
  };
  const model = { id: 'gate-model', label: 'Gate model', listed: true, operations: [operation] };
  return { source: 'omnimux', text: [], image: [], video: [], audio: [], [type]: [model], models: [model] };
}

function newNode(type, prompt) {
  return {
    materialType: type, kind: 'generate', nodeKind: 'generate', selectedTool: TOOLS[type],
    inputBindingVersion: 1, slotBindings: {}, prompt,
    params: { model: 'gate-model', operation: OPS[type] },
  };
}

const sendButton = (html) => html.match(/<button[^>]*wf-generate-btn__send[^>]*>/)?.[0] ?? '';

for (const type of ['image', 'video', 'text', 'audio']) {
  test(`${type}: local prompt only (no upstream) can submit`, () => {
    const html = render(newNode(type, '1dog'), catalogFor(type));
    assert.doesNotMatch(html, /还差必需素材/);
    assert.match(sendButton(html), /aria-disabled="false"/);
  });

  test(`${type}: empty prompt without upstream text is disabled up front with kernel copy`, () => {
    const html = render(newNode(type, ''), catalogFor(type));
    assert.doesNotMatch(html, /还差必需素材/);
    const button = sendButton(html);
    assert.match(button, /aria-disabled="true"/);
    assert.match(button, /title="请补齐正文"/);
  });
}

test('legacy node (no inputBindingVersion) still gated by the count-only check', () => {
  const nodeData = newNode('image', '');
  delete nodeData.inputBindingVersion;
  const html = render(nodeData, catalogFor('image'));
  const button = sendButton(html);
  assert.match(button, /aria-disabled="true"/);
  assert.match(button, /title="请输入内容或连接上游文本"/);
});
