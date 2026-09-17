/**
 * tests/e2e/assets-grid-columns.e2e.test.mjs
 * 资产中心网格列数收敛端到端契约测试（Issue #2149）
 *
 * 列数是纯函数算出来的，样式表只负责把结果翻译成轨道，所以契约分三层锁死：
 * 函数的四个断点、样式表不再自动膨胀、三个网格消费点都真的把结果写到了 DOM 上。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GRID_GAP,
  GRID_MAX_COLUMNS,
  GRID_MIN_COLUMNS,
  GRID_MIN_COLUMN_WIDTH,
  gridColumnsFor,
} from '../../plugins/omnimux-assets/src/client/grid-columns.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const clientDir = path.join(root, 'plugins/omnimux-assets/src/client')

test('E2E 契约一：列数封顶 5 列，四个目标断点逐条成立', () => {
  assert.equal(GRID_MAX_COLUMNS, 5)
  assert.equal(GRID_MIN_COLUMNS, 2)
  assert.equal(gridColumnsFor(1560), 5)
  assert.equal(gridColumnsFor(1280), 4)
  assert.equal(gridColumnsFor(1024), 3)
  assert.equal(gridColumnsFor(768), 2)
})

test('E2E 契约二：列宽与间距常量参与断点反解，改动即破坏契约', () => {
  // 260 / 12 不是随手取的：换成 180 会让 1280px 得到 6 列，上限形同虚设。
  assert.equal(GRID_MIN_COLUMN_WIDTH, 260)
  assert.equal(GRID_GAP, 12)
  assert.equal(gridColumnsFor(1348), 5, '第五列的入口宽度')
  assert.equal(gridColumnsFor(1347), 4, '差一像素就该退回四列，说明上限边界是算出来的而不是拍出来的')
})

test('E2E 契约三：样式表用 data-columns 属性表达列数，不再 auto-fill 自动膨胀', () => {
  const styles = fs.readFileSync(path.join(clientDir, 'styles.js'), 'utf8')

  assert.doesNotMatch(
    styles,
    /\.omnimux-assets-(?:grid|cloud-grid)\s*\{[^}]*auto-fill/,
    '资产网格仍存在 auto-fill 自动铺列，列数会随窗口无限膨胀',
  )
  for (const columns of [3, 4, 5]) {
    assert.match(
      styles,
      new RegExp(`\\.omnimux-assets-grid\\[data-columns="${columns}"\\]\\s*\\{[^}]*repeat\\(${columns},`),
      `缺少 data-columns="${columns}" 的轨道规则`,
    )
  }
  assert.match(
    styles,
    /\.omnimux-assets-grid\s*\{[^}]*repeat\(2,/,
    '无脚本兜底必须停在两列，不能塌成一列拉满整屏',
  )
  assert.doesNotMatch(
    styles,
    /\.omnimux-assets-cloud-grid\s*\{[^}]*grid-template-columns/,
    '公共货架不得再单独覆盖列数，否则两个货架会不同列数',
  )
})

test('E2E 契约四：三个网格消费点都接入列数并写到 DOM 属性上', () => {
  for (const file of ['CloudAssetsView.jsx', 'AssetGrid.jsx', 'AssetBrowse.jsx']) {
    const source = fs.readFileSync(path.join(clientDir, file), 'utf8')
    assert.match(source, /useGridColumns\(\)/, `${file} 未接入列数 hook`)
    assert.match(source, /data-columns=\{gridColumns\}/, `${file} 的网格容器未写 data-columns`)
  }

  // 公共货架有两个网格节点（骨架 + 真实），两个都要带列数，否则骨架到真图会跳列。
  const cloud = fs.readFileSync(path.join(clientDir, 'CloudAssetsView.jsx'), 'utf8')
  const wired = cloud.match(/data-columns=\{gridColumns\}/g) ?? []
  assert.ok(wired.length >= 2, `公共货架只接了 ${wired.length} 个网格节点，骨架与真实网格都要接`)
})

test('E2E 契约五：列数 hook 在无 ResizeObserver 的环境里回落到默认值而不是抛错', () => {
  const hook = fs.readFileSync(path.join(clientDir, 'use-grid-columns.js'), 'utf8')
  assert.match(hook, /typeof ResizeObserver !== 'function'/, '缺少无 ResizeObserver 环境的回落分支')
  assert.match(hook, /GRID_MAX_COLUMNS/, '默认列数必须来自常量而不是字面量')
})
