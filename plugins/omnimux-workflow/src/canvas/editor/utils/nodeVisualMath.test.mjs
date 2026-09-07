/**
 * W1 节点视觉纯逻辑测试（计划 §8）：反缩放公式 + GSC 状态映射 +
 * MediaPreview URL 解析 + 多选抑制与防御性包围盒计算。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGroupBounds,
  DEFAULT_GROUP_COLOR,
  GROUP_CHROME_INSET,
  GROUP_HEADER_EXTERNAL_GAP,
  GROUP_HEADER_HEIGHT,
  inverseScaleForZoom,
  isConfigPanelVisible,
  isCustomGroupAccent,
  LEGACY_DEFAULT_GROUP_COLORS,
  mapNodeToGenerationStatus,
  resolveGroupAccentStyle,
  resolveGroupHeaderLayout,
  resolveGroupTopBarLayout,
} from './nodeVisualMath.ts';
import { resolveMediaPreviewUrl } from './mediaUrl.ts';

test('反缩放公式：zoom=1 → 1，zoom=0.5 → 2，zoom=2 → 0.5', () => {
  assert.equal(inverseScaleForZoom(1), 1);
  assert.equal(inverseScaleForZoom(0.5), 2);
  assert.equal(inverseScaleForZoom(2), 0.5);
  assert.equal(inverseScaleForZoom(0.25), 4);
});

test('反缩放公式：非法 zoom 回退 1（不产出 Infinity/NaN）', () => {
  assert.equal(inverseScaleForZoom(0), 1);
  assert.equal(inverseScaleForZoom(-1), 1);
});

test('GSC 映射：executionStatus（SSE）优先', () => {
  assert.equal(mapNodeToGenerationStatus('running', 'completed', true), 'generating');
  assert.equal(mapNodeToGenerationStatus('error', undefined, true), 'failed');
  assert.equal(mapNodeToGenerationStatus('completed', undefined, false), 'completed');
});

test('GSC 映射：回退本地 status', () => {
  assert.equal(mapNodeToGenerationStatus(undefined, 'generating', false), 'generating');
  assert.equal(mapNodeToGenerationStatus(undefined, 'failed', false), 'failed');
  assert.equal(mapNodeToGenerationStatus(undefined, 'completed', false), 'completed');
});

test('GSC 映射：无执行态有媒体 → completed；空态 → null', () => {
  assert.equal(mapNodeToGenerationStatus(undefined, 'ready', true), 'completed');
  assert.equal(mapNodeToGenerationStatus(undefined, 'empty', false), null);
  assert.equal(mapNodeToGenerationStatus(undefined, undefined, false), null);
});

test('GSC 映射：pending/skipped 不算生成中，按媒体与本地态落', () => {
  assert.equal(mapNodeToGenerationStatus('pending', 'empty', false), null);
  assert.equal(mapNodeToGenerationStatus('skipped', 'ready', true), 'completed');
});

test('panelVisible 语义：单选生成节点 selected 时始终展开，无独立 dismiss', () => {
  // 展开：选中 + 无执行态
  assert.equal(isConfigPanelVisible(true, undefined), true);
  // 未选中 → 不展开
  assert.equal(isConfigPanelVisible(false, undefined), false);
  assert.equal(isConfigPanelVisible(undefined, undefined), false);
  // 执行中（SSE running）→ 不展开
  assert.equal(isConfigPanelVisible(true, 'running'), false);
  // 其他执行态不阻塞面板
  assert.equal(isConfigPanelVisible(true, 'completed'), true);
  assert.equal(isConfigPanelVisible(true, 'error'), true);
  assert.equal(isConfigPanelVisible(true, 'pending'), true);
  // 生成节点显式 kind 不改变既有语义
  assert.equal(isConfigPanelVisible(true, undefined, 'generate'), true);
  // 多选态（isMultiSelected=true）→ 强制不展开配置底栏
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', true), false);
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false), true);
});

test('panelVisible：导入节点永不展开配置底栏', () => {
  assert.equal(isConfigPanelVisible(true, undefined, 'import'), false);
  assert.equal(isConfigPanelVisible(true, 'completed', 'import'), false);
  assert.equal(isConfigPanelVisible(true, 'pending', 'import'), false);
  assert.equal(isConfigPanelVisible(true, 'running', 'import'), false);
});

test('panelVisible：多选状态下（isMultiSelected=true，如全选）抑制展开单节点配置面板', () => {
  // 即使单个节点处于 selected=true 状态，一旦处于多选模式，一律不展开底栏
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', true), false);
  assert.equal(isConfigPanelVisible(true, 'completed', 'generate', true), false);
  // 单选时正常展开
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false), true);
});

test('panelVisible 回归：selected=true 时不存在独立 dismiss 能把面板藏掉', () => {
  // 旧签名第二参 panelDismissed=true 已废止；误传布尔值不得当隐藏闸门
  assert.equal(isConfigPanelVisible(true, true), true);
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false), true);
});

test('calculateGroupBounds：包含 NaN / 非法对象 / 负坐标时安全兜底', () => {
  // 包含 undefined position
  const abnormalNodes = [
    { position: null },
    { position: { x: NaN, y: 100 } },
    { position: { x: -460, y: -200 }, width: 300, height: 200 },
  ];
  const bounds = calculateGroupBounds(abnormalNodes, 24);
  assert.ok(Number.isFinite(bounds.x));
  assert.ok(Number.isFinite(bounds.y));
  assert.ok(Number.isFinite(bounds.width));
  assert.ok(Number.isFinite(bounds.height));
  assert.ok(bounds.width >= 120);
  assert.ok(bounds.height >= 80);
});

test('组强调色：空串 / 空白 / 遗留默认蓝 / 主题 accent 不算自定义', () => {
  assert.equal(DEFAULT_GROUP_COLOR, '');
  assert.deepEqual(LEGACY_DEFAULT_GROUP_COLORS, ['#3b82f6']);
  assert.equal(isCustomGroupAccent(''), false);
  assert.equal(isCustomGroupAccent('   '), false);
  assert.equal(isCustomGroupAccent('#3b82f6'), false);
  assert.equal(isCustomGroupAccent('#3B82F6'), false);
  assert.equal(isCustomGroupAccent('var(--wb-accent)'), false);
  assert.equal(isCustomGroupAccent(' var(--wb-accent) '), false);
  assert.equal(isCustomGroupAccent(undefined), false);
  assert.equal(isCustomGroupAccent(null), false);
  assert.equal(isCustomGroupAccent('#10b981'), true);
  assert.equal(isCustomGroupAccent('#2563eb'), true);
});

test('resolveGroupAccentStyle：非自定义不注入 --wf-group-accent', () => {
  assert.deepEqual(resolveGroupAccentStyle(''), {});
  assert.deepEqual(resolveGroupAccentStyle('#3b82f6'), {});
  assert.deepEqual(resolveGroupAccentStyle('var(--wb-accent)'), {});
  assert.deepEqual(resolveGroupAccentStyle('#10b981'), { '--wf-group-accent': '#10b981' });
});

test('resolveGroupHeaderLayout：展开态外挂 + 反缩放；折叠态内置', () => {
  const expanded = resolveGroupHeaderLayout({ isCollapsed: false, inverseScale: 2 });
  assert.equal(expanded.placement, 'external');
  assert.equal(expanded.top, -(GROUP_HEADER_HEIGHT + GROUP_HEADER_EXTERNAL_GAP * 2));
  assert.equal(expanded.left, GROUP_CHROME_INSET);
  assert.equal(expanded.transform, 'scale(2)');
  assert.equal(expanded.transformOrigin, 'bottom left');

  const collapsed = resolveGroupHeaderLayout({ isCollapsed: true, inverseScale: 2 });
  assert.equal(collapsed.placement, 'internal');
  assert.equal(collapsed.top, GROUP_HEADER_EXTERNAL_GAP);
  assert.equal(collapsed.left, GROUP_CHROME_INSET);
  assert.equal(collapsed.transform, 'scale(2)');
  assert.equal(collapsed.transformOrigin, 'left center');

  const fallback = resolveGroupHeaderLayout({ isCollapsed: false, inverseScale: 0 });
  assert.equal(fallback.transform, 'scale(1)');
  assert.equal(fallback.top, -(GROUP_HEADER_HEIGHT + GROUP_HEADER_EXTERNAL_GAP));
});

test('resolveGroupTopBarLayout：展开态右侧避让；折叠态水平居中', () => {
  const expanded = resolveGroupTopBarLayout({ isCollapsed: false, inverseScale: 2 });
  assert.equal(expanded.left, 'auto');
  assert.equal(expanded.right, GROUP_CHROME_INSET);
  assert.equal(expanded.top, -(GROUP_CHROME_INSET * 2));
  assert.equal(expanded.transform, 'translate(0, -100%) scale(2)');
  assert.equal(expanded.transformOrigin, 'bottom right');

  const collapsed = resolveGroupTopBarLayout({ isCollapsed: true, inverseScale: 2 });
  assert.equal(collapsed.left, '50%');
  assert.equal(collapsed.right, 'auto');
  assert.equal(collapsed.transform, 'translate(-50%, -100%) scale(2)');
  assert.equal(collapsed.transformOrigin, 'bottom center');
});

test('MediaPreview URL：mediaAssets 匹配类型优先，回退首条，再回退 mediaUrl', () => {
  assert.equal(
    resolveMediaPreviewUrl('video', [{ type: 'image', url: 'a.png' }, { type: 'video', url: 'b.mp4' }], 'c.mp4'),
    'b.mp4',
  );
  assert.equal(resolveMediaPreviewUrl('video', [{ type: 'image', url: 'a.png' }], undefined), 'a.png');
  assert.equal(resolveMediaPreviewUrl('image', undefined, 'fallback.png'), 'fallback.png');
  assert.equal(resolveMediaPreviewUrl('audio', [], undefined), undefined);
  assert.equal(resolveMediaPreviewUrl('audio', [{ type: 'audio' }], undefined), undefined);
});

test('panelVisible：SRT 字幕文本节点（contentFormat=srt）防御性不展开（Issue 744）', () => {
  // 即使 kind 不是 import（异常数据），contentFormat === 'srt' 也强制收起
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false, 'srt'), false);
  assert.equal(isConfigPanelVisible(true, 'completed', 'import', false, 'srt'), false);
  // 其他 contentFormat 不影响既有语义
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false, 'markdown'), true);
  assert.equal(isConfigPanelVisible(true, undefined, 'generate', false, undefined), true);
});
