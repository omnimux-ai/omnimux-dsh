import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { loadCatalog } from '../../src/expert/catalog.js';
import { buildWorkshopCategories } from '../../src/client/plaza/usePlazaFilter.js';
import { COVER_NUMS, CARD_GRADIENTS, CARD_WEBP_COVERS, getCardVisual } from '../../src/client/plaza/cardCoversData.js';

const output = await build({
  entryPoints: [new URL('../../src/client/plaza/PlazaCardGrid.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  mod,
  mod.exports
);
const { renderRegularSection } = mod.exports;

describe('E2E: Creatify 技能卡片 1:1 视觉复刻、一行三列与流光渐变算法验证', () => {
  it('loadCatalog() 100% 成功解析且全量 112 套技能格式合规', () => {
    const catalog = loadCatalog();
    assert.ok(catalog, 'catalog 必须成功加载');
    const skills = catalog.items.filter(i => i.kind === 'skill');
    assert.equal(skills.length, 112, '激活技能总数必须严格为 112 套');
    for (const s of skills) {
      assert.ok(s.summary && s.summary.length <= 200, `技能 ${s.id} summary 长度必须 <= 200`);
      assert.ok(s.title && s.title.length <= 40, `技能 ${s.id} title 长度必须 <= 40`);
    }
  });

  it('buildWorkshopCategories() 返回全新 7 大分类，默认全部', () => {
    const cats = buildWorkshopCategories(null);
    assert.equal(cats.length, 8, '应包含 1 个全部 + 7 个业务分类');
    assert.equal(cats[0].id, '');
    assert.equal(cats[0].label, '全部');
    assert.equal(cats[1].id, 'ugc-testimonial');
    assert.equal(cats[4].id, 'video-ads');
    assert.equal(cats[5].id, 'product-showcase');
  });

  it('COVER_NUMS 算法严格覆盖 8 种官方封面编号并提供真实 WebP 与 CSS 渐变双保险', () => {
    assert.deepEqual(COVER_NUMS, [4, 5, 6, 7, 9, 10, 2, 3]);
    for (const num of COVER_NUMS) {
      assert.ok(CARD_GRADIENTS[num], `编号 ${num} 必须有对应 CSS 渐变算法`);
      assert.ok(CARD_WEBP_COVERS[num], `编号 ${num} 必须包含内联 WebP 封面数据，杜绝 403 静态资源加载失效`);
      assert.ok(CARD_WEBP_COVERS[num].startsWith('data:image/webp;base64,'), `编号 ${num} 封面必须为合法 Base64 Data URI`);
    }
  });

  it('getCardVisual 依技能索引或元数据精确映射绚丽色彩方案', () => {
    // 0: UGC Confessional -> 4 (紫红粉)
    const v0 = getCardVisual(0);
    assert.equal(v0.num, 4);
    assert.ok(v0.gradient.includes('#1b0c38'));

    // 1: Cinematic -> 5 (深蓝紫)
    const v1 = getCardVisual(1);
    assert.equal(v1.num, 5);
    assert.ok(v1.gradient.includes('#090e38'));

    // 2: UGC Showcase -> 6 (天蓝白)
    const v2 = getCardVisual(2);
    assert.equal(v2.num, 6);
    assert.ok(v2.gradient.includes('#071c4a'));
  });

  it('css.js 确保网格布局为严格一行三个 (repeat(3, minmax(0, 1fr)))', () => {
    const cssPath = new URL('../../src/client/css.js', import.meta.url).pathname;
    const cssContent = readFileSync(cssPath, 'utf8');
    assert.match(cssContent, /\.cards-grid,\s*\.featured-grid\s*\{[^}]*grid-template-columns:repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*!important/);
    assert.match(cssContent, /\.omnimux-creatify-dot-overlay\s*\{[^}]*mix-blend-mode:overlay/);
    assert.match(cssContent, /\.omnimux-creatify-card\s*\{[^}]*aspect-ratio:3\s*\/\s*2/);
  });

  it('skill-plaza.js 彻底消除陈旧的局部私有写死代码，统一接入真实分区组件', () => {
    const plazaPath = new URL('../../src/client/skill-plaza.js', import.meta.url).pathname;
    const plazaContent = readFileSync(plazaPath, 'utf8');
    assert.match(plazaContent, /plazaRenderRegularSection/, 'skill-plaza.js 必须引入并调用 plazaRenderRegularSection');
    assert.ok(!plazaContent.includes('tr(titleKey)'), 'skill-plaza.js 内部不得再保留写死其他Skill的陈旧分支');
  });

  it('renderRegularSection 能够将 112 套技能分为热门精选 (HOT PICKS)、新品上市与探索更多三大专区', () => {
    const catalog = loadCatalog();
    const skills = catalog.items.filter(i => i.kind === 'skill');
    const vnode = renderRegularSection({
      category: '',
      hasQuery: false,
      regularItems: skills,
      uninstalledOnly: false,
      setUninstalledOnly: () => {},
      status: 'ready',
      page: 1,
      err: null,
      tr: (k) => k,
      setOpen: () => {},
      onToggle: () => {},
    });

    assert.ok(vnode, '必须返回分区的虚拟DOM树');
    assert.equal(vnode.props.className, 'omnimux-creatify-sections-wrap');
    
    // 检查子分区结构
    const children = vnode.props.children;
    const hotPicksSection = children.find(c => c && c.props && c.props['aria-label'] === '热门精选');
    assert.ok(hotPicksSection, '必须包含热门精选置顶专区');
    
    const newArrivalsSection = children.find(c => c && c.props && c.props['aria-label'] === '新品上市');
    assert.ok(newArrivalsSection, '必须包含新品上市置顶专区');

    const exploreMoreSection = children.find(c => c && c.props && c.props['aria-label'] === '探索更多');
    assert.ok(exploreMoreSection, '必须包含探索更多专区');
  });
});
