/**
 * 资产中心三项改造 — 端到端契约（Issue #1990）
 *
 * 断言打在**真实产物**上：页签文案取自双语词典、骨架几何取自真实样式表、缓存行为取自
 * 真实模块。三者必须对得上，否则「更名」「骨架」「缓存」任一环没落地，界面上就是老样子。
 *
 * 实机渲染证据见同目录 `docs/evidence/2026-09-16-public-tab-skeleton-cache-harness.html`。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { zh, en } from '../../plugins/omnimux-assets/src/client/locales.js'
import { LruCache } from '../../plugins/omnimux-assets/src/client/lru-cache.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const clientDir = path.join(root, 'plugins/omnimux-assets/src/client')

const read = (name) => fs.readFileSync(path.join(clientDir, name), 'utf8')
const viewJsx = read('CloudAssetsView.jsx')
const stylesJs = read('styles.js')
const feedJs = read('use-cloud-assets-feed.js')
const manifestJs = read('use-cloud-manifest.js')
const mediaJs = read('media-cache.js')
const stageJsx = read('AssetsStage.jsx')

test('E2E: 云端页签更名为公共', async () => {
  // AC-1：两种语言下都不再是旧文案。
  assert.equal(zh['source.cloud'], '公共')
  assert.equal(en['source.cloud'], 'Public')
  // 页签真的用这个键渲染，不是词典改了而界面没跟上。
  assert.match(stageJsx, /\{ id: 'cloud', label: t\('source\.cloud'\) \}/)
  // 相邻页签不受影响。
  assert.equal(zh['source.local'], '本地')
  assert.equal(zh['source.product'], '产品库')
})

test('E2E: 首次加载铺骨架网格，几何与真卡片一致', async () => {
  // AC-2：加载分支渲染骨架，数量是具名常量。
  assert.match(viewJsx, /data-skeleton="true"/)
  const declared = /const CLOUD_SKELETON_COUNT = (\d+)/.exec(viewJsx)
  assert.ok(declared, '骨架数量必须是具名常量')
  assert.ok(Number(declared[1]) >= 6, `骨架至少 6 张，实际 ${declared[1]}`)

  // AC-3：骨架缩略图高度必须等于真卡片缩略图高度，否则切换瞬间整页跳动。
  const realThumb = /\.omnimux-assets-cloud-card--media \.omnimux-assets-cloud-thumb \{\s*height:\s*(\d+)px/.exec(stylesJs)
  const skeletonThumb = /\.omnimux-assets-cloud-skeleton-thumb \{\s*height:\s*(\d+)px/.exec(stylesJs)
  assert.ok(realThumb, '真卡片缩略图高度必须能读到')
  assert.ok(skeletonThumb, '骨架缩略图高度必须能读到')
  assert.equal(skeletonThumb[1], realThumb[1], '骨架与真卡片缩略图高度必须一致')

  // AC-4：数据到达后的分支不得残留骨架节点。
  const loadingStart = viewJsx.indexOf('if (feed.loading) {')
  const emptyStart = viewJsx.indexOf('} else if (items.length === 0) {')
  const loadedStart = viewJsx.indexOf('} else {', emptyStart)
  assert.ok(loadingStart > 0 && emptyStart > loadingStart && loadedStart > emptyStart, '三种分支必须都在')
  assert.match(viewJsx.slice(loadingStart, emptyStart), /omnimux-assets-cloud-skeleton/)
  assert.doesNotMatch(viewJsx.slice(loadedStart), /cloud-skeleton/, '已加载分支不得残留骨架')

  // AC-5：空状态仍然只在「已加载且为空」时出现。
  assert.match(viewJsx, /\} else if \(items\.length === 0\) \{\s*body = <EmptyState/)

  // 动效克制，且有减弱动效兜底。
  assert.match(stylesJs, /omnimux-assets-skeleton-breathe/)
  assert.match(stylesJs, /prefers-reduced-motion: reduce/)
})

test('E2E: 清单与分页都有上限缓存', async () => {
  // AC-6：清单走模块级缓存，页签切走再回来不再重新拉取。
  assert.match(manifestJs, /let manifestCache = null/)
  assert.match(manifestJs, /if \(!force && manifestCache !== null\) \{/)

  // 分页缓存键含「范围 + 筛选 + 页码」，且错误结果不入缓存。
  assert.match(feedJs, /const pageCache = new LruCache\(240\)/)
  assert.match(feedJs, /LruCache\.keyOf\(scope, filtering \? filterTokens : '', page\)/)
  assert.match(feedJs, /if \(cached === undefined && result\.ok === true\) pageCache\.set\(cacheKey, result\)/)

  // AC-7：容量上限与最久未用淘汰由模块自身保证——这里直接对真实模块断言。
  const cache = new LruCache(2)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.get('a')
  cache.set('c', 3)
  assert.equal(cache.size, 2, '不得超过容量')
  assert.equal(cache.has('b'), false, '最久未用的应被淘汰')
  assert.equal(cache.has('a'), true, '刚读过的必须留下')

  // 同一组筛选条件顺序不同，必须命中同一个键。
  assert.equal(
    LruCache.keyOf('character', ['1female', '1youth'], 0),
    LruCache.keyOf('character', ['1youth', '1female'], 0),
  )
})

test('E2E: 卡片封面提前解码，滚动来回不闪白', async () => {
  // 预取有上限，且同一张图不重复预取。
  assert.match(mediaJs, /const requested = new LruCache\(400\)/)
  assert.match(mediaJs, /if \(url === '' \|\| requested\.has\(url\)\) continue/)
  // 视图在拿到新一批资产时真的触发预取。
  assert.match(viewJsx, /import \{ preloadMedia \} from '\.\/media-cache\.js'/)
  assert.match(viewJsx, /preloadMedia\(covers\)/)
  // Node 环境下预取是无副作用的空操作，单测可安全调用。
  const { preloadMedia } = await import('../../plugins/omnimux-assets/src/client/media-cache.js')
  assert.doesNotThrow(() => preloadMedia(['/x.png']))
})
