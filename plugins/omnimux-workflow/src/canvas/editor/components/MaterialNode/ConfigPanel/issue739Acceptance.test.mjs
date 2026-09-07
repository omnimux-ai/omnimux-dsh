/**
 * Issue #739: 修复图像节点卡槽缺失及上游连线后误报『暂无兼容模型』 全面验收测试
 *
 * 验收核查重点：
 * 1. 图像节点卡槽常驻验证：
 *    - 新建、未连线、连入文本、连入图片等状态下，卡槽区域（strip 预设 + reference_image 槽位）均正常派生与渲染；
 *    - 未填入素材时渲染 44x44px 虚线加号；
 *    - 连入素材后展示缩略图卡片并保留尾部 + 添加按钮；
 *    - panel.slot.reference_image 双语词条（中/英）完整性。
 * 2. 生图模型可用性与兜底放行：
 *    - 上游连入带图素材时，即使模型目录仅声明 text_to_image，buildFilteredModelOptions 仍正确返回可用生图模型（NanoBanana 2, GPT Image 2, Midjourney 等）；
 *    - 验证 zeroCandidates: false，绝不再误报“暂无兼容模型”。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveSlotLayout,
  autoFillSlots,
} from '../../../../../shared/graph/feedSlot/index.ts';
import {
  buildFilteredModelOptions,
  buildUiUpstreamFingerprint,
} from '../../../../../shared/validation/operationUi.ts';
import zhDict from '../../../../i18n/dict.zh.ts';
import enDict from '../../../../i18n/dict.en.ts';

const here = dirname(fileURLToPath(import.meta.url));
const configPanelSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const slotWellsSrc = readFileSync(join(here, 'SlotWells/SlotWells.tsx'), 'utf8');
const themeCss = readFileSync(join(here, '../../../../theme/components.css'), 'utf8');

// 模拟生产静态目录（生图模型只有 text_to_image，没有 listed 的 image_to_image / multi_reference）
const prodCatalog = {
  source: 'static-stub',
  defaults: { image: 'nanobanana-2' },
  image: [
    { id: 'nanobanana-2', label: 'NanoBanana 2', family: 'nanobanana' },
    { id: 'gpt-image-2', label: 'GPT Image 2', family: 'openai' },
    { id: 'midjourney', label: 'Midjourney', family: 'midjourney' },
  ],
  models: [
    {
      id: 'nanobanana-2',
      label: 'NanoBanana 2',
      family: 'nanobanana',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
      ],
    },
    {
      id: 'gpt-image-2',
      label: 'GPT Image 2',
      family: 'openai',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
      ],
    },
    {
      id: 'midjourney',
      label: 'Midjourney',
      family: 'midjourney',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
      ],
    },
  ],
};

describe('Issue #739 Acceptance: 图像节点卡槽常驻验证', () => {
  it('TC-739-01: 新建状态（未选模型、未选操作），图像节点 deriveSlotLayout 兜底 strip 卡槽', () => {
    const layout = deriveSlotLayout(prodCatalog, undefined, undefined, 'image');
    assert.equal(layout.preset, 'strip', '新建状态应派生 strip 预设');
    assert.equal(layout.addButton, true, '应允许添加按钮');
    assert.equal(layout.slots.length, 1, '应有 1 个默认卡槽');
    assert.equal(layout.slots[0].slot, 'reference_image');
    assert.equal(layout.slots[0].role, 'reference');
    assert.equal(layout.slots[0].type, 'image');
    assert.equal(layout.slots[0].min, 0);
    assert.equal(layout.slots[0].max, 10);
    assert.equal(layout.slots[0].labelKey, 'panel.slot.reference_image');
  });

  it('TC-739-02: 未连线状态（已选模型 nanobanana-2，默认 text_to_image），卡槽保持常驻在线', () => {
    const layout = deriveSlotLayout(prodCatalog, 'nanobanana-2', 'text_to_image', 'image');
    assert.equal(layout.preset, 'strip');
    assert.equal(layout.addButton, true);
    assert.ok(layout.slots.length >= 1);
    assert.equal(layout.slots[0].slot, 'reference_image');
  });

  it('TC-739-03: 连入纯文本状态，图像节点卡槽依然常驻', () => {
    // 文本上游不产生图像资产，deriveSlotLayout 依然返回 strip
    const layout = deriveSlotLayout(prodCatalog, 'nanobanana-2', 'text_to_image', 'image');
    assert.equal(layout.preset, 'strip');
    assert.equal(layout.addButton, true);
    assert.equal(layout.slots[0].slot, 'reference_image');
  });

  it('TC-739-04: 连入图片素材后，autoFillSlots 成功入槽，并保留尾部 + 添加按钮', () => {
    const layout = deriveSlotLayout(prodCatalog, 'nanobanana-2', 'text_to_image', 'image');
    const imageFeedAssets = [
      {
        edgeId: 'edge-1',
        sourceNodeId: 'node-upstream-1',
        outputId: 'out-1',
        type: 'image',
        ordinal: 0,
        availability: 'ready',
        url: 'https://example.com/test-ref.png',
      },
    ];
    const fillResult = autoFillSlots(imageFeedAssets, layout);
    const occupants = fillResult.bindings['reference_image'] ?? fillResult.bindings['reference'] ?? [];
    assert.equal(occupants.length, 1, '上游图片应成功入槽');
    assert.equal(occupants[0].edgeId, 'edge-1');

    // 检查尾部加号保留条件：layout.addButton === true 且 filled (1) < max (10)
    assert.equal(layout.addButton, true);
    assert.ok(occupants.length < (layout.slots[0].max ?? 10), '未达到最大卡槽限制时应可继续添加');
  });

  it('TC-739-05: ConfigPanel 中双重兜底保证图像节点卡槽绝对不为 none', () => {
    // 验证 ConfigPanel/index.tsx 源码中存在针对 materialType === "image" 的 effectiveSlotLayout 兜底与常驻渲染
    assert.match(configPanelSrc, /const\s+effectiveSlotLayout\s*=\s*useMemo<SlotLayout>/);
    assert.match(configPanelSrc, /if\s*\(materialType\s*===\s*'image'\s*&&\s*\(slotLayout\.preset\s*===\s*'none'/);
    assert.match(configPanelSrc, /slot:\s*'reference_image'/);
    assert.match(configPanelSrc, /effectiveSlotLayout\.preset\s*!==\s*'none'\s*&&\s*effectiveSlotLayout\.slots\.length\s*>\s*0/);
  });

  it('TC-739-06: 视觉规格核查：44x44px 虚线加号框与样式规范', () => {
    // 检查 CSS 中卡槽与空态规范
    assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?width:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?border-radius:\s*10px;/);
    assert.match(themeCss, /\.wf-slot-well--empty\s*\{[\s\S]*?border-style:\s*dashed;/);
    assert.match(themeCss, /\.wf-slot-well--add\s*\{[\s\S]*?width:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well--add\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well--add\s*\{[\s\S]*?border:\s*1\.5px dashed/);

    // 检查 SlotWells.tsx 渲染逻辑
    assert.match(slotWellsSrc, /<Plus\s+size=\{20\}/, '加号图标尺寸应为 20');
    assert.match(slotWellsSrc, /wf-slot-well--add/, '存在尾部添加按钮');
    assert.match(slotWellsSrc, /wf-slot-well--filled/, '存在填入卡片状态');
    assert.match(slotWellsSrc, /wf-slot-well--empty/, '存在空态卡槽状态');
  });

  it('TC-739-07: panel.slot.reference_image 中英双语词条完整性', () => {
    assert.equal(zhDict['panel.slot.reference_image'], '参考图', '中文词条应为 参考图');
    assert.equal(enDict['panel.slot.reference_image'], 'Reference image', '英文词条应为 Reference image');
  });
});

describe('Issue #739 Acceptance: 生图模型可用性与兜底放行', () => {
  it('TC-739-08: 上游连入单张图片时，buildFilteredModelOptions 正确返回所有生图模型，zeroCandidates: false', () => {
    const fingerprint = buildUiUpstreamFingerprint({
      prompt: 'a scenic view',
      upstreams: [
        {
          nodeId: 'up-1',
          materialType: 'image',
          mimeType: 'image/png',
          sizeBytes: 4096,
        },
      ],
    });

    const res = buildFilteredModelOptions({
      catalog: prodCatalog,
      fingerprint,
      outputType: 'image',
    });

    assert.equal(res.catalogAvailable, true, 'catalogAvailable 应为 true');
    assert.equal(res.zeroCandidates, false, 'zeroCandidates 必须为 false，绝不再显示“暂无兼容模型”');
    assert.ok(res.options.length >= 3, '应返回至少 3 个生图模型候选');

    const modelIds = res.options.map((o) => o.id);
    assert.ok(modelIds.includes('nanobanana-2'), '必须包含 NanoBanana 2');
    assert.ok(modelIds.includes('gpt-image-2'), '必须包含 GPT Image 2');
    assert.ok(modelIds.includes('midjourney'), '必须包含 Midjourney');

    for (const opt of res.options) {
      assert.equal(opt.verdict.acceptsCurrentInputs, true, `${opt.id} acceptsCurrentInputs 应为 true`);
      assert.equal(opt.verdict.readyToSubmit, true, `${opt.id} readyToSubmit 应为 true`);
      assert.deepEqual(opt.verdict.rejections, [], `${opt.id} rejections 应为空`);
    }
  });

  it('TC-739-09: 上游连入多张图片时，依然稳定返回所有生图模型，放行通过', () => {
    const fingerprint = buildUiUpstreamFingerprint({
      prompt: 'blend images',
      upstreams: [
        { nodeId: 'up-1', materialType: 'image', mimeType: 'image/png', sizeBytes: 4096 },
        { nodeId: 'up-2', materialType: 'image', mimeType: 'image/jpeg', sizeBytes: 8192 },
        { nodeId: 'up-3', materialType: 'image', mimeType: 'image/webp', sizeBytes: 2048 },
      ],
    });

    const res = buildFilteredModelOptions({
      catalog: prodCatalog,
      fingerprint,
      outputType: 'image',
    });

    assert.equal(res.zeroCandidates, false);
    assert.ok(res.options.length >= 3);
    for (const opt of res.options) {
      assert.equal(opt.verdict.acceptsCurrentInputs, true);
    }
  });

  it('TC-739-10: 隔离安全性：非图像类型（如视频节点不兼容输入）不会被生图兜底意外放行', () => {
    const fingerprintWithAudioOnly = buildUiUpstreamFingerprint({
      prompt: 'video from audio',
      upstreams: [
        { nodeId: 'up-audio', materialType: 'audio', mimeType: 'audio/mp3', sizeBytes: 1024 },
      ],
    });

    // 视频目录中的纯文本生成视频模型（不支持单独音频连入）
    const videoCatalog = {
      source: 'static-stub',
      models: [
        {
          id: 'video-model',
          label: 'Video Model',
          operations: [
            { id: 'text_to_video', listed: true, output: { type: 'video' }, inputs: [] },
          ],
        },
      ],
    };

    const res = buildFilteredModelOptions({
      catalog: videoCatalog,
      fingerprint: fingerprintWithAudioOnly,
      outputType: 'video',
    });

    // 视频节点连入不支持的纯音频时，应维持严格校验，不应发生不当兜底放行
    assert.equal(res.zeroCandidates, true, '视频节点连入不兼容音频输入时应正确识别零候选');
    assert.equal(res.options.length, 0);
  });
});
