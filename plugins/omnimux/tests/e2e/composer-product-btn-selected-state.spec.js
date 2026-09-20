/**
 * E2E 契约：对话输入框底栏「产品」按钮选中态（Issue #2468）。
 * 行为证据：qa-evidence/product-btn-selected-state/report.json（真实 Chromium 14/14 通过）。
 * 覆盖：
 *  1. 选中态结构：18px 缩略图 + 商品名（省略号截断）+ 悬停移除按钮；
 *  2. 宽度受限：按钮 max-width 200px；
 *  3. 取图规则：封面图走产品库预览通道，兜底 cover_url/image，无图回退购物袋图标；
 *  4. 移除链路：阻止冒泡、同步移除输入框 Chip、按钮恢复默认态；
 *  5. 换选链路：先移除旧 Chip 再插入新 Chip；
 *  6. 防注入：Chip 商品名 textContent 写入，严禁 innerHTML 拼接与内联 onclick；
 *  7. 图标合规：纯矢量 SVG，严禁字符充当图标（UI04）。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const buttonSource = readFileSync(
  join(here, '../../src/client/components/product-picker/ProductPickerButton.jsx'),
  'utf8'
)

test('E2E: 选中态按钮为「缩略图 + 商品名」且宽度受限、名称省略', () => {
  assert.match(buttonSource, /max-width:\s*200px\s*!important/, '按钮必须限制最大宽度 200px')
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn__thumb\s*\{[^}]*width:\s*18px\s*!important;[^}]*height:\s*18px\s*!important/,
    '选中态缩略图必须为 18x18'
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn__name\s*\{[^}]*overflow:\s*hidden\s*!important;[^}]*text-overflow:\s*ellipsis\s*!important/,
    '商品名必须隐藏溢出并以省略号截断'
  )
})

test('E2E: 选中态取图规则与无图回退', () => {
  assert.ok(buttonSource.includes('export function resolveProductPreview'), '必须导出商品预览图解析函数')
  assert.ok(
    buttonSource.includes('`/omnimux/products/${encodeURIComponent(product.id)}?preview=${encodeURIComponent(cover.id)}`'),
    '封面图必须走产品库预览通道'
  )
  assert.ok(
    buttonSource.includes("product.cover_url || product.image || ''"),
    '无封面时必须兜底 cover_url / image 直链字段'
  )
  assert.ok(
    /selectedPreview\s*\?[\s\S]*?<ShoppingBagIcon size=\{14\} \/>/.test(buttonSource),
    '无图时必须回退为购物袋矢量图标'
  )
})

test('E2E: 悬停显示移除按钮且点击不触发弹窗、同步移除 Chip 并恢复默认态', () => {
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn:hover \.omnimux-composer-product-btn__remove/,
    '悬停选中态必须显示移除按钮'
  )
  const handleRemove = buttonSource.slice(buttonSource.indexOf('const handleRemove'))
  assert.ok(handleRemove.includes('stopPropagation'), '移除点击必须阻止冒泡（不得触发弹窗）')
  assert.ok(handleRemove.includes('removeChip(selectedProduct.id)'), '移除必须同步移除输入框 Chip')
  assert.ok(handleRemove.includes('setSelectedProduct(null)'), '移除后按钮必须恢复默认态')
})

test('E2E: 换选先移除旧 Chip 再插入新 Chip', () => {
  assert.ok(buttonSource.includes('removeChip(selectedProduct.id)'), '换选时必须移除旧商品 Chip')
  assert.ok(buttonSource.includes('insertChip(product)'), '换选后必须插入新商品 Chip')
})

test('E2E: Chip 防注入与图标合规', () => {
  assert.ok(buttonSource.includes('nameSpan.textContent = shortName'), 'Chip 商品名必须用 textContent 写入')
  assert.ok(!buttonSource.includes('chip.innerHTML'), 'Chip 严禁 innerHTML 拼接商品名')
  assert.ok(!buttonSource.includes('onclick='), 'Chip 移除严禁内联 onclick 字符串')
  assert.ok(buttonSource.includes('createCloseSvg'), 'Chip 移除图标必须为纯矢量 SVG')
  assert.ok(!buttonSource.includes("textContent = '×'"), '严禁字符充当移除图标（UI04）')
})

test('E2E: 真实浏览器验收证据齐备（14/14 通过）', () => {
  const reportPath = join(here, '../../../../qa-evidence/product-btn-selected-state/report.json')
  assert.ok(existsSync(reportPath), '必须留存工作树真实浏览器验收报告')
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.equal(report.pass, true, '真实浏览器验收必须全部通过')
  assert.ok(report.assertions.length >= 14, '验收断言不得少于 14 项')
  for (const shot of ['01-default', '02-selected', '03-longname', '04-hover-remove', '05-after-remove']) {
    assert.ok(
      existsSync(join(here, `../../../../qa-evidence/product-btn-selected-state/${shot}.png`)),
      `必须留存关键状态截图 ${shot}.png`
    )
  }
})
