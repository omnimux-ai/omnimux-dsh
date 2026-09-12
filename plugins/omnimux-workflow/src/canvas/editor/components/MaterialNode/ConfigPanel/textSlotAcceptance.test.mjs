/**
 * 文本生成节点多模态卡槽机制与空态高度优化 专项验收测试 (QA Acceptance)
 *
 * 验收目标：
 * 场景 1：多模态模型（如 Gemini 3.8 Flash、Claude Opus 4.6、GPT-5.5），空态未连线时，卡槽能正确展示（strip 预设，包含参考图槽位，虚线加号框，addButton=true）；
 * 场景 2：纯文本模型（如 DeepSeek V4 Pro、Claude Opus 5、GLM-5.3），卡槽不展示（none 预设），且 prompt-header 容器带有 empty-slots 类名，消除 44px 死高；
 * 场景 3：连入素材后，卡槽装填与操作升迁机制正常；
 * 场景 4：中英文国际化词条完整且无缺失。
 * 场景 5：DOM / 组件渲染及样式端到端回归校验。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import {
  deriveSlotLayout,
  autoFillSlots,
} from '../../../../../shared/graph/feedSlot/index.ts';
import {
  buildContractView,
  resolveModelView,
  bindableSlots,
} from '../../../../../shared/validation/compatKernel.ts';
import {
  resolveCanvasSubmission,
  resolveExecutorSubmission,
} from '../../../../../workflow/seam/submitGuard.ts';
import zhDict from '../../../../i18n/dict.zh.ts';
import enDict from '../../../../i18n/dict.en.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../../..');
const configPanelSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const themeCss = readFileSync(join(here, '../../../../theme/components.css'), 'utf8');

// 构造模拟的真实生产多模态与纯文本模型 Catalog
const mockCatalog = {
  source: 'omnimux',
  text: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', family: 'google' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', family: 'anthropic' },
    { id: 'gpt-5.5', label: 'GPT-5.5', family: 'openai' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', family: 'deepseek' },
    { id: 'claude-opus-5', label: 'Claude Opus 5', family: 'anthropic' },
    { id: 'glm-5.3', label: 'GLM-5.3', family: 'zhipu' },
  ],
  models: [
    // 多模态模型 1：支持图片 + 视频
    {
      id: 'gemini-3.8-flash',
      label: 'Gemini 3.8 Flash',
      family: 'google',
      operations: [
        {
          id: 'chat',
          listed: true,
          output: { type: 'text' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }],
        },
        {
          id: 'vision_chat',
          listed: true,
          output: { type: 'text' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' },
            {
              slot: 'reference_images',
              type: 'image',
              role: 'reference',
              source: 'upstream_edge',
              min: 0,
              max: 10,
              allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
            },
            {
              slot: 'reference_videos',
              type: 'video',
              role: 'reference',
              source: 'upstream_edge',
              min: 0,
              max: 3,
              allowedMimes: ['video/mp4'],
            },
          ],
        },
      ],
    },
    // 多模态模型 2：仅支持图片 (Claude Opus 4.6)
    {
      id: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      family: 'anthropic',
      operations: [
        {
          id: 'chat',
          listed: true,
          output: { type: 'text' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }],
        },
        {
          id: 'vision_chat',
          listed: true,
          output: { type: 'text' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' },
            {
              slot: 'reference_images',
              type: 'image',
              role: 'reference',
              source: 'upstream_edge',
              min: 0,
              max: 10,
              allowedMimes: ['image/png', 'image/jpeg'],
            },
          ],
        },
      ],
    },
    // 多模态模型 3：仅支持图片 (GPT-5.5)
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      family: 'openai',
      operations: [
        {
          id: 'chat',
          listed: true,
          output: { type: 'text' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }],
        },
        {
          id: 'vision_chat',
          listed: true,
          output: { type: 'text' },
          inputs: [
            { slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' },
            {
              slot: 'reference_images',
              type: 'image',
              role: 'reference',
              source: 'upstream_edge',
              min: 0,
              max: 10,
              allowedMimes: ['image/png', 'image/jpeg'],
            },
          ],
        },
      ],
    },
    // 纯文本模型 1：DeepSeek V4 Pro
    {
      id: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      family: 'deepseek',
      operations: [
        {
          id: 'chat',
          listed: true,
          output: { type: 'text' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }],
        },
      ],
    },
    // 纯文本模型 2：Claude Opus 5
    {
      id: 'claude-opus-5',
      label: 'Claude Opus 5',
      family: 'anthropic',
      operations: [
        {
          id: 'chat',
          listed: true,
          output: { type: 'text' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }],
        },
      ],
    },
    // 纯文本模型 3：GLM-5.3
    {
      id: 'glm-5.3',
      label: 'GLM-5.3',
      family: 'zhipu',
      operations: [
        {
          id: 'chat',
          listed: true,
          output: { type: 'text' },
          inputs: [{ slot: 'prompt', type: 'text', role: 'prompt', source: 'node_field' }],
        },
      ],
    },
  ],
};

describe('场景 1 验收：多模态模型空态未连线时正确展示卡槽（strip 预设 + addButton=true）', () => {
  it('TC-T01-01: Gemini 3.8 Flash 在空态未连线、默认 chat 模式下自动派生 strip 预设与多媒体槽位', () => {
    // 默认空态未连线：operationId 为 'chat' 或 undefined
    const layoutChat = deriveSlotLayout(mockCatalog, 'gemini-3.8-flash', 'chat', 'text');
    assert.equal(layoutChat.preset, 'strip', '多模态模型必须派生 strip 预设');
    assert.equal(layoutChat.addButton, true, '应允许添加素材（addButton: true）');
    assert.equal(layoutChat.slots.length, 2, '包含 reference_images 和 reference_videos 两个槽位');
    assert.equal(layoutChat.slots[0].slot, 'reference_images');
    assert.equal(layoutChat.slots[0].type, 'image');
    assert.equal(layoutChat.slots[0].max, 10);
    assert.equal(layoutChat.slots[0].labelKey, 'panel.slot.reference_images');
    assert.equal(layoutChat.slots[1].slot, 'reference_videos');
    assert.equal(layoutChat.slots[1].type, 'video');
    assert.equal(layoutChat.slots[1].max, 3);
    assert.equal(layoutChat.slots[1].labelKey, 'panel.slot.reference_videos');

    // 未指定 operationId 时兜底
    const layoutUnspec = deriveSlotLayout(mockCatalog, 'gemini-3.8-flash', undefined, 'text');
    assert.equal(layoutUnspec.preset, 'strip');
    assert.equal(layoutUnspec.addButton, true);
    assert.equal(layoutUnspec.slots.length, 2);
  });

  it('TC-T01-02: Claude Opus 4.6 与 GPT-5.5 在未连线时正确派生 strip 预设与参考图槽位', () => {
    const claudeLayout = deriveSlotLayout(mockCatalog, 'claude-opus-4-6', 'chat', 'text');
    assert.equal(claudeLayout.preset, 'strip');
    assert.equal(claudeLayout.addButton, true);
    assert.equal(claudeLayout.slots.length, 1);
    assert.equal(claudeLayout.slots[0].slot, 'reference_images');
    assert.equal(claudeLayout.slots[0].type, 'image');
    assert.equal(claudeLayout.slots[0].labelKey, 'panel.slot.reference_images');

    const gptLayout = deriveSlotLayout(mockCatalog, 'gpt-5.5', 'chat', 'text');
    assert.equal(gptLayout.preset, 'strip');
    assert.equal(gptLayout.addButton, true);
    assert.equal(gptLayout.slots.length, 1);
    assert.equal(gptLayout.slots[0].slot, 'reference_images');
    assert.equal(gptLayout.slots[0].type, 'image');
  });

  it('TC-T01-03: ConfigPanel 源码防线保证多模态文本模型卡槽兜底成立且 hasSlots 为 true', () => {
    // 检查 ConfigPanel 中针对 materialType === 'text' 的模型多模态感知逻辑
    assert.match(configPanelSrc, /if\s*\(materialType\s*===\s*'text'\)\s*\{/);
    assert.match(configPanelSrc, /const\s+contractView\s*=\s*buildContractView\(activeCatalog\);/);
    assert.match(configPanelSrc, /const\s+model\s*=\s*resolveModelView\(contractView,\s*modelValue\);/);
    assert.match(configPanelSrc, /const\s+isMultimodal\s*=\s*model\?\.operations\.some/);
    assert.match(configPanelSrc, /slot:\s*'reference_images'/);
    assert.match(configPanelSrc, /const\s+hasSlots\s*=\s*effectiveSlotLayout\.preset\s*!==\s*'none'\s*&&\s*effectiveSlotLayout\.slots\.length\s*>\s*0;/);
  });
});

describe('场景 2 验收：纯文本模型卡槽不展示（none 预设），消除 44px 死高', () => {
  it('TC-T02-01: DeepSeek V4 Pro、Claude Opus 5、GLM-5.3 派生 none 预设且无卡槽', () => {
    for (const modelId of ['deepseek-v4-pro', 'claude-opus-5', 'glm-5.3']) {
      const layout = deriveSlotLayout(mockCatalog, modelId, 'chat', 'text');
      assert.equal(layout.preset, 'none', `${modelId} 纯文本模型预设必须为 none`);
      assert.equal(layout.slots.length, 0, `${modelId} 纯文本模型槽位数组必须为空`);
      assert.equal(layout.addButton, false, `${modelId} 纯文本模型 addButton 必须为 false`);

      const unspec = deriveSlotLayout(mockCatalog, modelId, undefined, 'text');
      assert.equal(unspec.preset, 'none', `${modelId} 未指定操作时预设必须为 none`);
      assert.equal(unspec.slots.length, 0);
    }
  });

  it('TC-T02-02: ConfigPanel 对纯文本模型追加 wf-config-panel__prompt-header--empty-slots 且不渲染空 span', () => {
    // 验证类名拼接逻辑
    assert.match(
      configPanelSrc,
      /className=\{\`wf-config-panel__prompt-header\$\{\!hasSlots \? ' wf-config-panel__prompt-header--empty-slots' : ''\}\`\}/,
    );
    // 验证当 !hasSlots 时不渲染 SlotWells，且不再渲染旧版的多余 <span /> 标签
    assert.match(configPanelSrc, /\{hasSlots\s*&&\s*\(\s*<SlotWells/);
    assert.doesNotMatch(configPanelSrc, /<SlotWells[\s\S]*?\)\s*:\s*\(\s*<span\s*\/>\s*\)/);
  });

  it('TC-T02-03: CSS 规范核查：empty-slots 自适应高度 24px，消除 44px 强制留白', () => {
    // 默认 prompt-header 高度为 44px
    assert.match(themeCss, /\.wf-config-panel__prompt-header\s*\{[\s\S]*?min-height:\s*44px;/);
    // empty-slots 覆盖为 24px，紧凑对齐
    assert.match(themeCss, /\.wf-config-panel__prompt-header--empty-slots\s*\{[\s\S]*?min-height:\s*24px;/);
    assert.match(themeCss, /\.wf-config-panel__prompt-header--empty-slots\s*\{[\s\S]*?margin-bottom:\s*4px;/);
    assert.match(themeCss, /\.wf-config-panel__prompt-header--empty-slots\s*\{[\s\S]*?justify-content:\s*flex-end;/);
  });
});

describe('场景 3 验收：连入素材后卡槽装填与操作升迁机制正常', () => {
  it('TC-T03-01: 多模态模型连入单张图片素材，autoFillSlots 成功装填 reference_images 并保留加号', () => {
    const layout = deriveSlotLayout(mockCatalog, 'gemini-3.8-flash', 'chat', 'text');
    const imageFeed = [
      {
        edgeId: 'edge-img-1',
        sourceNodeId: 'node-image-1',
        outputId: 'out-1',
        type: 'image',
        ordinal: 0,
        availability: 'ready',
        url: 'https://example.com/ref1.png',
      },
    ];

    const fillResult = autoFillSlots(imageFeed, layout);
    const occupants = fillResult.bindings['reference_images'] ?? [];
    assert.equal(occupants.length, 1, '图片素材应成功填入 reference_images 槽位');
    assert.equal(occupants[0].edgeId, 'edge-img-1');
    assert.equal(occupants[0].sourceNodeId, 'node-image-1');

    // 检查卡槽容量与尾部加号：1 < max(10)，且 addButton 为 true
    assert.equal(layout.addButton, true);
    assert.ok(occupants.length < layout.slots[0].max);
  });

  it('TC-T03-02: 多模态模型连入多张图片与视频，分别匹配各自槽位', () => {
    const layout = deriveSlotLayout(mockCatalog, 'gemini-3.8-flash', 'chat', 'text');
    const multiFeed = [
      { edgeId: 'edge-1', sourceNodeId: 'img-1', type: 'image', ordinal: 0, availability: 'ready' },
      { edgeId: 'edge-2', sourceNodeId: 'img-2', type: 'image', ordinal: 1, availability: 'ready' },
      { edgeId: 'edge-3', sourceNodeId: 'vid-1', type: 'video', ordinal: 2, availability: 'ready' },
    ];

    const fillResult = autoFillSlots(multiFeed, layout);
    const imgOccupants = fillResult.bindings['reference_images'] ?? [];
    const vidOccupants = fillResult.bindings['reference_videos'] ?? [];

    assert.equal(imgOccupants.length, 2, '两张图片应填入 reference_images');
    assert.equal(vidOccupants.length, 1, '视频应填入 reference_videos');
  });

  it('TC-T03-03: 提交阶段操作自动升迁：连入图片素材时由 chat 自动升迁为 vision_chat', () => {
    const textNodeWithImageRef = {
      capability: 'text',
      model: 'gpt-5.5',
      prompt: '请根据图片内容进行分析',
      references: [
        {
          type: 'image',
          pathOrUrl: 'https://example.test/input.png',
          targetSlot: 'reference_images',
        },
      ],
    };

    // 当 operation 省略未显式指定时，resolveExecutorSubmission 依据连入素材自动推断为 vision_chat
    const submission = resolveExecutorSubmission(textNodeWithImageRef, mockCatalog);
    assert.equal(
      submission.operation,
      'vision_chat',
      '连入参考图素材后，操作必须升迁为 vision_chat，防止素材被丢弃',
    );
  });

  it('TC-T03-04: 无素材连入时保持 chat 模式，不发生误升迁', () => {
    const pureTextNode = {
      capability: 'text',
      model: 'gpt-5.5',
      prompt: '你好，请写一首诗',
      references: [],
    };

    const submission = resolveExecutorSubmission(pureTextNode, mockCatalog);
    assert.equal(submission.operation, 'chat', '无素材时保持 chat 操作');
  });
});

describe('场景 4 验收：中英文国际化词条完整性与字典对照', () => {
  it('TC-T04-01: 中英双语 panel.slot.reference_images 词条均已定义且准确', () => {
    assert.ok(zhDict['panel.slot.reference_images'], '中文字典必须包含 panel.slot.reference_images');
    assert.ok(enDict['panel.slot.reference_images'], '英文字典必须包含 panel.slot.reference_images');
    assert.equal(zhDict['panel.slot.reference_images'], '参考图');
    assert.equal(enDict['panel.slot.reference_images'], 'Reference images');
  });

  it('TC-T04-02: 中英双语 panel.slot.reference_videos 词条均已定义且准确', () => {
    assert.ok(zhDict['panel.slot.reference_videos'], '中文字典必须包含 panel.slot.reference_videos');
    assert.ok(enDict['panel.slot.reference_videos'], '英文字典必须包含 panel.slot.reference_videos');
    assert.equal(zhDict['panel.slot.reference_videos'], '参考视频');
    assert.equal(enDict['panel.slot.reference_videos'], 'Reference videos');
  });

  it('TC-T04-03: 所有 slot 相关的双语词条均对称映射，无 undefined 或空字符串', () => {
    const slotKeys = [
      'panel.slot.reference_image',
      'panel.slot.reference_images',
      'panel.slot.reference_audio',
      'panel.slot.reference_videos',
      'panel.slot.first_frame',
      'panel.slot.last_frame',
      'panel.slot.character',
      'panel.slot.driving_audio',
    ];
    for (const key of slotKeys) {
      assert.ok(zhDict[key] && typeof zhDict[key] === 'string' && zhDict[key].trim().length > 0, `zhDict[${key}] 必须有效`);
      assert.ok(enDict[key] && typeof enDict[key] === 'string' && enDict[key].trim().length > 0, `enDict[${key}] 必须有效`);
    }
  });
});

describe('场景 5 验收：DOM 渲染与交互表现端到端验证', async () => {
  // 利用 esbuild 编译 SlotWells 并以 React renderToStaticMarkup 验证组件实际 HTML 输出
  const buildResult = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import SlotWells from ${JSON.stringify(resolve(here, 'SlotWells/SlotWells.tsx'))};
        export const renderSlotWells = (props) => renderToStaticMarkup(React.createElement(SlotWells, props));
      `,
      resolveDir: root,
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    logLevel: 'silent',
    nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
    plugins: [
      {
        name: 'slot-i18n-mock',
        setup(b) {
          b.onResolve({ filter: /\/i18n$/ }, () => ({ path: 'i18n', namespace: 'slot-test' }));
          b.onLoad({ filter: /.*/, namespace: 'slot-test' }, () => ({
            contents: `
              import zh from ${JSON.stringify(resolve(root, 'src/canvas/i18n/dict.zh.ts'))};
              export const useT = () => (key) => zh[key] ?? key;
            `,
            loader: 'ts',
            resolveDir: root,
          }));
        },
      },
    ],
  });

  const mod = { exports: {} };
  new Function('require', 'module', 'exports', buildResult.outputFiles[0].text)(
    createRequire(import.meta.url),
    mod,
    mod.exports,
  );
  const { renderSlotWells } = mod.exports;

  it('TC-T05-01: 多模态文本模型空态时，SlotWells 渲染出虚线加号框 wf-slot-well--append', () => {
    const layout = deriveSlotLayout(mockCatalog, 'gemini-3.8-flash', 'chat', 'text');
    const html = renderSlotWells({
      layout,
      bindings: {},
      conflicts: [],
      upstreams: [],
      onPickSlot() {},
      onSwapSlots() {},
      onClearOccupant() {},
      onInsertToken() {},
    });

    // 空态下必须呈现添加按钮（44x44px 虚线加号框）
    assert.match(html, /wf-slot-wells/);
    assert.match(html, /wf-slot-well--append/);
    assert.doesNotMatch(html, /data-slot-state="filled"/);
  });

  it('TC-T05-02: 连入素材后，SlotWells 渲染已填入卡片 data-slot-state="filled" 并保留尾部添加按钮', () => {
    const layout = deriveSlotLayout(mockCatalog, 'gemini-3.8-flash', 'chat', 'text');
    const html = renderSlotWells({
      layout,
      bindings: {
        reference_images: [{ edgeId: 'edge-1', sourceNodeId: 'img-node-1' }],
      },
      conflicts: [],
      upstreams: [
        {
          edgeId: 'edge-1',
          nodeId: 'img-node-1',
          label: 'scene.png',
          materialType: 'image',
          availability: 'ready',
          hasMedia: true,
          url: 'https://example.test/scene.png',
        },
      ],
      onPickSlot() {},
      onSwapSlots() {},
      onClearOccupant() {},
      onInsertToken() {},
    });

    assert.match(html, /data-slot-state="filled"/);
    assert.match(html, /src="https:\/\/example\.test\/scene\.png"/);
    assert.match(html, /aria-label="scene\.png"/);
    // 因为 max 为 10，已填入 1，所以尾部添加加号框依然保留
    assert.match(html, /wf-slot-well--append/);
  });
});
