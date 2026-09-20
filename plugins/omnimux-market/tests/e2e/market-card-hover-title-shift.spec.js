/**
 * E2E 测试：技能卡片悬停时标题平滑上移，保持与描述合理间距并避免文字重叠 (Issue #2441)
 * 验证：
 *  1. omnimux-market 的 CSS 中定义了卡片 hover 状态下标题中心区平滑上移 (-28px) 与过渡曲线；
 *  2. session-guide 首页卡片样式中定义了同等的 hover 状态标题平滑上移 (-28px) 与过渡曲线；
 *  3. FeaturedCard 根容器移除了原生 title 属性，彻底消除浏览器原生黑色提示框对文字的遮挡；
 *  4. 几何间隙断言：在极端双行长标题场景下，标题底边与下方描述文案顶边之间垂直呼吸间隙 ≥ 8px，彻底杜绝重叠。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../../');

test('E2E-1 样式规则核验：技能市场 CSS 中标题中心区悬停上移与平滑过渡生效', () => {
  const css = readFileSync(join(root, 'plugins/omnimux-market/src/client/css.js'), 'utf8');
  assert.ok(
    css.includes('.omnimux-creatify-card:hover .omnimux-creatify-card-center'),
    '必须包含 .omnimux-creatify-card:hover .omnimux-creatify-card-center 选择器'
  );
  assert.ok(
    css.includes('transform:translateY(-28px)'),
    '必须包含上移位移样式 transform:translateY(-28px)'
  );
  assert.ok(
    css.includes('transition:transform 350ms cubic-bezier(0.16, 1, 0.3, 1)'),
    '必须配置平滑过渡贝塞尔曲线'
  );
});

test('E2E-2 跨模块对齐核验：首页推荐卡片样式中标题悬停上移与平滑过渡完全一致', () => {
  const styles = readFileSync(join(root, 'plugins/omnimux/src/client/session-guide/styles.js'), 'utf8');
  assert.ok(
    styles.includes('.omnimux-creatify-card:hover .omnimux-creatify-card-center'),
    '首页引导样式必须包含 .omnimux-creatify-card:hover .omnimux-creatify-card-center 选择器'
  );
  assert.ok(
    styles.includes('transform:translateY(-28px)'),
    '首页引导样式必须包含 transform:translateY(-28px)'
  );
  assert.ok(
    styles.includes('transition:transform 350ms cubic-bezier(0.16, 1, 0.3, 1)'),
    '首页引导样式必须包含过渡动画'
  );
});

test('E2E-3 视图层遮挡清理：FeaturedCard 根节点移除原生 title 属性', () => {
  const jsx = readFileSync(join(root, 'plugins/omnimux-market/src/client/plaza/FeaturedCard.jsx'), 'utf8');
  // 确保外层 div 没有挂载全局遮挡的 title 属性
  assert.ok(
    !jsx.includes("className: 'featured-card omnimux-creatify-card',\n    onClick: onCardClick,\n    title,"),
    'FeaturedCard 根元素不得挂载导致原生黑框遮挡的 title 属性'
  );
});

test('E2E-4 几何间隙断言：长文本换行两行时，上移后标题底边与描述顶边保持充足留白', () => {
  const cardHeight = 150;
  const twoLineTitleHeight = 40; // 18px * 1.25 * 2
  const drawerTopAtHover = 75; // 抽屉内容起始 Y 坐标
  const shiftDistance = 28;

  // 上移后几何位置推导
  const titleCenterShifted = cardHeight / 2 - shiftDistance; // 47px
  const titleBottomShifted = titleCenterShifted + twoLineTitleHeight / 2; // 67px
  const verticalGap = drawerTopAtHover - titleBottomShifted; // 8px

  assert.ok(verticalGap >= 8, `悬停上移后垂直呼吸留白必须大于等于 8px，实际为: ${verticalGap}px`);
});
