/**
 * tests/e2e/assets-grid-viewport-paging.e2e.test.mjs
 * 资产中心按列数推导每批条数与视口加载端到端契约测试（Issue #2151）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PAGE_ROWS,
  PAGE_SIZE_MAX,
  PAGE_SIZE_MIN,
  pageSizeFor,
} from '../../plugins/omnimux-assets/src/client/page-size.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const clientDir = path.join(root, 'plugins/omnimux-assets/src/client')

test('E2E 契约一：每批条数按列数推导铺满三行，上下限受控 (AC-1)', () => {
  assert.equal(PAGE_ROWS, 3)
  assert.equal(PAGE_SIZE_MIN, 6)
  assert.equal(PAGE_SIZE_MAX, 24)

  assert.equal(pageSizeFor(5), 15)
  assert.equal(pageSizeFor(4), 12)
  assert.equal(pageSizeFor(3), 9)
  assert.equal(pageSizeFor(2), 6)

  // 越界保护与非法输入
  assert.equal(pageSizeFor(1), 6)
  assert.equal(pageSizeFor(10), 24)
  assert.equal(pageSizeFor(-1), 6)
  assert.equal(pageSizeFor(Number.NaN), 6)
})

test('E2E 契约二：feed 请求支持动态 batchSize 限制 (AC-2)', () => {
  const feedSrc = fs.readFileSync(path.join(clientDir, 'use-cloud-assets-feed.js'), 'utf8')
  assert.match(feedSrc, /const batchSize = typeof pageSize === 'number' && pageSize > 0 \? pageSize : CLOUD_PAGE_SIZE/)
  assert.match(feedSrc, /limit: batchSize/)
})

test('E2E 契约三：封面懒加载并取消整批全量预解码 (AC-3)', () => {
  const viewSrc = fs.readFileSync(path.join(clientDir, 'CloudAssetsView.jsx'), 'utf8')
  // 封面图保留原生懒加载
  assert.match(viewSrc, /loading="lazy"/)
  // 严禁对整个 items 全量提前解码
  assert.doesNotMatch(viewSrc, /const covers = items\s*\.filter/)
  // 仅在尾部保留下一屏条数的提前缓冲
  assert.match(viewSrc, /items\.slice\(Math\.max\(0, items\.length - pageSize\)\)/)
})

test('E2E 契约四：骨架屏张数与视口推导条数严格一致 (AC-4)', () => {
  const viewSrc = fs.readFileSync(path.join(clientDir, 'CloudAssetsView.jsx'), 'utf8')
  assert.match(viewSrc, /const pageSize = pageSizeFor\(gridColumns\)/)
  assert.match(viewSrc, /items=\{Array\.from\(\{ length: pageSize \}/)
  assert.doesNotMatch(viewSrc, /CLOUD_SKELETON_COUNT = 12/)
})
