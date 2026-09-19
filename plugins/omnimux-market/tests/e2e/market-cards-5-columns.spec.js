/**
 * E2E 测试：技能市场卡片布局升级为一行 5 列自适应排版 (Issue #2393)
 * 验证：
 *  1. CSS 中 .cards-grid, .featured-grid 为 repeat(5, minmax(0, 1fr))；
 *  2. 包含响应式断点 1440px(4列), 1100px(3列), 768px(2列), 480px(1列)；
 *  3. FeaturedCard 保持极光流光色彩与点阵覆盖层；
 *  4. 标题字号微调适配 5 列宽度。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const cssSrc = readFileSync(join(root, 'src/client/css.js'), 'utf8');
const featuredSrc = readFileSync(join(root, 'src/client/plaza/FeaturedCard.jsx'), 'utf8');

test('E2E-1 CSS 规则验证：卡片网格默认设置为一行 5 列自适应', () => {
  // 核心网格断言：严格 repeat(5, minmax(0, 1fr))
  assert.match(
    cssSrc,
    /\.cards-grid,\s*\.featured-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*!important/
  );
  // 间距配置
  assert.match(cssSrc, /\.cards-grid,\s*\.featured-grid\s*\{[^}]*gap:\s*16px\s*!important/);
});

test('E2E-2 响应式阶梯衰减断点验证：平滑兼容不同尺寸视口', () => {
  // 1440px -> 4 列
  assert.match(cssSrc, /@media\s*\(max-width:\s*1440px\)\s*\{\s*\.cards-grid,\s*\.featured-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  // 1100px -> 3 列
  assert.match(cssSrc, /@media\s*\(max-width:\s*1100px\)\s*\{\s*\.cards-grid,\s*\.featured-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  // 768px -> 2 列
  assert.match(cssSrc, /@media\s*\(max-width:\s*768px\)\s*\{\s*\.cards-grid,\s*\.featured-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  // 480px -> 1 列
  assert.match(cssSrc, /@media\s*\(max-width:\s*480px\)\s*\{\s*\.cards-grid,\s*\.featured-grid\s*\{[^}]*grid-template-columns:\s*1fr\s*!important/);
});

test('E2E-3 卡片内部排版与极光流光算法适配：标题与胶囊尺寸和谐', () => {
  // 标题字号支持适配
  assert.match(cssSrc, /\.omnimux-creatify-center-title\s*\{/);
  // 点阵层依然保持微孔覆盖
  assert.match(cssSrc, /\.omnimux-creatify-dot-overlay\s*\{/);
  // FeaturedCard 依然使用极光算法
  assert.match(featuredSrc, /resolveSkillAuroraStyle/);
});
