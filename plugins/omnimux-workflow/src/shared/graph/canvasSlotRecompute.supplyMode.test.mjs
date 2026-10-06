/**
 * #3214 — 系统写入的生成方式不得锁死上游素材。
 *
 * 真实网关函数 `recomputeCanvasSlots` + 真实展示/提交内核 `effectiveInputDisplay`：空白图片节点先落到
 * 目录推荐模式（文生图），随后连入就绪图片时，必须按供给池改用可吸收该素材的已上架模式、素材装填生效，
 * 且不再出现「未使用素材」条目；用户显式拍板过的模式与历史节点分别按契约处理。
 * 显式空字典 `{}` 的「用户清空」语义（#3128）保持不变：装填由展示/提交内核完成，不写回节点。
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
const pluginRoot = resolve(here, '../../..');
const tmp = await mkdtemp(resolve(tmpdir(), 'omnimux-3214-'));
const output = resolve(tmp, 'recompute.cjs');

await build({
  absWorkingDir: pluginRoot,
  stdin: {
    contents: `export { recomputeCanvasSlots } from ${JSON.stringify(resolve(here, 'canvasSlotRecompute.ts'))};
export { createCompatTestCatalog } from ${JSON.stringify(resolve(here, '../validation/compatTestCatalog.ts'))};
export { buildCanvasUpstreamFingerprint } from ${JSON.stringify(resolve(here, 'canvasInputSources.ts'))};
export { deriveSlotLayout } from ${JSON.stringify(resolve(here, 'feedSlot/deriveSlotLayout.ts'))};
export { feedFromFingerprint } from ${JSON.stringify(resolve(here, 'feedSlot/effectiveFingerprint.ts'))};
export { effectiveInputDisplay } from ${JSON.stringify(resolve(here, 'feedSlot/effectiveInputDisplay.ts'))};`,
    resolveDir: pluginRoot,
  },
  bundle: true, platform: 'node', format: 'cjs', outfile: output, logLevel: 'silent',
});
const {
  recomputeCanvasSlots, createCompatTestCatalog, buildCanvasUpstreamFingerprint,
  deriveSlotLayout, feedFromFingerprint, effectiveInputDisplay,
} = createRequire(import.meta.url)(output);
await rm(tmp, { recursive: true, force: true });

/** 目录推荐模式 = 文生图；img-ref 另有可吸收参考图的 image_to_image。 */
const catalog = (modelId = 'img-ref') => {
  const doc = createCompatTestCatalog();
  doc.defaultOperations = { image: { modelId, operationId: 'text_to_image', rule: 'auto' } };
  return doc;
};
const imageSource = {
  id: 'img1', type: 'material', position: { x: 0, y: 0 },
  data: {
    materialType: 'image', nodeKind: 'import', selectedTool: 'import',
    mediaUrl: 'https://fixture.test/img1.jpg', mimeType: 'image/jpeg', sizeBytes: 1024,
  },
};
const genNode = (model = 'img-ref', extra = {}) => ({
  id: 'target', type: 'material', position: { x: 0, y: 0 },
  data: {
    materialType: 'image', nodeKind: 'generate', selectedTool: 'image-to-image',
    inputBindingVersion: 1, slotConflicts: [], params: { model }, ...extra,
  },
});
const edge = { id: 'e-img', source: 'img1', target: 'target', targetHandle: 'in' };
const connect = (node, doc) => recomputeCanvasSlots(
  node, { nodes: [node, imageSource], edges: [edge] }, { catalog: doc }, undefined, new Set(['e-img']),
);
/** 展示/提交内核口径：本次生成真正消费的已就绪素材。 */
const display = (node, doc, modelId, operationId) => effectiveInputDisplay(
  deriveSlotLayout(doc, modelId, operationId),
  feedFromFingerprint(buildCanvasUpstreamFingerprint('target', [node, imageSource], [edge]), 1),
  node.data.slotBindings, [], [edge], [], 1,
);
const filledCount = (node, doc, modelId, operationId) =>
  Object.values(display(node, doc, modelId, operationId).visibleBindings).reduce((sum, list) => sum + list.length, 0);
const storedCount = (node) =>
  Object.values(node.data.slotBindings ?? {}).reduce((sum, list) => sum + list.length, 0);
const unusedReasons = (node, doc, modelId, operationId) =>
  display(node, doc, modelId, operationId).unused.map((item) => item.reasonCode);

test('#3214：空白图片节点先落到目录推荐模式，并记录来源为系统写入', () => {
  const fresh = recomputeCanvasSlots(genNode(), { nodes: [], edges: [] }, { catalog: catalog() });
  assert.equal(fresh.data.params.operation, 'text_to_image');
  assert.equal(fresh.data.autoOperationId, 'text_to_image');
});

test('#3214：连入就绪 JPG 后自动改用可吸收它的模式，素材落盘装填且不再报未使用', () => {
  const doc = catalog();
  const wired = connect(genNode('img-ref', { prompt: '把这张图改成红色蕾丝风格' }), doc);
  assert.equal(wired.data.params.operation, 'image_to_image', '系统写入的文生图必须让位给能吸收图片的模式');
  assert.equal(storedCount(wired), 1, '重算必须把自愈装填落盘，而不是停在空字典（#3128）');
  assert.equal(filledCount(wired, doc, 'img-ref', 'image_to_image'), 1, '就绪图片必须真正被本次生成消费');
  assert.deepEqual(unusedReasons(wired, doc, 'img-ref', 'image_to_image'), [], '素材已被消费，不得再报未使用');
  assert.equal(wired.data.compat.readyToSubmit, true);
});

test('#3214：用户显式拍板过的生成方式不被自动改写', () => {
  const doc = catalog();
  const picked = genNode('img-ref', {
    autoOperationId: null, params: { model: 'img-ref', operation: 'text_to_image' },
  });
  const wired = connect(picked, doc);
  assert.equal(wired.data.params.operation, 'text_to_image', '用户选择必须保留');
  assert.equal(filledCount(wired, doc, 'img-ref', 'text_to_image'), 0);
  assert.equal(wired.data.autoOperationId, null);
  assert.deepEqual(unusedReasons(wired, doc, 'img-ref', 'text_to_image'), ['no_matching_slot'],
    '用户拍板后吸收不了，仍要如实列出未使用素材');
});

test('#3214：历史节点（无来源标记、模式等于目录推荐值）同样自愈', () => {
  const doc = catalog();
  const legacy = genNode('img-ref', { params: { model: 'img-ref', operation: 'text_to_image' } });
  const wired = connect(legacy, doc);
  assert.equal(wired.data.params.operation, 'image_to_image');
  assert.equal(storedCount(wired), 1);
  assert.equal(filledCount(wired, doc, 'img-ref', 'image_to_image'), 1);
});

test('#3214：模型没有可吸收该素材的模式时行为不变，不静默丢素材', () => {
  const doc = catalog('img-prompt-only');
  const fresh = recomputeCanvasSlots(genNode('img-prompt-only'), { nodes: [], edges: [] }, { catalog: doc });
  const wired = connect(fresh, doc);
  assert.equal(wired.data.params.operation, 'text_to_image', '没有可吸收模式时不得乱改生成方式');
  assert.equal(filledCount(wired, doc, 'img-prompt-only', 'text_to_image'), 0);
  assert.deepEqual(unusedReasons(wired, doc, 'img-prompt-only', 'text_to_image'), ['no_matching_slot'],
    '吸收不了必须如实列出未使用素材，绝不静默丢弃');
});
