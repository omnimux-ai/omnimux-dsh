/**
 * 节点工具栏纯逻辑：素材判定、溢出分区、会话 payload。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PILL_MAX_WIDTH,
  EMPTY_IMAGE_PILL_ACTION_ID,
  PILL_NODE_GUTTER,
  buildConversationPayloadFromNode,
  buildEmptyImagePillActionSpec,
  hasNodeMaterial,
  isEmptyImageGenerateNode,
  partitionToolbarActions,
  pillMaxWidthForNode,
  shouldShowNodeToolbar,
} from './nodeToolbarLogic.ts';

test('hasNodeMaterial：文本空 / 空白 / 有内容 / generatedContent', () => {
  assert.equal(hasNodeMaterial({ nodeType: 'material', materialType: 'text', content: '' }), false);
  assert.equal(hasNodeMaterial({ nodeType: 'material', materialType: 'text', content: '  ' }), false);
  assert.equal(hasNodeMaterial({ nodeType: 'material', materialType: 'text', content: 'hello' }), true);
  assert.equal(
    hasNodeMaterial({ nodeType: 'material', materialType: 'text', generatedContent: 'from model' }),
    true,
  );
  assert.equal(hasNodeMaterial({ nodeType: 'text', content: 'hello' }), true);
});

test('hasNodeMaterial：媒体预览 URL / 缺失 / offline', () => {
  assert.equal(
    hasNodeMaterial({ nodeType: 'material', materialType: 'image', previewUrl: 'file://a.png' }),
    true,
  );
  assert.equal(hasNodeMaterial({ nodeType: 'material', materialType: 'image' }), false);
  assert.equal(
    hasNodeMaterial({ nodeType: 'material', materialType: 'video', previewUrl: 'file://a.mp4' }),
    true,
  );
  assert.equal(
    hasNodeMaterial({
      nodeType: 'material',
      materialType: 'audio',
      previewUrl: 'file://a.wav',
      isOffline: true,
    }),
    false,
  );
  assert.equal(
    hasNodeMaterial({ nodeType: 'material', nodeKind: 'import', previewUrl: 'file://a.png' }),
    true,
  );
  assert.equal(hasNodeMaterial({ nodeType: 'material', nodeKind: 'import' }), false);
});

test('hasNodeMaterial：表格行数 / 合成成片 / 未知类型', () => {
  assert.equal(hasNodeMaterial({ nodeType: 'table', tableRowCount: 0 }), false);
  assert.equal(hasNodeMaterial({ nodeType: 'table', tableRowCount: 3 }), true);
  assert.equal(hasNodeMaterial({ nodeType: 'video_composition' }), false);
  assert.equal(
    hasNodeMaterial({ nodeType: 'video_composition', outputVideoUrl: 'file://out.mp4' }),
    true,
  );
  assert.equal(
    hasNodeMaterial({ nodeType: 'video_composition', outputVideoUrl: '', tableRowCount: 9 }),
    false,
  );
  assert.equal(hasNodeMaterial({ nodeType: 'mystery' }), false);
  assert.equal(hasNodeMaterial({ nodeType: 'group' }), true);
});

test('shouldShowNodeToolbar：空素材 / 多选 / hover / selected', () => {
  assert.equal(shouldShowNodeToolbar({ hasMaterial: false, hovered: true, selected: true }), false);
  assert.equal(
    shouldShowNodeToolbar({ hasMaterial: true, hovered: true, isMultiSelected: true }),
    false,
  );
  assert.equal(shouldShowNodeToolbar({ hasMaterial: true, hovered: true }), true);
  assert.equal(shouldShowNodeToolbar({ hasMaterial: true, selected: true }), true);
  assert.equal(shouldShowNodeToolbar({ hasMaterial: true }), false);
});

test('pillMaxWidthForNode：受节点宽度与 280 上限约束', () => {
  assert.equal(pillMaxWidthForNode(350), DEFAULT_PILL_MAX_WIDTH);
  assert.equal(pillMaxWidthForNode(200), 200 - PILL_NODE_GUTTER);
  assert.equal(pillMaxWidthForNode(0), DEFAULT_PILL_MAX_WIDTH);
});

const OPTS = { maxWidth: 200, moreWidth: 50, dividerWidth: 8, gap: 0 };

function spec(id, section, width) {
  return { id, section, width };
}

test('partitionToolbarActions：次区全放下，无 overflow', () => {
  const actions = [
    spec('chat', 'primary', 80),
    spec('edit', 'primary', 50),
    spec('copy', 'secondary', 40),
  ];
  const result = partitionToolbarActions(actions, OPTS);
  assert.deepEqual(result.visible.map((item) => item.id), ['chat', 'edit', 'copy']);
  assert.deepEqual(result.overflow, []);
});

test('partitionToolbarActions：次区溢出，主区保留', () => {
  const actions = [
    spec('chat', 'primary', 90),
    spec('a', 'secondary', 60),
    spec('b', 'secondary', 60),
    spec('c', 'secondary', 60),
  ];
  const result = partitionToolbarActions(actions, OPTS);
  assert.equal(result.visible[0].id, 'chat');
  assert.ok(result.overflow.length >= 1);
  assert.ok(result.visible.every((item) => item.section === 'primary' || !result.overflow.includes(item)));
  assert.ok(!result.overflow.some((item) => item.section === 'primary'));
});

test('partitionToolbarActions：次区只剩 1 项且已有 overflow 时并入更多', () => {
  const actions = [
    spec('chat', 'primary', 90),
    spec('a', 'secondary', 60),
    spec('b', 'secondary', 60),
  ];
  const result = partitionToolbarActions(actions, { ...OPTS, maxWidth: 90 + 8 + 60 + 50 });
  assert.deepEqual(result.visible.map((item) => item.id), ['chat']);
  assert.deepEqual(result.overflow.map((item) => item.id), ['a', 'b']);
});

test('partitionToolbarActions：仅主区时不计入 divider / more', () => {
  const actions = [spec('chat', 'primary', 180), spec('edit', 'primary', 10)];
  const result = partitionToolbarActions(actions, { ...OPTS, maxWidth: 190 });
  assert.deepEqual(result.visible.map((item) => item.id), ['chat', 'edit']);
  assert.deepEqual(result.overflow, []);
});

test('partitionToolbarActions：主区超宽也不折主区', () => {
  const actions = [
    spec('chat', 'primary', 150),
    spec('edit', 'primary', 150),
    spec('copy', 'secondary', 40),
  ];
  const result = partitionToolbarActions(actions, { ...OPTS, maxWidth: 100 });
  assert.deepEqual(result.visible.map((item) => item.id), ['chat', 'edit']);
  assert.deepEqual(result.overflow.map((item) => item.id), ['copy']);
});

test('buildConversationPayloadFromNode：文本 / 表格 / 合成 fallback 路径', () => {
  const text = buildConversationPayloadFromNode({
    nodeType: 'material',
    nodeId: 'n1',
    materialType: 'text',
    label: '分镜',
  });
  assert.equal(text?.kind, 'document');
  assert.equal(text?.title, '分镜.md');
  assert.equal(text?.relativePath, 'assets/texts/n1.md');

  const table = buildConversationPayloadFromNode({
    nodeType: 'table',
    nodeId: 't1',
    label: '分镜表',
    tablePath: '.hilo/tables/t1.htable',
  });
  assert.equal(table?.kind, 'table');
  assert.equal(table?.extension, 'HTABLE');
  assert.equal(table?.relativePath, '.hilo/tables/t1.htable');

  const clip = buildConversationPayloadFromNode({
    nodeType: 'video_composition',
    nodeId: 'v1',
    label: '成片',
    outputVideoUrl: 'assets/videos/out.mp4',
    duration: '0:31',
  });
  assert.equal(clip?.kind, 'video');
  assert.equal(clip?.relativePath, 'assets/videos/out.mp4');
  assert.equal(clip?.duration, '0:31');

  assert.equal(buildConversationPayloadFromNode({ nodeType: 'material', nodeId: '' }), null);
});

test('isEmptyImageGenerateNode：仅空状态图片生成节点返回 true', () => {
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'generate',
    }),
    true,
  );
  // 有 previewUrl 不是空状态
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'generate',
      previewUrl: 'https://example.com/img.png',
    }),
    false,
  );
  // 生成中不是空状态
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'generate',
      generationStatus: 'generating',
    }),
    false,
  );
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'generate',
      generationStatus: 'pending',
    }),
    false,
  );
  // 失败或完成态均非空状态
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'generate',
      generationStatus: 'failed',
    }),
    false,
  );
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'generate',
      generationStatus: 'completed',
    }),
    false,
  );
  // previewUrl 为空字符串或 undefined 保持为空状态
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'generate',
      previewUrl: '',
      generationStatus: null,
    }),
    true,
  );
  // materialType 或 nodeKind 缺失/异常时不应判定为空状态
  assert.equal(
    isEmptyImageGenerateNode({
      nodeKind: 'generate',
    }),
    false,
  );
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
    }),
    false,
  );
  // 导入节点不是生成节点
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'image',
      nodeKind: 'import',
    }),
    false,
  );
  // 视频/音频/文本不是图片生成节点
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'video',
      nodeKind: 'generate',
    }),
    false,
  );
  assert.equal(
    isEmptyImageGenerateNode({
      materialType: 'text',
      nodeKind: 'generate',
    }),
    false,
  );
});

test('shouldShowNodeToolbar：allowEmpty 支持空状态生图节点在 hover / selected 时显示', () => {
  // 未允许空状态时，无素材一律不显示
  assert.equal(
    shouldShowNodeToolbar({ hasMaterial: false, hovered: true }),
    false,
  );
  // 允许空状态时，hover 显示
  assert.equal(
    shouldShowNodeToolbar({ hasMaterial: false, hovered: true, allowEmpty: true }),
    true,
  );
  // 允许空状态时，selected 显示
  assert.equal(
    shouldShowNodeToolbar({ hasMaterial: false, selected: true, allowEmpty: true }),
    true,
  );
  // 允许空状态时，多选仍然不显示
  assert.equal(
    shouldShowNodeToolbar({ hasMaterial: false, hovered: true, selected: true, isMultiSelected: true, allowEmpty: true }),
    false,
  );
  // 既不 hover 也不 selected 时不显示
  assert.equal(
    shouldShowNodeToolbar({ hasMaterial: false, allowEmpty: true }),
    false,
  );
});

test('buildEmptyImagePillActionSpec：生成符合契约的【导入图片】主区 action spec', () => {
  const action = buildEmptyImagePillActionSpec();
  assert.equal(action.id, EMPTY_IMAGE_PILL_ACTION_ID);
  assert.equal(action.id, 'import-image');
  assert.equal(action.section, 'primary');
  assert.equal(action.width, 88);
});

// ============================================================================
// 语音识别胶囊判定（Issue 744 T04）
// ============================================================================

test('canRunSpeechToText：仅音频 + 有来源 + 非执行中', async () => {
  const { canRunSpeechToText } = await import('./nodeToolbarLogic.ts');
  // 非音频类型一律 false
  assert.equal(canRunSpeechToText({ materialType: 'text', realPath: '/a.txt' }), false);
  assert.equal(canRunSpeechToText({ materialType: 'video', realPath: '/a.mp4' }), false);
  // 音频但无来源
  assert.equal(canRunSpeechToText({ materialType: 'audio' }), false);
  // 音频 + 任一来源
  assert.equal(canRunSpeechToText({ materialType: 'audio', realPath: '/a.mp3' }), true);
  assert.equal(canRunSpeechToText({ materialType: 'audio', relativePath: 'assets/a.mp3' }), true);
  assert.equal(canRunSpeechToText({ materialType: 'audio', mediaUrl: '/omnimux-workflow/api/local-file?path=/a.mp3' }), true);
  assert.equal(canRunSpeechToText({ materialType: 'audio', previewUrl: 'file:///a.mp3' }), true);
  // 离线 / 执行中禁用
  assert.equal(canRunSpeechToText({ materialType: 'audio', realPath: '/a.mp3', isOffline: true }), false);
  assert.equal(canRunSpeechToText({ materialType: 'audio', realPath: '/a.mp3', executionStatus: 'running' }), false);
  assert.equal(canRunSpeechToText({ materialType: 'audio', realPath: '/a.mp3', executionStatus: 'pending' }), false);
  // 失败 / 完成后可重试
  assert.equal(canRunSpeechToText({ materialType: 'audio', realPath: '/a.mp3', executionStatus: 'error' }), true);
  assert.equal(canRunSpeechToText({ materialType: 'audio', realPath: '/a.mp3', executionStatus: 'completed' }), true);
});

test('resolveSpeechToTextAudioPath：优先级 realPath > local-file URL > http URL > 项目相对路径', async () => {
  const { resolveSpeechToTextAudioPath } = await import('./nodeToolbarLogic.ts');
  // realPath 直出
  assert.equal(
    resolveSpeechToTextAudioPath({ realPath: '/Users/x/a.mp3', mediaUrl: 'https://cdn/x.mp3' }),
    '/Users/x/a.mp3',
  );
  // local-file 流 URL 还原绝对路径
  assert.equal(
    resolveSpeechToTextAudioPath({ mediaUrl: '/omnimux-workflow/api/local-file?path=%2FUsers%2Fx%2Fb.wav' }),
    '/Users/x/b.wav',
  );
  // http(s) mediaUrl 直出
  assert.equal(
    resolveSpeechToTextAudioPath({ mediaUrl: 'https://example.com/c.mp3' }),
    'https://example.com/c.mp3',
  );
  // relativePath + workspaceId + baseUrl → 项目文件流绝对 URL
  assert.equal(
    resolveSpeechToTextAudioPath(
      { relativePath: 'assets/imported/d.mp3', workspaceId: 'ws 1' },
      { baseUrl: 'http://127.0.0.1:45120' },
    ),
    'http://127.0.0.1:45120/omnimux-workflow/api/workspaces/ws%201/file?rel=assets%2Fimported%2Fd.mp3',
  );
  // 缺 baseUrl 不发明路径
  assert.equal(
    resolveSpeechToTextAudioPath({ relativePath: 'assets/d.mp3', workspaceId: 'ws1' }),
    null,
  );
  // 全空 → null
  assert.equal(resolveSpeechToTextAudioPath({}), null);
});

// ============================================================================
// 提取视频胶囊判定
// ============================================================================

test('canExtractVideoFromTextNode：仅文本 + 包含社媒视频链接 + 非离线 + 非执行中', async () => {
  const { canExtractVideoFromTextNode, buildExtractVideoPillActionSpec } = await import('./nodeToolbarLogic.ts');

  // 非文本类型返回 false
  assert.equal(canExtractVideoFromTextNode({ materialType: 'image', content: 'https://v.douyin.com/abc/' }), false);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'video', content: 'https://v.douyin.com/abc/' }), false);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'audio', content: 'https://v.douyin.com/abc/' }), false);

  // 纯普通文本（无社媒链接）返回 false
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: '普通的短视频策划案文本' }), false);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://example.com/test.html' }), false);

  // 包含支持的社媒链接（裸链接与混合文案）返回 true
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://www.tiktok.com/@user/video/71234567890' }), true);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: '来看看这个抖音作品 https://v.douyin.com/abc/ 精彩极了' }), true);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://www.bilibili.com/video/BV1xx411c7mD' }), true);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }), true);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://x.com/user/status/123456' }), true);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', generatedContent: 'https://www.instagram.com/reel/C8abc123xyz/' }), true);

  // 离线或执行中（running/pending）禁用
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://v.douyin.com/abc/', isOffline: true }), false);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://v.douyin.com/abc/', executionStatus: 'running' }), false);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://v.douyin.com/abc/', executionStatus: 'pending' }), false);

  // 错误或完成后可重新提取
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://v.douyin.com/abc/', executionStatus: 'error' }), true);
  assert.equal(canExtractVideoFromTextNode({ materialType: 'text', content: 'https://v.douyin.com/abc/', executionStatus: 'completed' }), true);

  // action spec 生成符合契约
  const action = buildExtractVideoPillActionSpec();
  assert.equal(action.id, 'extract-video');
  assert.equal(action.section, 'primary');
  assert.equal(action.width, 88);
});
