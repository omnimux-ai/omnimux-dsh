/**
 * Issue #739: 修复图像节点卡槽缺失及上游连线后误报『暂无兼容模型』 全面验收测试
 *
 * 验收核查重点：
 * 1. 图像槽精确契约验证（#1760）：
 *    - 未选操作或所选操作不声明媒体时不造槽；合法媒体槽按声明容量派生与装填；
 *    - 未填入素材时渲染 44x44px 虚线加号；
 *    - 连入素材后展示缩略图卡片并保留尾部 + 添加按钮；
 *    - panel.slot.reference_image 双语词条（中/英）完整性。
 * 2. 生图模型可用性与严格契约（Issue #1783）：
 *    - 仅声明 text_to_image 的目录不能接收上游图片，卡槽常驻不等于模型可提交；
 *    - 已上架、输出为 image 且实际接受当前输入的操作仍可选；错输出或未上架操作不得补位。
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
    { id: 'gpt-image-2.5', label: 'GPT Image 2.5', family: 'openai' },
    { id: 'nano-banana-pro', label: 'Nano Banana Pro', family: 'google' },
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
      id: 'gpt-image-2.5',
      label: 'GPT Image 2.5',
      family: 'openai',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
      ],
    },
    {
      id: 'nano-banana-pro',
      label: 'Nano Banana Pro',
      family: 'google',
      operations: [
        { id: 'text_to_image', listed: true, output: { type: 'image' }, inputs: [] },
      ],
    },
  ],
};

describe('Issue #739/#1760 Acceptance: 图像槽严格来自所选操作', () => {
  it('TC-739-01: 未选模型/操作时不伪造图片槽', () => {
    const layout = deriveSlotLayout(prodCatalog, undefined, undefined, 'image');
    assert.equal(layout.preset, 'none');
    assert.equal(layout.addButton, false);
    assert.deepEqual(layout.slots, [], '未选模型/操作不能合成 max10 图片槽');
  });

  it('TC-739-02: 所选 text_to_image 未声明媒体输入时无图片槽', () => {
    const layout = deriveSlotLayout(prodCatalog, 'nanobanana-2', 'text_to_image', 'image');
    assert.equal(layout.preset, 'none');
    assert.equal(layout.addButton, false);
    assert.deepEqual(layout.slots, []);
  });

  it('TC-739-03: 纯文本供给不会制造媒体槽或媒体绑定', () => {
    const layout = deriveSlotLayout(prodCatalog, 'nanobanana-2', 'text_to_image', 'image');
    const result = autoFillSlots([{edgeId:'text-1',sourceNodeId:'text',type:'text',ordinal:0,availability:'ready'}], layout);
    assert.equal(layout.preset, 'none');
    assert.equal(layout.addButton, false);
    assert.deepEqual(result.bindings, {});
  });

  it('TC-739-04: 连入图片素材后，autoFillSlots 成功入槽，并保留尾部 + 添加按钮', () => {
    const catalog = structuredClone(prodCatalog);
    catalog.models[0].operations[0].inputs = [{slot:'reference_image',type:'image',role:'reference',source:'upstream_edge',min:0,max:2}];
    const layout = deriveSlotLayout(catalog, 'nanobanana-2', 'text_to_image', 'image');
    assert.equal(layout.slots[0].max, 2);
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

  it('TC-739-05: 不借其他操作槽、不合成未知容量、未列出操作不放行', () => {
    const catalog = structuredClone(prodCatalog);
    catalog.models[0].operations.push({id:'image_to_image',listed:true,output:{type:'image'},inputs:[{slot:'reference_image',type:'image',source:'upstream_edge',role:'reference',min:0,max:null}]});
    assert.deepEqual(deriveSlotLayout(catalog, 'nanobanana-2', 'text_to_image', 'image').slots, []);
    const selected = deriveSlotLayout(catalog, 'nanobanana-2', 'image_to_image', 'image');
    assert.equal(selected.slots[0].max, null, '未知容量不能改成10');
    assert.equal(selected.slots[0].slot, 'reference_image');
    catalog.models[0].operations[1].listed = false;
    assert.deepEqual(deriveSlotLayout(catalog, 'nanobanana-2', 'image_to_image', 'image').slots, []);
  });

  it('TC-739-06: 视觉规格核查：44x44px 虚线加号框与样式规范', () => {
    // 检查 CSS 中卡槽与空态规范
    assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?width:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?border-radius:\s*10px;/);
    assert.match(themeCss, /\.wf-slot-well--empty\s*\{[\s\S]*?border-style:\s*dashed;/);
    assert.match(themeCss, /\.wf-slot-well--append\s*\{[\s\S]*?width:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well--append\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well--append\s*\{[\s\S]*?border:\s*1\.5px dashed/);

    // 检查 SlotWells.tsx 渲染逻辑
    assert.match(slotWellsSrc, /<Plus\s+size=\{20\}/, '加号图标尺寸应为 20');
    assert.match(slotWellsSrc, /wf-slot-well--append/, '存在尾部添加按钮');
    assert.match(slotWellsSrc, /wf-slot-well--filled/, '存在填入卡片状态');
    assert.match(slotWellsSrc, /wf-slot-well--empty/, '存在空态卡槽状态');
  });

  it('TC-739-07: panel.slot.reference_image 中英双语词条完整性', () => {
    assert.equal(zhDict['panel.slot.reference_image'], '参考图', '中文词条应为 参考图');
    assert.equal(enDict['panel.slot.reference_image'], 'Reference image', '英文词条应为 Reference image');
  });
});

describe('Issue #739/#1783 Acceptance: 生图模型严格兼容边界', () => {
  it('TC-739-08: 上游单张图片不能由纯文生图操作兜底放行', () => {
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
    assert.equal(res.zeroCandidates, true, '没有接受图片的操作时必须报告零候选');
    assert.deepEqual(res.options, [], '不得把 text_to_image 伪装为图片输入兼容');
  });

  it('TC-739-09: 上游多张图片不能由纯文生图操作兜底放行', () => {
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

    assert.equal(res.catalogAvailable, true);
    assert.equal(res.zeroCandidates, true);
    assert.deepEqual(res.options, [], '多图不能由不接受媒体的操作兜底放行');
  });

  it('合法纯文本输入仍可使用原目录中的文生图操作', () => {
    const result = buildFilteredModelOptions({
      catalog: prodCatalog,
      fingerprint: buildUiUpstreamFingerprint({ prompt: 'a scenic view', upstreams: [] }),
      outputType: 'image',
    });
    assert.equal(result.zeroCandidates, false);
    assert.deepEqual(result.options.map((option) => option.id).sort(), prodCatalog.image.map((row) => row.id).sort());
    for (const { verdict } of result.options) {
      assert.equal(verdict.chosenOperationId, 'text_to_image');
      assert.equal(verdict.readyToSubmit, true);
    }
  });

  for (const count of [1, 3]) {
    it(`合法参考图操作接收 ${count} 张图片，错输出及未上架操作严格排除`, () => {
      const inputs = [
        { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field', min: 1, max: 1 },
        { slot: 'reference_images', type: 'image', role: 'reference', source: 'upstream_edge', min: 1, max: 3,
          allowedMimes: ['image/png', 'image/jpeg', 'image/webp'] },
      ];
      const operationId = 'image_to_image';
      const models = [
        { id: 'fixture-image-ref', operations: [{ id: operationId, listed: true, output: { type: 'image' }, inputs }] },
        { id: 'fixture-unlisted', operations: [{ id: operationId, listed: false, output: { type: 'image' }, inputs }] },
        { id: 'fixture-wrong-output', operations: [{ id: operationId, listed: true, output: { type: 'video' }, inputs }] },
      ];
      const catalog = {
        ...prodCatalog,
        models: [...prodCatalog.models, ...models],
        image: [...prodCatalog.image, ...models.map(({ id }) => ({ id, label: id }))],
      };
      const fingerprint = buildUiUpstreamFingerprint({
        prompt: 'blend images',
        upstreams: ['image/png', 'image/jpeg', 'image/webp'].slice(0, count).map((mimeType, index) => ({
          nodeId: `up-${index}`, materialType: 'image', mimeType, sizeBytes: 1024,
        })),
      });
      const snapshot = structuredClone(fingerprint);
      const result = buildFilteredModelOptions({ catalog, fingerprint, outputType: 'image' });
      assert.equal(result.zeroCandidates, false);
      assert.deepEqual(result.options.map((option) => option.id), ['fixture-image-ref']);
      const verdict = result.options[0].verdict;
      assert.equal(verdict.chosenOperationId, operationId);
      assert.equal(verdict.acceptsCurrentInputs, true);
      assert.equal(verdict.readyToSubmit, true);
      assert.deepEqual(verdict.rejections, []);
      assert.deepEqual(fingerprint, snapshot, '筛选不得丢弃或改写上游输入');
    });
  }

  it('TC-739-10: 视频目录存在时仍拒绝不兼容音频输入', () => {
    const fingerprintWithAudioOnly = buildUiUpstreamFingerprint({
      prompt: 'video from audio',
      upstreams: [
        { nodeId: 'up-audio', materialType: 'audio', mimeType: 'audio/mp3', sizeBytes: 1024 },
      ],
    });

    // 视频目录中的纯文本生成视频模型（不支持单独音频连入）
    const videoCatalog = {
      source: 'static-stub',
      video: [{ id: 'video-model', label: 'Video Model' }],
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
