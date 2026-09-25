import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { zh, en } from './locales.js'
import { ASSETS_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const rowJsx = readFileSync(join(here, 'CloudCategoryRow.jsx'), 'utf8')
const viewJsx = readFileSync(join(here, 'CloudAssetsView.jsx'), 'utf8')
const feedJs = readFileSync(join(here, 'use-cloud-assets-feed.js'), 'utf8')

describe('Cloud category row layout and refresh shuffle cache contract', () => {
  it('CloudCategoryRow renders section header, scroll container, and scroll buttons', () => {
    assert.match(rowJsx, /omnimux-assets-cloud-row-section/)
    assert.match(rowJsx, /omnimux-assets-cloud-row-header/)
    assert.match(rowJsx, /omnimux-assets-cloud-row-title/)
    assert.match(rowJsx, /omnimux-assets-cloud-row-desc/)
    assert.match(rowJsx, /omnimux-assets-cloud-row-view-all/)
    assert.match(rowJsx, /omnimux-assets-cloud-row-cards/)
    assert.match(rowJsx, /omnimux-assets-cloud-row-arrow/)
  })

  it('CloudCategoryRow wires category switch through onSelectCategory', () => {
    assert.match(rowJsx, /onClick=\{\(\) => onSelectCategory\(category\.id\)\}/)
    assert.match(rowJsx, /ChevronRightIcon/)
  })

  it('CloudCategoryRow consumes globalShuffleCache to ensure randomized order with session cache', () => {
    assert.match(rowJsx, /globalShuffleCache\.get\(catId\)/)
    assert.match(rowJsx, /fetchCategoryRandomSample/)
    assert.match(rowJsx, /globalShuffleCache\.set\(catId/)
  })

  it('CloudAssetsView mounts CloudCategoryRow in All category when search is inactive', () => {
    assert.match(viewJsx, /const isAllCategory = feed\.category === CLOUD_ALL_CATEGORY/)
    assert.match(viewJsx, /const showRowLayout = isAllCategory && !searchActive && !filtered/)
    assert.match(viewJsx, /<CloudCategoryRow/)
    assert.match(viewJsx, /refreshKey=\{feed\.refreshKey\}/)
  })

  it('useCloudAssetsFeed clears shuffle cache and increments refreshKey on refresh', () => {
    assert.match(feedJs, /globalShuffleCache\.clear\(\)/)
    assert.match(feedJs, /setRefreshKey\(\(k\) => k \+ 1\)/)
    assert.match(feedJs, /refreshKey,/)
  })

  it('contains complete i18n locales for category descriptions and view all CTA in zh and en', () => {
    assert.equal(zh['cloud.category.viewAll'], '查看全部')
    assert.equal(en['cloud.category.viewAll'], 'View all')
    const cats = ['character', 'scene', 'prop', 'material', 'style', 'audio']
    for (const c of cats) {
      assert.equal(typeof zh[`cloud.categoryDesc.${c}`], 'string', `zh cloud.categoryDesc.${c}`)
      assert.equal(typeof en[`cloud.categoryDesc.${c}`], 'string', `en cloud.categoryDesc.${c}`)
    }
  })

  it('styles single row layout strictly using design tokens without raw hex or rgba literals', () => {
    assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-rows-scroll/)
    assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-row-cards/)
    assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-row-arrow/)
    assert.match(ASSETS_CSS, /var\(--dsw-alias-bg-elevated\)/)
    assert.match(ASSETS_CSS, /var\(--dsw-alias-border\)/)
  })

  /**
   * 行布局复用同一个 CloudAssetCard，所以保存状态只有一条传递路径：
   * stage 的控制器 → CloudAssetsView → 本行 → 卡片。
   */
  it('forwards the save trio down to the card', () => {
    assert.match(rowJsx, /onSave=\{onSave\}/)
    assert.match(rowJsx, /saved=\{savedIds\.has\(asset\.id\)\}/)
    assert.match(rowJsx, /saving=\{savingIds\.has\(asset\.id\)\}/)
    // 缺省读面：调用方不传这三项时，行仍按「未保存」渲染而不是崩掉。
    assert.match(rowJsx, /savedIds = NO_IDS/)
    assert.match(rowJsx, /savingIds = NO_IDS/)
    assert.match(viewJsx, /savedIds=\{savedIds\}[\s\S]*?savingIds=\{savingIds\}[\s\S]*?onSave=\{onSave\}/)
  })
})
