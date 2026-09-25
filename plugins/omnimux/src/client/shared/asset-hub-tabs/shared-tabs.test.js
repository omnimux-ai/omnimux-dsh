import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SHARED_PRIMARY_TABS,
  SHARED_SUB_CATEGORIES,
  SHARED_I18N_SPEC,
  isValidPrimaryTab,
  getPrimaryTabTitle,
  getSubCategoriesForTab,
} from './shared-tabs-catalog.js'

describe('Shared Tabs Catalog (共享契约层单一真源) 规格与规范测试', () => {
  it('T01: 六大主库一级 Tab 白名单严格锁定（顺序与字段 100% 对齐 Spec 5.1）', () => {
    const expectedIds = ['featured', 'assets', 'inspiration', 'products', 'trending', 'skills']
    assert.deepEqual(
      SHARED_PRIMARY_TABS.map((t) => t.id),
      expectedIds
    )

    // 验证 canvas 已彻底移出一级 Tab
    assert.equal(SHARED_PRIMARY_TABS.some((t) => t.id === 'canvas'), false)

    // 逐字校验中英文名与图标
    const tabMap = Object.fromEntries(SHARED_PRIMARY_TABS.map((t) => [t.id, t]))
    assert.deepEqual(tabMap.featured, { id: 'featured', nameZh: '精选', nameEn: 'Featured', iconName: 'book-open' })
    assert.deepEqual(tabMap.assets, { id: 'assets', nameZh: '资产库', nameEn: 'Assets', iconName: 'folder' })
    assert.deepEqual(tabMap.inspiration, { id: 'inspiration', nameZh: '灵感库', nameEn: 'Inspiration', iconName: 'lightbulb' })
    assert.deepEqual(tabMap.products, { id: 'products', nameZh: '商品库', nameEn: 'Products', iconName: 'shopping-bag' })
    assert.deepEqual(tabMap.trending, { id: 'trending', nameZh: '爆款趋势', nameEn: 'Trending', iconName: 'trending-up' })
    assert.deepEqual(tabMap.skills, { id: 'skills', nameZh: 'Skills', nameEn: 'Skills', iconName: 'zap' })
  })

  it('T02: 六大主库二级细分分类首项严格且唯一为「全部」，绝无任何叠词（Spec 5.2）', () => {
    const primaryTabIds = ['featured', 'assets', 'inspiration', 'products', 'trending', 'skills']

    for (const tabId of primaryTabIds) {
      const subCats = SHARED_SUB_CATEGORIES[tabId]
      assert.ok(Array.isArray(subCats) && subCats.length > 0, `Tab ${tabId} 必须包含二级细分分类`)

      // 首项严格固定为 'all' / '全部' / 'All'
      const first = subCats[0]
      assert.equal(first.id, 'all', `Tab ${tabId} 的二级分类首项 id 必须为 all`)
      assert.equal(first.nameZh, '全部', `Tab ${tabId} 的二级分类首项 nameZh 必须为 全部`)
      assert.equal(first.nameEn, 'All', `Tab ${tabId} 的二级分类首项 nameEn 必须为 All`)

      // 铁律：严禁出现「全部资产」「全部灵感」「全部商品」「全部爆款」「全部技能」等修饰叠词
      for (const item of subCats) {
        assert.equal(
          ['全部资产', '全部灵感', '全部商品', '全部爆款', '全部技能'].includes(item.nameZh),
          false,
          `严禁出现修饰性叠词: ${item.nameZh}`
        )
      }
    }
  })

  it('T03: 辅助函数与 I18N 字典完整性校验', () => {
    // 校验 isValidPrimaryTab
    assert.equal(isValidPrimaryTab('featured'), true)
    assert.equal(isValidPrimaryTab('assets'), true)
    assert.equal(isValidPrimaryTab('trending'), true)
    assert.equal(isValidPrimaryTab('skills'), true)
    assert.equal(isValidPrimaryTab('canvas'), false)
    assert.equal(isValidPrimaryTab('unknown'), false)

    // 校验 getPrimaryTabTitle
    assert.equal(getPrimaryTabTitle('featured', false), '精选')
    assert.equal(getPrimaryTabTitle('featured', true), 'Featured')
    assert.equal(getPrimaryTabTitle('trending', false), '爆款趋势')
    assert.equal(getPrimaryTabTitle('trending', true), 'Trending')
    assert.equal(getPrimaryTabTitle('skills', false), 'Skills')
    assert.equal(getPrimaryTabTitle('skills', true), 'Skills')

    // 校验 getSubCategoriesForTab
    assert.equal(getSubCategoriesForTab('featured').length, 8)
    assert.equal(getSubCategoriesForTab('assets').length, 6)
    assert.equal(getSubCategoriesForTab('inspiration').length, 5)
    assert.equal(getSubCategoriesForTab('products').length, 6)
    assert.equal(getSubCategoriesForTab('trending').length, 9)
    assert.equal(getSubCategoriesForTab('skills').length, 7)

    // 校验 searchPlaceholder
    assert.equal(SHARED_I18N_SPEC.searchPlaceholder, '搜索素材')
    assert.equal(SHARED_I18N_SPEC.actions.fullscreen, '全屏')
    assert.equal(SHARED_I18N_SPEC.actions.collapse, '收起')
    assert.equal(SHARED_I18N_SPEC.actions.upload, '上传')
    assert.equal(SHARED_I18N_SPEC.actions.addProduct, '添加商品')
  })
})
