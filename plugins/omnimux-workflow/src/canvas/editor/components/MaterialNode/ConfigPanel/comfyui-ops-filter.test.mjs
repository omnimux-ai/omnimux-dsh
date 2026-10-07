import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { buildSync } from 'esbuild';

/**
 * TC-OPS-01..04: comfyui 渠道组的 operations/参数约束在画布链路真实生效。
 */
const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../../../../../../../..');

const bundlePath = join(mkdtempSync(join(tmpdir(), 'omnimux-u06ops-')), 'runtime.mjs');
buildSync({
  stdin: {
    contents: [
      "export { resolveLineConstraints, resolveModelChannelGroups } from './channelGroups.ts';",
      "export { buildChannelContract } from './channelContractReconciler.ts';",
      "export { buildU06Prompt, U06_ASPECT_RATIO_MAP } from '../../../../../../../omnimux/src/media/comfyui-instance.js';",
      "export { narrowModelByLineConstraints } from '../../../../../shared/validation/lineConstraints.ts';",
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
});
const { resolveLineConstraints, resolveModelChannelGroups, buildChannelContract, buildU06Prompt, U06_ASPECT_RATIO_MAP, narrowModelByLineConstraints } =
  await import(pathToFileURL(bundlePath).href);

const COMFYUI_ROUTING = { channelGroupId: 'comfyui', allowedGroups: ['comfyui'] };

describe('comfyui 渠道组契约收窄', () => {
  test('TC-OPS-01: operations 约束收窄模型操作为仅 video_multi_ref', () => {
    const lc = resolveLineConstraints('minimax-h3', COMFYUI_ROUTING, null);
    assert.deepEqual(lc.operations, ['video_multi_ref']);

    const model = {
      operations: [
        { id: 'text_to_video', listed: true },
        { id: 'video_multi_ref', listed: true },
        { id: 'digital_human', listed: true },
      ],
      parameters: {},
    };
    const narrowed = narrowModelByLineConstraints(model, 'minimax-h3', lc);
    assert.deepEqual(narrowed.operations.map((op) => op.id), ['video_multi_ref']);
  });

  test('TC-OPS-02: resolution.supported=false 清空契约分辨率集合', () => {
    const lc = resolveLineConstraints('minimax-h3', COMFYUI_ROUTING, null);
    assert.equal(lc.parameters?.resolution?.supported, false);

    const group = resolveModelChannelGroups('minimax-h3', null).find((g) => g.id === 'comfyui');
    assert.ok(group, 'comfyui group must exist');
    const contract = buildChannelContract('minimax-h3', group);
    assert.deepEqual(contract.constraints.supportedResolutions, []);
    assert.equal(contract.constraints.defaultResolution, '');
  });

  test('TC-OPS-03: buildU06Prompt 写入 ResolutionSelector 枚举串', () => {
    const blueprint = {
      '100': { class_type: 'ResolutionSelector', inputs: { aspect_ratio: '16:9 (Landscape Widescreen)' } },
      '620': { class_type: 'UNETLoader', inputs: { unet_name: 'x.safetensors' } },
    };
    const wf = buildU06Prompt({ workflow: blueprint, prompt: 'p', aspectRatio: '9:16' });
    assert.equal(wf['100'].inputs.aspect_ratio, '9:16 (Portrait Widescreen)');
    assert.equal(U06_ASPECT_RATIO_MAP['16:9'], '16:9 (Landscape Widescreen)');
    // 未传入比例：蓝本现值保留
    const wf2 = buildU06Prompt({ workflow: blueprint, prompt: 'p' });
    assert.equal(wf2['100'].inputs.aspect_ratio, '16:9 (Landscape Widescreen)');
  });

  test('TC-OPS-04: 两处渠道组表镜像约束一致（drift 自检）', () => {
    const hubSrc = readFileSync(
      resolve(repoRoot, 'plugins/omnimux/src/catalog/serving/channel-groups.js'), 'utf8');
    const canvasSrc = readFileSync(
      resolve(repoRoot, 'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts'), 'utf8');
    assert.ok(hubSrc.includes('"supported": false'), 'hub channel-groups must declare resolution unsupported');
    assert.ok(canvasSrc.includes('"supported": false'), 'canvas channelGroups mirror must declare resolution unsupported');
  });
});
