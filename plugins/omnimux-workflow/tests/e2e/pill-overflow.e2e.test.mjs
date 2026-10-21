/**
 * 视频节点工具栏胶囊宽度端到端契约（Issue #3563）。
 *
 * 真实浏览器矩形证据见 docs/evidence/workflow-pill-overflow-3563/：350px 节点上
 * 4 个主胶囊 + 分割线 + 次区图标全部落在同一个圆角容器内；200px 窄节点折叠尾部
 * 且容器完整。本文件在 node:test 里锁住分区预算与容器契约。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PILL_MAX_WIDTH,
  partitionToolbarActions,
  pillMaxWidthForNode,
} from '../../src/canvas/editor/utils/nodeToolbarLogic.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');

const pillSrc = read('src/canvas/editor/components/FloatingTopPill.tsx');
const logicSrc = read('src/canvas/editor/utils/nodeToolbarLogic.ts');

/** 真实浏览器测得的按钮宽度（350px 视频节点、中文文案、13px 图标）。 */
const VIDEO_ACTIONS = [
  { id: 'deconstruct-video', section: 'primary', width: 82 },
  { id: 'storyboard-video', section: 'primary', width: 70 },
  { id: 'extract-audio', section: 'primary', width: 82 },
  { id: 'depth-video', section: 'primary', width: 82 },
  { id: 'chat', section: 'secondary', width: 29 },
];
const MORE_WIDTH = 58;
const DIVIDER_WIDTH = 1;
const CHAT_ICON_WIDTH = 29;

test('E2E 预算：350px 视频节点放得下 4 主胶囊 + 分割线 + 次区图标', () => {
  const budget = pillMaxWidthForNode(350);
  const primaryWidth = VIDEO_ACTIONS.filter((item) => item.section === 'primary')
    .reduce((sum, item) => sum + item.width, 0);
  assert.equal(budget, DEFAULT_PILL_MAX_WIDTH);
  assert.ok(budget >= primaryWidth + DIVIDER_WIDTH + CHAT_ICON_WIDTH, `预算 ${budget} 不足以容纳 4 主胶囊`);

  const plan = partitionToolbarActions(VIDEO_ACTIONS, {
    maxWidth: budget,
    moreWidth: MORE_WIDTH,
    dividerWidth: DIVIDER_WIDTH,
    gap: 0,
  });
  assert.deepEqual(plan.visible.map((item) => item.id), [
    'deconstruct-video',
    'storyboard-video',
    'extract-audio',
    'depth-video',
    'chat',
  ]);
  assert.deepEqual(plan.overflow.map((item) => item.id), [], '4 主胶囊 + 次区图标全部放得下，不需要更多');
});

test('E2E 窄节点：主区自身超宽时折叠尾部，可见宽度不超预算', () => {
  const budget = pillMaxWidthForNode(200);
  const plan = partitionToolbarActions(VIDEO_ACTIONS, {
    maxWidth: budget,
    moreWidth: MORE_WIDTH,
    dividerWidth: DIVIDER_WIDTH,
    gap: 0,
  });
  assert.ok(plan.visible.length >= 1);
  assert.ok(plan.overflow.some((item) => item.id === 'depth-video'), '深度视频应折进更多');
  const visiblePrimaryWidth = plan.visible
    .filter((item) => item.section === 'primary')
    .reduce((sum, item) => sum + item.width, 0);
  const reserveForMore = plan.overflow.length > 0 ? MORE_WIDTH + DIVIDER_WIDTH : 0;
  assert.ok(visiblePrimaryWidth + reserveForMore <= budget, '可见主胶囊 + 更多 必须落在预算内');
});

test('E2E 容器契约：可见组不再被 inline max-width 夹住，主区允许兜底折叠', () => {
  assert.equal(
    /wf-floating-top-pill__group"[^>]*style=\{\{\s*maxWidth/.test(pillSrc),
    false,
    '可见胶囊组不得再用 inline maxWidth 夹住容器（会被子项撑破）',
  );
  assert.match(pillSrc, /wf-floating-top-pill__group/);
  assert.equal(logicSrc.includes('主区即使超宽也不折'), false, '分区算法必须允许主区兜底折叠');
  assert.match(logicSrc, /primaryOverflow/);
});
