import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { afterEach, test } from 'node:test';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundle = join(mkdtempSync(join(tmpdir(), 'omnimux-execution-output-')), 'runtime.mjs');
buildSync({
  stdin: {
    contents: "export { useCanvasStore } from './canvasStore.ts';\nexport { applyExecutionNodeOutput } from '../hooks/useExecutionController.ts';\nexport { createMaterialGatewayExecutor } from '../../workflow/execution/materialGatewayExecutor.ts';",
    resolveDir: here,
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
});
const { useCanvasStore, applyExecutionNodeOutput, createMaterialGatewayExecutor } =
  await import(pathToFileURL(bundle).href);
import { createCompatTestCatalog } from '../../shared/validation/compatTestCatalog.ts';

function visionCatalog() {
  const catalog = createCompatTestCatalog();
  catalog.models.push({
    id: 'gemini-vision',
    label: 'gemini-vision',
    family: 'vision',
    listed: true,
    listedOperations: ['gemini-vision#vision_chat'],
    disposition: 'canonical',
    operations: [{
      id: 'vision_chat',
      label: 'vision_chat',
      listed: true,
      output: { type: 'text' },
      research: { status: 'verified', docUrl: 'fixture' },
      execution: { status: 'live', profileId: 'fixture', seam: 'fixture' },
      inputs: [
        { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
        {
          slot: 'reference_images', type: 'image', role: 'reference', source: 'upstream_edge',
          min: 1, max: 1, allowedMimes: ['image/png'], maxSizeMb: 2,
          limitSource: { kind: 'policy_conservative', note: 'fixture' },
        },
      ],
    }],
  });
  catalog.text = [{ id: 'gemini-vision', label: 'gemini-vision' }];
  return catalog;
}

function executionGraph() {
  return {
    nodes: [
      { id: 'image-output', type: 'material', position: { x: 0, y: 0 }, data: {
        materialType: 'image', nodeKind: 'generate', selectedTool: 'text-to-image',
        prompt: 'an image', params: { model: 'img-prompt-only' },
      } },
      { id: 'vision', type: 'material', position: { x: 0, y: 0 }, data: {
        materialType: 'text', nodeKind: 'generate', selectedTool: 'vision-chat',
        prompt: 'describe it', params: { model: 'gemini-vision' },
      } },
    ],
    edges: [{ id: 'image-vision', source: 'image-output', target: 'vision', targetHandle: 'in' }],
  };
}

afterEach(() => useCanvasStore.getState().resetStore());

test('generated artifact metadata reaches node.data, unlocks vision compatibility, and survives reload', async () => {
  const executor = createMaterialGatewayExecutor({
    gateway: {
      submit: async () => ({ taskId: 'task-1', mode: 'stub' }),
      awaitTask: async () => ({ status: 'completed', url: '/tmp/image.png' }),
      capabilities: async () => ({ source: 'static-stub', defaults: { image: 'img-prompt-only' }, text: [], video: [], audio: [],
        image: [{ id: 'img-prompt-only', label: 'Image' }], models: [{ id: 'img-prompt-only', label: 'Image',
          operations: [{ id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] }] }] }),
      mode: 'mock',
    },
  });
  const output = await executor.execute(
    { id: 'image-output', type: 'material', data: {
      materialType: 'image', nodeKind: 'generate', prompt: 'an image',
      params: { model: 'img-prompt-only' },
    } },
    {
      upstreamOutputs: new Map(),
      signal: new AbortController().signal,
      mediaDir: '/tmp',
      persistGenerated: async () => ({
        url: '/api/workspaces/ws/file?rel=artifacts%2Fimage.png',
        relativePath: 'artifacts/image.png',
        assetId: 'asset-image',
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    },
  );

  assert.deepEqual(output.mediaAssets?.[0], {
    type: 'image',
    url: '/api/workspaces/ws/file?rel=artifacts%2Fimage.png',
    relativePath: 'artifacts/image.png',
    assetId: 'asset-image',
    mimeType: 'image/png',
    sizeBytes: 1024,
  });

  const saved = executionGraph();
  const store = useCanvasStore.getState();
  store.setCatalogRuntime(visionCatalog());
  store.hydrateGraph(saved.nodes, saved.edges);
  applyExecutionNodeOutput('image-output', output, { executionStatus: 'completed' });

  let state = useCanvasStore.getState();
  let source = state.nodes.find((node) => node.id === 'image-output');
  let vision = state.nodes.find((node) => node.id === 'vision');
  assert.equal(source.data.mimeType, 'image/png');
  assert.equal(source.data.sizeBytes, 1024);
  assert.equal(vision.data.compat.status, 'ok');
  assert.equal(vision.data.compat.acceptsCurrentInputs, true);

  const reloadedNodes = state.nodes;
  const reloadedEdges = state.edges;
  store.resetStore();
  store.hydrateGraph(reloadedNodes, reloadedEdges);
  store.setCatalogRuntime(visionCatalog());

  state = useCanvasStore.getState();
  source = state.nodes.find((node) => node.id === 'image-output');
  vision = state.nodes.find((node) => node.id === 'vision');
  assert.equal(source.data.mimeType, 'image/png');
  assert.equal(source.data.sizeBytes, 1024);
  assert.equal(vision.data.compat.status, 'ok');
});

test('video output retains prior media during status updates and clears stale poster on replacement', () => {
  useCanvasStore.getState().hydrateGraph([{ id: 'video-output', type: 'material', position: { x: 0, y: 0 }, data: {
    materialType: 'video', mediaUrl: '/old.mp4', thumbnailUrl: '/old.png', outputThumbnailUrl: '/old.png', coverUrl: '/old.png',
  } }], []);
  for (const executionStatus of ['running', 'error', 'cancelled']) {
    applyExecutionNodeOutput('video-output', {}, { executionStatus });
    const data = useCanvasStore.getState().nodes[0].data;
    assert.equal(data.mediaUrl, '/old.mp4'); assert.equal(data.thumbnailUrl, '/old.png');
  }
  applyExecutionNodeOutput('video-output', { mediaAssets: [{ type: 'video', url: '/new.mp4' }] }, { executionStatus: 'completed' });
  const data = useCanvasStore.getState().nodes[0].data;
  assert.equal(data.mediaUrl, '/new.mp4');
  for (const key of ['thumbnailUrl', 'outputThumbnailUrl', 'coverUrl']) assert.equal(data[key], undefined);
});

test('simulated output is persisted into node data and a later real result clears the marker', () => {
  const store = useCanvasStore.getState();
  store.hydrateGraph([
    { id: 'simulated-output', type: 'material', position: { x: 0, y: 0 }, data: {} },
  ], []);

  applyExecutionNodeOutput('simulated-output', {
    text: 'offline placeholder',
    simulated: true,
  }, { executionStatus: 'completed' });
  assert.equal(
    useCanvasStore.getState().nodes.find((node) => node.id === 'simulated-output')?.data.simulated,
    true,
  );

  applyExecutionNodeOutput('simulated-output', {
    text: 'real result',
  }, { executionStatus: 'completed' });
  assert.equal(
    useCanvasStore.getState().nodes.find((node) => node.id === 'simulated-output')?.data.simulated,
    undefined,
  );
});
