/**
 * E2E 测试：技能市场卡片全面应用极光流光光学色彩算法（消除深灰黑底色）
 * 覆盖：算法注入、四层渐变结构、点阵覆盖、多技能色相散列与首帧高饱和炫彩
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AURORA_PRESETS, resolveSkillAuroraStyle } from '../../src/client/plaza/auroraGradients.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const featuredSrc = readFileSync(join(root, 'src/client/plaza/FeaturedCard.jsx'), 'utf8');
const cssSrc = readFileSync(join(root, 'src/client/css.js'), 'utf8');

test('E2E-1 源码契约：FeaturedCard 深度集成极光流光色彩算法', () => {
  assert.match(featuredSrc, /import\s*\{\s*resolveSkillAuroraStyle\s*\}\s*from\s*['"]\.\/auroraGradients\.js['"]/);
  assert.match(featuredSrc, /const aurora = resolveSkillAuroraStyle\(item\)/);
  assert.match(featuredSrc, /style:\s*\{\s*background:\s*aurora\.bg/);
  assert.doesNotMatch(featuredSrc, /coverSrc = `\/omnimux\/assets\/skill-card-covers/);
});

test('E2E-2 样式契约：点阵层升级为 14px 精致微孔光栅覆盖', () => {
  assert.match(cssSrc, /\.omnimux-creatify-dot-overlay\s*\{/);
  assert.match(cssSrc, /background-size:\s*14px 14px/);
});

test('E2E-3 视觉算法全量技能覆盖：120+ 技能卡片随机/散列生成高颜值极光流光', () => {
  assert.equal(AURORA_PRESETS.length, 14, '预设库必须包含 14 套黄金极光方案');

  const sampleSkills = [
    { id: 'sk-ugc', title: 'UGC 告白' },
    { id: 'sk-cinema', title: '电影级' },
    { id: 'sk-showcase', title: 'UGC 展示' },
    { id: 'sk-ecom', title: '电子商贸' },
    { id: 'sk-img', title: '静态图片' },
    { id: 'sk-car', title: '轮播图' },
    { id: 'sk-tiktok', title: 'TikTok 爆款' },
    { id: 'sk-amazon', title: '亚马逊分析' },
  ];

  const generated = sampleSkills.map((s) => resolveSkillAuroraStyle(s));

  // 1. 所有生成的渐变绝不包含纯黑单调底色
  generated.forEach((g, idx) => {
    assert.ok(g.bg.includes('radial-gradient(ellipse 115% 82% at 50% 120%'), `技能 #${idx} 必须包含地平线椭圆渐变结构`);
    assert.ok(g.glow.startsWith('rgba('), `技能 #${idx} 必须拥有环境霓虹光晕`);
    assert.doesNotMatch(g.bg, /#131414|#000000 100%/, '绝不能退化为纯黑灰暗死板底色');
  });

  // 2. 至少覆盖多种不同色系（保证每个技能随机一套视觉方案）
  const colorSchemes = new Set(generated.map((g) => g.bg));
  assert.ok(colorSchemes.size >= 4, `多技能样本应命中至少 4 种以上不同极光方案，实际命中 ${colorSchemes.size} 种`);
});
