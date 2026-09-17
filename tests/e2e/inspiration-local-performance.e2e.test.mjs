/**
 * tests/e2e/inspiration-local-performance.e2e.test.mjs
 * 灵感社区本地加载性能全链路优化端到端契约测试（Issue #2199）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const inspirationSrc = path.join(root, 'plugins/omnimux-inspiration/src')

test('E2E 契约一：静态媒体服务声明强缓存与 ETag 协议 (AC-1)', () => {
  const routesSrc = fs.readFileSync(path.join(inspirationSrc, 'http-routes.js'), 'utf8')
  assert.match(routesSrc, /Cache-Control['"]?:\s*['"]public,\s*max-age=31536000,\s*immutable['"]/)
  assert.match(routesSrc, /ETag/)
  assert.match(routesSrc, /304/)
})

test('E2E 契约二：列表加载移除 preloadBatchCovers 强制阻塞等待 (AC-2)', () => {
  const feedHelpersSrc = fs.readFileSync(path.join(inspirationSrc, 'client/feed-helpers.js'), 'utf8')
  assert.doesNotMatch(feedHelpersSrc, /await\s+preloadBatchCovers\(/, '严禁 await preloadBatchCovers 阻塞列表渲染')
  assert.match(feedHelpersSrc, /mergeFetchResult\(\{/, '列表必须第一时间调用 mergeFetchResult 直出卡片')
})

test('E2E 契约三：本地列表轻量化投影与弹窗自愈补全 (AC-3)', () => {
  const handlersSrc = fs.readFileSync(path.join(inspirationSrc, 'http-handlers.js'), 'utf8')
  assert.match(handlersSrc, /projection.*lean/, '服务端必须支持 projection=lean 轻量化投影')

  const apiSrc = fs.readFileSync(path.join(inspirationSrc, 'client/api.js'), 'utf8')
  assert.match(apiSrc, /projection:\s*['"]lean['"]/, '客户端列表请求必须默认携带 lean 投影参数')

  const modalSrc = fs.readFileSync(path.join(inspirationSrc, 'client/InspirationPreviewModal.jsx'), 'utf8')
  assert.match(modalSrc, /getLocalInspiration\(row\.id\)/, '弹窗挂载时必须能自愈补全轻量条目的完整拆解详情')
})

test('E2E 契约四：卡片状态机针对缓存图片极速上屏与慢速首帧兜底 (AC-4)', () => {
  const cardSrc = fs.readFileSync(path.join(inspirationSrc, 'client/InspirationCoverCard.jsx'), 'utf8')
  assert.match(cardSrc, /imgRef\.current\.complete/, '卡片必须支持缓存图片 complete 即刻上屏')
  assert.match(cardSrc, /fallbackTimeout/, '卡片必须具备视频首帧超时兜底，防止扫光层无限挂起')
})
