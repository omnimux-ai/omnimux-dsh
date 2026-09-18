import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { loadCatalog } from '../../src/expert/catalog.js';
import { buildWorkshopCategories } from '../../src/client/plaza/usePlazaFilter.js';

const output = await build({
  entryPoints: [new URL('../../src/client/plaza/PlazaCardGrid.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
);
const { renderRegularSection } = module.exports;

describe('E2E: 技能市场彻底解决bad summary报错并换装112套新分类与置顶分区', () => {
  it('loadCatalog() 100% 成功解析且无任何超长字符抛错', () => {
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

  it('renderRegularSection 能够将 112 套技能分为热门精选、新品上市与探索更多大网格', () => {
    const catalog = loadCatalog();
    const skills = catalog.items.filter(i => i.kind === 'skill');
    const vnode = renderRegularSection({
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
  });
});
