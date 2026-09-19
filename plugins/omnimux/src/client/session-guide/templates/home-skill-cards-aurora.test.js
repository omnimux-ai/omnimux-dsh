import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveSkillAuroraStyle, AURORA_PRESETS } from '../skills/auroraGradients.js';

// 使用 esbuild 即时编译 ExploreTemplatesSection.jsx
const output = await build({
  entryPoints: [new URL('./ExploreTemplatesSection.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
});

const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiledModule,
  compiledModule.exports
);
const { ExploreTemplatesSection } = compiledModule.exports;

test('极光流光算法：确定性散列与 14 套炫彩流光完整性', () => {
  assert.equal(AURORA_PRESETS.length, 14, '必须具备 14 套精选极光色彩流光预设');
  const style1 = resolveSkillAuroraStyle({ id: 'sk-omx-ugc-confessional', title: 'UGC 告白' });
  const style2 = resolveSkillAuroraStyle({ id: 'sk-omx-cinematic', title: '电影级' });
  const style3 = resolveSkillAuroraStyle({ id: 'sk-omx-ugc-showcase', title: 'UGC展示' });

  assert.ok(style1?.bg?.includes('radial-gradient'), 'UGC 告白必须计算出高饱和度流光');
  assert.ok(style2?.bg?.includes('radial-gradient'), '电影级必须计算出高饱和度流光');
  assert.ok(style3?.bg?.includes('radial-gradient'), 'UGC展示必须计算出高饱和度流光');
});

test('首页 Skills 技能库货架卡片：100% 对齐图 2 技能插件高颜值极光样式', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExploreTemplatesSection, {
      onApplyTemplate: () => {},
      onApplySkill: () => {},
    })
  );

  // 1. 验证 Skills 技能库货架行存在
  assert.ok(html.includes('data-shelf-slug="skills"'), '必须渲染 Skills 技能库货架行');
  assert.ok(html.includes('Skills 技能库'), '货架标题必须为 Skills 技能库');

  // 2. 验证 Skills 卡片具备极光流光和点阵网格（图 2 核心特征）
  assert.ok(html.includes('is-skill-card'), '技能卡片必须打上 is-skill-card 标识');
  assert.ok(html.includes('omnimux-creatify-card'), '技能卡片必须具备 creatify 卡片类名');
  assert.ok(html.includes('omnimux-creatify-dot-overlay'), '技能卡片必须渲染点阵覆盖层');
  assert.ok(html.includes('radial-gradient'), '技能卡片必须携带 radial-gradient 极光流光背景');

  // 3. 验证左上角徽章与分类胶囊（图 2 核心特征）
  assert.ok(html.includes('omnimux-creatify-card-top-left'), '必须包含左上角徽标容器');
  assert.ok(html.includes('omnimux-creatify-pill-cat'), '必须包含分类胶囊标签');
  assert.ok(html.includes('UGC 和用户评价'), '第一张卡片必须正确展示分类「UGC 和用户评价」');

  // 4. 验证右上角收藏星标（图 2 核心特征）
  assert.ok(html.includes('omnimux-creatify-star-btn'), '必须包含右上角收藏星标按钮');

  // 5. 验证居中大标题与纯矢量认证对勾徽章（图 2 核心特征）
  assert.ok(html.includes('omnimux-creatify-center-title'), '必须包含居中加粗大标题');
  assert.ok(html.includes('creatify-card-verified-svg'), '居中标题必须携带纯矢量认证打勾徽章');
  assert.ok(html.includes('UGC 告白'), '必须正确渲染前置核心技能 UGC 告白');
  assert.ok(html.includes('电影级'), '必须正确渲染核心技能 电影级');

  // 6. 验证悬停抽屉与使用入口
  assert.ok(html.includes('omnimux-creatify-card-hover-drawer'), '必须具备悬停上浮抽屉');
  assert.ok(html.includes('omnimux-creatify-drawer-uses'), '必须展示使用量统计');
  assert.ok(html.includes('使用'), '快捷悬停按键文案必须为「使用」');

  // 7. 验证彻底消除单调灰黑占位符（彻底消灭图 1 缺陷）
  // 确保在 skills 货架中不出现带 ICON_SPARKLES 的黑灰色 placeholder
  assert.ok(!html.includes('omnimux-tpl-placeholder"><span class="omnimux-tpl-ph-icon'), '技能卡片严禁降级为黑灰占位符');
});
