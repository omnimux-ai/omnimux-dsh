import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { afterEach, test } from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = join(mkdtempSync(join(tmpdir(), 'omnimux-canvas-store-')), 'runtime.mjs');
buildSync({
  stdin: { contents: "export { useCanvasStore } from './canvasStore.ts';", resolveDir: here, sourcefile: 'runtime.ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
});
const { useCanvasStore } = await import(pathToFileURL(bundle).href);
import { createCompatTestCatalog } from '../../shared/validation/compatTestCatalog.ts';
import { createMaterialNode } from '../../shared/graph/nodeFactory.ts';

function graph(model = 'img-prompt-only') {
  return {
    nodes: [
      {
        id: 'gen',
        type: 'material',
        position: { x: 0, y: 0 },
        data: {
          materialType: 'image',
          nodeKind: 'generate',
          selectedTool: 'text-to-image',
          prompt: 'make it',
          params: { model },
        },
      },
      {
        id: 'source',
        type: 'material',
        position: { x: 0, y: 0 },
        data: {
          materialType: 'image',
          nodeKind: 'import',
          selectedTool: 'import',
          mimeType: 'image/png',
          sizeBytes: 1024,
        },
      },
    ],
    edges: [{ id: 'source-gen', source: 'source', target: 'gen', targetHandle: 'in' }],
  };
}

afterEach(() => useCanvasStore.getState().resetStore());

test('catalog-first hydrate reconciles the loaded graph even when runtime fingerprint is unchanged', () => {
  const store = useCanvasStore.getState();
  store.setCatalogRuntime(createCompatTestCatalog());
  const saved = graph();
  store.hydrateGraph(saved.nodes, saved.edges);

  const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === 'gen');
  assert.equal(node.data.params.model, 'img-prompt-only');
  assert.equal(node.data.params.operation, 'text_to_image');
  assert.deepEqual(node.data.slotBindings, {});
});

test('graph-first hydrate reconciles after catalog arrives and preserves an explicit valid model', () => {
  const store = useCanvasStore.getState();
  const stale = graph();
  store.hydrateGraph(stale.nodes, stale.edges);
  store.setCatalogRuntime(createCompatTestCatalog());
  assert.equal(
    useCanvasStore.getState().nodes.find((candidate) => candidate.id === 'gen').data.params.model,
    'img-prompt-only',
  );

  store.resetStore();
  const valid = graph('img-ref');
  store.hydrateGraph(valid.nodes, valid.edges);
  store.setCatalogRuntime(createCompatTestCatalog());
  const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === 'gen');
  assert.equal(node.data.params.model, 'img-ref');
  assert.equal(node.data.params.operation, 'image_to_image');
});

test('catalog-ready standalone video creation writes the effective listed model and operation atomically', () => {
  const store = useCanvasStore.getState();
  store.setCatalogRuntime(createCompatTestCatalog());
  store.setNodes([{
    id: 'selected-existing',
    type: 'material',
    position: { x: 0, y: 0 },
    selected: true,
    data: {
      materialType: 'text',
      nodeKind: 'generate',
      selectedTool: 'text-to-text',
      params: {},
    },
  }]);

  const video = { ...createMaterialNode('video', { x: 200, y: 100 }), selected: true };
  const result = store.applyCanvasInputMutation({
    addNodes: [video],
    nodePatches: [{ nodeId: 'selected-existing', data: {}, node: { selected: false } }],
  });

  assert.equal(result.status, 'allowed');
  const added = useCanvasStore.getState().nodes.find((node) => node.id === video.id);
  assert.equal(added?.selected, true);
  assert.equal(useCanvasStore.getState().nodes.find((node) => node.id === 'selected-existing')?.selected, false);
  assert.equal(added?.data.params.model, 'vid-frames');
  assert.equal(added?.data.params.operation, 'text_to_video');
  assert.equal(added?.data.compat.status, 'ok');
});

test('catalog-ready text edges still initialize new video and image targets', () => {
  const store = useCanvasStore.getState();
  store.setCatalogRuntime(createCompatTestCatalog());
  store.setNodes([{
    id: 'text-source',
    type: 'material',
    position: { x: 0, y: 0 },
    data: {
      materialType: 'text',
      nodeKind: 'generate',
      selectedTool: 'text-to-text',
      params: {},
    },
  }]);

  const video = createMaterialNode('video', { x: 200, y: 0 });
  const image = createMaterialNode('image', { x: 200, y: 200 });
  const result = store.applyCanvasInputMutation({
    addNodes: [video, image],
    addEdges: [
      { source: 'text-source', target: video.id, sourceHandle: 'out', targetHandle: 'in' },
      { source: 'text-source', target: image.id, sourceHandle: 'out', targetHandle: 'in' },
    ],
  });

  assert.equal(result.status, 'allowed');
  const nodes = useCanvasStore.getState().nodes;
  const videoNode = nodes.find((node) => node.id === video.id);
  const imageNode = nodes.find((node) => node.id === image.id);
  assert.equal(videoNode?.data.params.model, 'vid-frames');
  assert.equal(videoNode?.data.params.operation, 'text_to_video');
  assert.equal(imageNode?.data.params.model, 'img-prompt-only');
  assert.equal(imageNode?.data.params.operation, 'text_to_image');
});
