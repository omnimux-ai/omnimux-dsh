import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { buildSync } from 'esbuild';

/**
 * 全链路端到端断言（同源真实模块版）：
 * 渠道组约束 → 目录收窄投影 → 契约协调器 → U06 写参。
 * 验证画布「全能参考版」页面只剩全能参考一种生成方式、无清晰度控件，
 * 且画幅值真实写入 U06 ResolutionSelector 节点。
 */
const here = fileURLToPath(new URL('.', import.meta.url));

const bundlePath = join(mkdtempSync(join(tmpdir(), 'omnimux-u06-e2e-')), 'runtime.mjs');
buildSync({
  stdin: {
    contents: [
      "export { resolveLineConstraints, resolveModelChannelGroups } from './src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';",
      "export { buildChannelContract, reconcileParamsWithContract } from './src/canvas/editor/components/MaterialNode/ConfigPanel/channelContractReconciler.ts';",
      "export { buildU06Prompt, U06_ASPECT_RATIO_MAP } from '../omnimux/src/media/comfyui-instance.js';",
    ].join('\n'),
    resolveDir: join(here, '../..'),
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
});
const {
  resolveLineConstraints,
  resolveModelChannelGroups,
  buildChannelContract,
  reconcileParamsWithContract,
  buildU06Prompt,
  U06_ASPECT_RATIO_MAP,
} = await import(pathToFileURL(bundlePath).href);

const ROUTING = { channelGroupId: 'comfyui', allowedGroups: ['comfyui'] };
const ALL_OPERATIONS = ['text_to_video', 'first_frame', 'last_frame', 'first_last_frame', 'video_multi_ref', 'digital_human'];

/** 模拟海螺 H3 目录模型（含全部 6 个上架操作）。 */
function fakeCatalog() {
  return {
    models: [{
      id: 'minimax-h3',
      label: '海螺 H3',
      operations: ALL_OPERATIONS.map((id) => ({ id, listed: true, label: id, output: { type: 'video' }, inputs: [], parameters: {} })),
    }],
    defaultsByOperation: {},
  };
}

/** 与 ConfigPanel index.tsx 相同的收窄投影：按渠道组 constraints.operations 过滤目录操作。 */
function opsCatalog(catalog, modelId, lineConstraints) {
  if (!catalog || !Array.isArray(lineConstraints?.operations) || lineConstraints.operations.length === 0) return catalog;
  const allowed = new Set(lineConstraints.operations);
  const models = catalog.models?.map((model) =>
    model.id === modelId ? { ...model, operations: (model.operations ?? []).filter((op) => allowed.has(op.id)) } : model);
  return models ? { ...catalog, models } : catalog;
}

describe('comfyui 渠道组全链路：操作收窄 + 分辨率隐藏 + 画幅写参', () => {
  test('渠道约束只放行全能参考，目录收窄后仅剩 1 个生成方式', () => {
    const lc = resolveLineConstraints('minimax-h3', ROUTING, null);
    assert.deepEqual(lc.operations, ['video_multi_ref'], '全能参考版渠道组必须只声明 video_multi_ref');
    const narrowed = opsCatalog(fakeCatalog(), 'minimax-h3', lc);
    assert.deepEqual(narrowed.models[0].operations.map((op) => op.id), ['video_multi_ref']);
  });

  test('未收窄时全部 6 个模式可见（负向对照，证明收窄确由渠道约束驱动）', () => {
    const untouched = opsCatalog(fakeCatalog(), 'minimax-h3', {});
    assert.equal(untouched.models[0].operations.length, 6);
    const otherModel = opsCatalog(fakeCatalog(), 'some-other-model', { operations: ['video_multi_ref'] });
    assert.equal(otherModel.models[0].operations.length, 6, '非当前模型的操作不得被误删');
  });

  test('清晰度控件数据消失且不再产生自适应自愈提示', () => {
    const group = resolveModelChannelGroups('minimax-h3', null).find((g) => g.id === 'comfyui');
    const contract = buildChannelContract('minimax-h3', group);
    assert.deepEqual(contract.constraints.supportedResolutions, []);
    assert.equal(contract.constraints.defaultResolution, '');
    const { healingNotes } = reconcileParamsWithContract({ resolution: '2K' }, contract);
    assert.equal(healingNotes.find((n) => n.field === 'resolution'), undefined);
  });

  test('画幅参数真实写入 U06 ResolutionSelector 节点', () => {
    const blueprint = {
      '100': { class_type: 'ResolutionSelector', inputs: { aspect_ratio: '16:9 (Landscape Widescreen)' } },
      '620': { class_type: 'UNETLoader', inputs: {} },
    };
    const wf = buildU06Prompt({ workflow: blueprint, prompt: 'x', aspectRatio: '1:1' });
    assert.equal(wf['100'].inputs.aspect_ratio, '1:1 (Square)');
    assert.equal(U06_ASPECT_RATIO_MAP['9:16'], '9:16 (Portrait Widescreen)');
    // 未传比例时保留蓝本现值
    const untouched = buildU06Prompt({ workflow: blueprint, prompt: 'x' });
    assert.equal(untouched['100'].inputs.aspect_ratio, '16:9 (Landscape Widescreen)');
  });
});
