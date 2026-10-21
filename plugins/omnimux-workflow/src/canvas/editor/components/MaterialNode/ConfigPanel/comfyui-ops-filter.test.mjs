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

describe('线路约束收窄（2026-10-21 网关对账后）', () => {
  test('TC-OPS-01: operations 约束把模型操作收窄到线路允许项', () => {
    // H3/ComfyUI 专线已下架（模型只登记不上架），这里直接验证线路契约的收窄机制。
    const lc = { operations: ['video_multi_ref'] };

    const model = {
      operations: [
        { id: 'text_to_video', listed: true },
        { id: 'video_multi_ref', listed: true },
        { id: 'digital_human', listed: true },
      ],
      parameters: {},
    };
    const narrowed = narrowModelByLineConstraints(model, 'seedance-2-5', lc);
    assert.deepEqual(narrowed.operations.map((op) => op.id), ['video_multi_ref']);
    // 旧 comfyui 路由不再为 H3 产生任何约束或渠道池。
    assert.deepEqual(resolveLineConstraints('minimax-h3', COMFYUI_ROUTING, null), {});
    assert.deepEqual(resolveModelChannelGroups('minimax-h3', null), []);
  });

  test('TC-OPS-02: resolution.supported=false 清空契约分辨率集合', () => {
    // 线路显式声明不支持 resolution 时，契约分辨率集合与默认值必须整体清空。
    const group = {
      id: 'comfyui',
      label: 'ComfyUI',
      enabled: true,
      constraints: { parameters: { resolution: { supported: false } } },
    };
    const contract = buildChannelContract('seedance-2-5', group);
    assert.deepEqual(contract.constraints.supportedResolutions, []);
    assert.equal(contract.constraints.defaultResolution, '');

    // 现售官方线路 gpt-image-2.5 标准版把分辨率固定为 1K，同样的机制必须生效。
    const standardGroup = resolveModelChannelGroups('gpt-image-2.5', null).find((g) => g.id === 'standard');
    assert.ok(standardGroup, 'gpt-image-2.5 standard group must exist');
    const imageContract = buildChannelContract('gpt-image-2.5', standardGroup);
    assert.deepEqual(imageContract.constraints.supportedResolutions, ['1K']);
    assert.equal(imageContract.constraints.defaultResolution, '1K');
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
    assert.ok(hubSrc.includes('"supported": false'), 'hub channel-groups must declare the quality parameter unsupported');
    assert.ok(canvasSrc.includes('"supported": false'), 'canvas channelGroups mirror must declare the quality parameter unsupported');
    assert.ok(hubSrc.includes('"wireGroup": "gpt-image-2.5-economy"'), 'hub must expose the gpt-image-2.5 economy line');
    assert.ok(canvasSrc.includes('"wireGroup": "gpt-image-2.5-economy"'), 'canvas mirror must expose the gpt-image-2.5 economy line');
  });
});
