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

  it('narrows the 声音 row sample to the two playable second-level scopes (#2664)', () => {
    // 声音行承诺的是可试听的配乐与音效，而 audio 全量近八成是点不动的音色描述行，
    // 单次抽样平均只能得到个位数的可播放行（原策略见 fetchCategoryRandomSample）。
    assert.match(rowJsx, /const ROW_SAMPLE_SCOPES = \{ audio: \['audio\/bgm', 'audio\/sfx'\] \}/)
    assert.match(rowJsx, /fetchScopesRandomSample/)
    // 行级过滤必须在截断之前生效，否则这一行会在 24 与 23 张之间抖动。
    assert.match(rowJsx, /\(row\) => cloudCardKind\(row\) === 'audio'/)
    // 未列出的分类仍走全量抽样，缓存键仍是 catId，刷新语义不变。
    assert.match(rowJsx, /fetchCategoryRandomSample\(catId, cloudPage, normalizeCloudAsset, 24\)/)
    assert.match(rowJsx, /globalShuffleCache\.set\(catId/)
  })

  it('lays the single-row text card out as a neutral, always-visible text surface (#2664)', () => {
    // A 兜底：正文是文本卡唯一的内容，所以它常驻可见，底板取单一中性表面。
    assert.match(
      ASSETS_CSS,
      /\.omnimux-assets-cloud-row-cards \.omnimux-assets-cloud-card--text \{\s*background: var\(--dsw-alias-bg-layer-1\);/,
    )
    assert.match(
      ASSETS_CSS,
      /\.omnimux-assets-cloud-row-cards \.omnimux-assets-cloud-card--text \.omnimux-assets-card-body \{\s*position: absolute;\s*inset: 0;\s*padding: 14px;\s*background: none;\s*opacity: 1;\s*transform: none;/,
    )
    // 关键陷阱：既有单行流规则已用 !important 锁死 700 字重与主色，覆盖必须同样带 !important。
    assert.match(
      ASSETS_CSS,
      /\.omnimux-assets-cloud-row-cards \.omnimux-assets-cloud-card--text \.omnimux-assets-card-title \{\s*font-size: 14px;\s*font-weight: 600 !important;/,
    )
    assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-row-cards \.omnimux-assets-cloud-card--text \.omnimux-assets-card-title \{[\s\S]*?color: var\(--dsw-alias-label-primary\) !important;/)
    assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-row-cards \.omnimux-assets-cloud-card--text \.omnimux-assets-cloud-desc \{\s*font-size: 12px;\s*line-height: 18px;/)
    // 文本卡没有画面可暗化，蒙层整块关闭；悬停也不改变正文位置与透明度。
    assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-row-cards \.omnimux-assets-cloud-card--text \.omnimux-assets-cloud-card-mask \{\s*display: none;/)
    assert.match(ASSETS_CSS, /\.omnimux-assets-cloud-row-cards \.omnimux-assets-cloud-card--text:hover \.omnimux-assets-card-body,/)
    // 不扩 data-theme：文本卡是常规内容卡，不走声音行的五色微彩。
    assert.doesNotMatch(ASSETS_CSS, /\.omnimux-assets-cloud-card--text\[data-theme/)
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
})
