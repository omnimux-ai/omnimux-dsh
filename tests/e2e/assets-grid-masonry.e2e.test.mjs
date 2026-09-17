/**
 * tests/e2e/assets-grid-masonry.e2e.test.mjs
 * 资产中心封面原始比例瀑布流端到端契约（Issue 2150）
 *
 * 封面不再塞进固定高度的框：卡片按原始比例，网格变成列。契约锁死分列纯函数、
 * 样式表不再裁切、三个网格消费点都接到瀑布流容器上。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  columnIndexById,
  coverRatioOf,
  distributeColumns,
} from '../../plugins/omnimux-assets/src/client/masonry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const clientDir = path.join(root, 'plugins/omnimux-assets/src/client')

test('E2E 契约一：分列最短列优先，追加不改先前列索引', () => {
  const first = [
    { id: 'a', ratio: 0.51 },
    { id: 'b', ratio: 0.72 },
    { id: 'c', ratio: 0.93 },
    { id: 'd', ratio: 0.56 },
  ]
  const extra = [{ id: 'e', ratio: 0.6 }, { id: 'f', ratio: 0.8 }]
  const ratioOf = (row) => row.ratio
  const before = columnIndexById(first, 3, ratioOf)
  const after = columnIndexById(first.concat(extra), 3, ratioOf)
  for (const id of ['a', 'b', 'c', 'd']) {
    assert.equal(after.get(id), before.get(id), `${id} 追加后换列了`)
  }
  assert.equal(distributeColumns([], 5).length, 5)
})

test('E2E 契约二：未知比例回落默认立绘，目录宽高字段可读', () => {
  assert.equal(coverRatioOf({ coverWidth: 1152, coverHeight: 2048 }), 1152 / 2048)
  assert.equal(coverRatioOf({ mediaType: 'image', hasCover: true }), 9 / 16)
})

test('E2E 契约三：样式表放开封面高度，不再 cover 裁切', () => {
  const styles = fs.readFileSync(path.join(clientDir, 'styles.js'), 'utf8')
  assert.match(styles, /\.omnimux-assets-card-media\s*\{[^}]*height:\s*auto/)
  assert.doesNotMatch(styles, /\.omnimux-assets-card-media\s*\{[^}]*object-fit:\s*cover/)
  assert.doesNotMatch(
    styles,
    /\.omnimux-assets-cloud-card--media \.omnimux-assets-cloud-thumb\s*\{[^}]*height:\s*164px/,
  )
  assert.match(styles, /\.omnimux-assets-grid\s*\{[^}]*display:\s*flex/)
  assert.match(styles, /\.omnimux-assets-masonry-col\s*\{[^}]*flex:\s*1 1 0/)
})

test('E2E 契约四：三个网格消费点都接到瀑布流容器', () => {
  for (const file of ['CloudAssetsView.jsx', 'AssetGrid.jsx', 'AssetBrowse.jsx']) {
    const source = fs.readFileSync(path.join(clientDir, file), 'utf8')
    assert.match(source, /MasonryGrid/, `${file} 未接入瀑布流容器`)
    assert.match(source, /data-columns=\{gridColumns\}|columns=\{gridColumns\}/, `${file} 未把列数交给容器`)
  }
  const cloud = fs.readFileSync(path.join(clientDir, 'CloudAssetsView.jsx'), 'utf8')
  const wired = cloud.match(/<MasonryGrid/g) ?? []
  assert.ok(wired.length >= 2, `公共货架只接了 ${wired.length} 个瀑布流节点，骨架与真实网格都要接`)
})

test('E2E 契约五：封面图带 HTML 宽高属性，到达后用自然尺寸修正', () => {
  const cloud = fs.readFileSync(path.join(clientDir, 'CloudAssetsView.jsx'), 'utf8')
  assert.match(cloud, /width=\{9\}/)
  assert.match(cloud, /height=\{16\}/)
  assert.match(cloud, /naturalWidth/)
  assert.match(cloud, /naturalHeight/)
})
