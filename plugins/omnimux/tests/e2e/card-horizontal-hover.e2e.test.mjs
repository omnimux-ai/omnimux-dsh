/**
 * E2E: 模板卡片横版化 (16:10)、悬停顶部防裁切与按钮高亮背景修复端到端验证
 * 对应 Issue #2381
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('E2E: 模板与技能卡片横版化(16:10)及货架轨道防截断配置', () => {
  const stylesPath = path.resolve('plugins/omnimux/src/client/session-guide/styles.js');
  assert.ok(fs.existsSync(stylesPath), '必须存在 styles.js');
  const code = fs.readFileSync(stylesPath, 'utf8');

  // 1. 验证卡片横版比例 16:10 与宽度 240px
  assert.ok(code.includes('aspect-ratio:16 / 10'), '卡片必须为 16:10 黄金横版比例');
  assert.ok(code.includes('flex:0 0 240px'), '卡片基准宽度必须为 240px');

  // 2. 验证滑动轨道包含上下安全留白缓冲，防止 hover 时向上移动 4px 导致顶部截断
  assert.ok(code.includes('padding-top:10px'), '轨道必须包含 10px 顶部 padding');
  assert.ok(code.includes('margin-top:-10px'), '轨道必须包含 -10px 顶部负 margin 抵消');
  assert.ok(code.includes('padding-bottom:14px'), '轨道必须包含 14px 底部 padding');

  // 3. 验证悬停操作按钮具备高对比实体背景及 hover 纯白高亮
  assert.ok(code.includes('.omnimux-tpl-hover-action .omnimux-trending-recreate-btn'), '必须单独定义悬停按钮样式');
  assert.ok(code.includes('background:var(--dsw-static-neutral-00) !important'), '按钮 hover 必须为纯白高亮背景');
});

test('E2E: 技能卡片封面动态解析与无封面占位排版', () => {
  const tplPath = path.resolve('plugins/omnimux/src/client/session-guide/templates/ExploreTemplatesSection.jsx');
  const tplCode = fs.readFileSync(tplPath, 'utf8');

  // 验证 resolveSkillCover 传入了 coverIndex，支持 /omnimux/assets/skill-card-covers/ 炫彩点阵渐变封面
  assert.ok(tplCode.includes('resolveSkillCover(sk.cover, sk.coverIndex)'), '必须传入 coverIndex 以命中渐变艺术封面');

  const cardItemPath = path.resolve('plugins/omnimux/src/client/session-guide/templates/TemplateCardItem.jsx');
  const cardCode = fs.readFileSync(cardItemPath, 'utf8');
  assert.ok(!cardCode.includes('omnimux-tpl-ph-title'), '占位符内不得重复出现标题文字');
});
