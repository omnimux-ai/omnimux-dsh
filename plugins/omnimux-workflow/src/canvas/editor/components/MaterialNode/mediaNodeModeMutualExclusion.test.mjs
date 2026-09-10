/**
 * 多模态媒体节点（图片/视频/音频）本地导入与模型生成模式排他性契约测试：
 * 1. 空状态下支持本地导入（顶部胶囊与卡片空态）或输入 Prompt 生成；
 * 2. 本地素材导入后，节点显式标记为 import 类型（nodeKind='import'），自动关闭并隐藏模型生成面板；
 * 3. 工作流调度执行时，已导入的媒体素材走 material:import 静态透传，绝不触发模型生成；
 * 4. 清空/删除素材后恢复到空状态，重新复位为 generate 模式，选中时重新展示生成面板；
 * 5. 源码契约校验：顶部胶囊栏完整覆盖图片、视频、音频三种媒体的导入与清空动作。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveNodeKind } from '../../../../shared/graph/materialNode.ts';
import { isConfigPanelVisible } from '../../utils/nodeVisualMath.ts';
import {
  isEmptyMediaGenerateNode,
  buildEmptyMediaPillActionSpec,
  EMPTY_IMAGE_PILL_ACTION_ID,
  EMPTY_VIDEO_PILL_ACTION_ID,
  EMPTY_AUDIO_PILL_ACTION_ID,
} from '../../utils/nodeToolbarLogic.ts';
import { resolveExecutorKey } from '../../../../workflow/execution/nodeExecutors.ts';

const here = dirname(fileURLToPath(import.meta.url));
const materialNodeSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const nodeEmptyStateSrc = readFileSync(join(here, 'NodeEmptyState.tsx'), 'utf8');

test('TC-MEDIA-MUTUAL-01: resolveNodeKind 多模态节点导入与生成模式身份判别', () => {
  const mediaTypes = ['image', 'video', 'audio'];

  for (const materialType of mediaTypes) {
    // 1. 空状态下为 generate 模式
    assert.equal(
      resolveNodeKind({ materialType, nodeKind: 'generate' }),
      'generate',
      `${materialType} 空状态默认应为 generate 模式`,
    );

    // 2. 本地导入后显式标记为 import 模式
    assert.equal(
      resolveNodeKind({
        materialType,
        nodeKind: 'import',
        selectedTool: 'import',
        mediaUrl: `http://localhost/test.${materialType === 'video' ? 'mp4' : materialType === 'audio' ? 'mp3' : 'png'}`,
      }),
      'import',
      `${materialType} 导入后应为 import 模式`,
    );

    // 3. 即使节点残留 prompt，显式 import 身份依然具有绝对优先级（Identity beats residue）
    assert.equal(
      resolveNodeKind({
        materialType,
        nodeKind: 'import',
        prompt: '一段遗留的历史提示词',
      }),
      'import',
      `${materialType} 具有 import 身份时绝不因残留 prompt 误判为 generate`,
    );

    // 4. 清空素材恢复为空状态后，复位为 generate 模式
    assert.equal(
      resolveNodeKind({
        materialType,
        nodeKind: 'generate',
        mediaUrl: undefined,
        previewUrl: undefined,
      }),
      'generate',
      `${materialType} 清空后应恢复为 generate 模式`,
    );
  }
});

test('TC-MEDIA-MUTUAL-02: isConfigPanelVisible 在导入模式下隐藏生成面板，清空后重新展现', () => {
  // 导入模式下：无论是否选中，生成面板均不渲染
  assert.equal(isConfigPanelVisible(true, undefined, 'import'), false);
  assert.equal(isConfigPanelVisible(false, undefined, 'import'), false);

  // 清空恢复为生成模式：选中节点时生成面板重新渲染展示
  assert.equal(isConfigPanelVisible(true, undefined, 'generate'), true);
  assert.equal(isConfigPanelVisible(false, undefined, 'generate'), false);
});

test('TC-MEDIA-MUTUAL-03: 多模态空态胶囊动作与判定规范（图/视/频均支持）', () => {
  // 1. 图片空态
  assert.equal(isEmptyMediaGenerateNode({ materialType: 'image', nodeKind: 'generate' }), true);
  assert.equal(buildEmptyMediaPillActionSpec('image').id, EMPTY_IMAGE_PILL_ACTION_ID);

  // 2. 视频空态
  assert.equal(isEmptyMediaGenerateNode({ materialType: 'video', nodeKind: 'generate' }), true);
  assert.equal(buildEmptyMediaPillActionSpec('video').id, EMPTY_VIDEO_PILL_ACTION_ID);

  // 3. 音频空态
  assert.equal(isEmptyMediaGenerateNode({ materialType: 'audio', nodeKind: 'generate' }), true);
  assert.equal(buildEmptyMediaPillActionSpec('audio').id, EMPTY_AUDIO_PILL_ACTION_ID);

  // 4. 一旦填入 mediaUrl 或 previewUrl，立刻退出空态胶囊
  assert.equal(
    isEmptyMediaGenerateNode({
      materialType: 'video',
      nodeKind: 'generate',
      mediaUrl: 'http://test.mp4',
    }),
    false,
  );
});

test('TC-MEDIA-MUTUAL-04: MaterialNode 源码中多模态空态导入、替换与清空恢复闭环契约', () => {
  // 1. 源码中通过 isEmptyMediaNode 判定图片/视频/音频空态
  assert.match(materialNodeSrc, /const isEmptyMediaNode = isEmptyMediaGenerateNode\(/);

  // 2. 空态顶部胶囊支持三种素材类型的专用 Action Key
  assert.match(materialNodeSrc, /EMPTY_VIDEO_PILL_ACTION_ID/);
  assert.match(materialNodeSrc, /EMPTY_AUDIO_PILL_ACTION_ID/);
  assert.match(materialNodeSrc, /EMPTY_IMAGE_PILL_ACTION_ID/);

  // 3. 已导入素材节点提供替换与清空操作
  assert.match(materialNodeSrc, /key:\s*'replace-media'/);
  assert.match(materialNodeSrc, /key:\s*'clear-media'/);

  // 4. 清空回调 handleClearImportedMedia 将节点复位为 generate 模式并清空媒体引用
  assert.match(materialNodeSrc, /const handleClearImportedMedia = useCallback\(/);
  assert.match(materialNodeSrc, /nodeKind:\s*'generate'/);
  assert.match(materialNodeSrc, /status:\s*'empty'/);

  // 5. NodeEmptyState 对空态多模态卡片不添加 nodrag，保障按住卡片主体正常拖拽
  assert.equal(
    /wf-node-empty--(image|video|audio)[^>]*nodrag/.test(nodeEmptyStateSrc),
    false,
    '多模态媒体卡片空态主体不得添加 nodrag 阻断节点拖动',
  );
});

test('TC-MEDIA-MUTUAL-05: 工作流执行调度契约：导入媒体节点路由至 material:import 静态透传', () => {
  const mediaTypes = ['image', 'video', 'audio'];

  for (const materialType of mediaTypes) {
    // 导入模式节点：分发至 material:import 执行器（纯静态透传，绝不触发模型生成）
    const importNode = {
      type: 'material',
      data: {
        materialType,
        nodeKind: 'import',
        selectedTool: 'import',
        mediaUrl: `http://localhost/test.${materialType === 'video' ? 'mp4' : materialType === 'audio' ? 'mp3' : 'png'}`,
      },
    };
    assert.equal(
      resolveExecutorKey(importNode),
      'material:import',
      `${materialType} 导入节点必须分发给 material:import 执行器`,
    );

    // 生成模式节点：分发至 material:generate 执行器
    const generateNode = {
      type: 'material',
      data: {
        materialType,
        nodeKind: 'generate',
        prompt: '测试提示词',
      },
    };
    assert.equal(
      resolveExecutorKey(generateNode),
      'material:generate',
      `${materialType} 生成节点必须分发给 material:generate 执行器`,
    );
  }
});

test('TC-MEDIA-MUTUAL-06: 已导入媒体节点（视频/音频）必须完整保留核心下游工具（内容拆解/分镜表/语音识别）', () => {
  // 1. 源码中 import 状态下的视频节点依然执行 canRunVideoDeconstruct 挂载拆解与分镜表，并合并 importManagementActions
  assert.match(materialNodeSrc, /canRunVideoDeconstruct/);
  assert.match(materialNodeSrc, /actions\.push\(\.\.\.importManagementActions,\s*chat\)/);

  // 2. 音频节点在挂载 speech-to-text 后同样合并 importManagementActions
  assert.match(materialNodeSrc, /canRunSpeechToText/);
});
