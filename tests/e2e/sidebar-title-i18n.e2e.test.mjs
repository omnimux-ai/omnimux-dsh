import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * E2E: 侧边栏「开始」面板条目名称国际化修复回归（2026-10-03）。
 * 1. 资产插件 assetHub.tabTitle 中英词条不得写反（中文=素材工作台，英文=Asset Hub）。
 * 2. 媒体查看器 tool.viewer 命名空间必须持有 mediaViewer.tabTitle 双语词条，
 *    且挂载处对「翻译服务回显键名」有中文兜底，杜绝侧栏再出现原始键名。
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('E2E: 侧边栏条目词条修复 - assetHub.tabTitle 与 mediaViewer.tabTitle 双语正确', async () => {
  // 1. assetHub.tabTitle：中文=素材工作台 / 英文=Asset Hub（修复前双语写反）
  const assetsLocales = await import(resolve(root, 'plugins/omnimux-assets/src/client/locales.js'))
  assert.equal(assetsLocales.zh['assetHub.tabTitle'], '素材工作台')
  assert.equal(assetsLocales.en['assetHub.tabTitle'], 'Asset Hub')

  // 2. 资产 Tab 标题取值对键名回显有兜底
  const assetsIndex = readFileSync(resolve(root, 'plugins/omnimux-assets/src/client/index.js'), 'utf8')
  assert.match(assetsIndex, /value !== 'assetHub\.tabTitle'/)
  assert.match(assetsIndex, /return '素材工作台'/)

  // 3. 媒体查看器词条表持有 mediaViewer.tabTitle（zh/en 对称由 Record<ViewerKey> 类型保证）
  const viewerLocalesSrc = readFileSync(resolve(root, 'plugins/omnimux-viewer/src/client/locales.ts'), 'utf8')
  assert.match(viewerLocalesSrc, /'mediaViewer\.tabTitle'/)
  assert.match(viewerLocalesSrc, /'mediaViewer\.tabTitle': '图像生成'/)
  assert.match(viewerLocalesSrc, /'mediaViewer\.tabTitle': 'Image Generation'/)

  // 4. 媒体查看器 Tab 标题取值对键名回显有兜底
  const mountSrc = readFileSync(resolve(root, 'plugins/omnimux-viewer/src/media-viewer/mount.js'), 'utf8')
  assert.match(mountSrc, /value !== 'mediaViewer\.tabTitle'/)
  assert.match(mountSrc, /return '图像生成'/)
})
