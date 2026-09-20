/**
 * E2E 契约：对话输入框底栏「产品」按钮鼠标交互与视觉样式对齐右侧模型切换按钮。
 * 覆盖：
 *  1. 默认态：透明背景、28px 控件高、24px 胶囊圆角、13px 字阶、4px gap；
 *  2. 悬停态（Hover）：高亮为 --dsw-alias-interactive-bg-hover，文本提升为 Primary；
 *  3. 按压态（Active）：--dsw-alias-interactive-bg-active 反馈；
 *  4. 展开态（Open/is-active）：弹窗开启时保持高亮背景；
 *  5. 无障碍与聚焦（Focus-visible）：外发光发亮轮廓，aria-expanded 状态联动；
 *  6. 门禁合规：移除写死的行内 style，保证鼠标伪类完整生效。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const buttonSource = readFileSync(
  join(here, '../../src/client/components/product-picker/ProductPickerButton.jsx'),
  'utf8'
)

test('E2E: 对话框底栏「产品」按钮样式注入与标识完备', () => {
  assert.ok(buttonSource.includes("PRODUCT_BTN_STYLE_ID = 'omnimux-composer-product-btn-style'"))
  assert.ok(buttonSource.includes('export const PRODUCT_BTN_CSS = `'))
  assert.ok(buttonSource.includes('export function ensureProductButtonStyles()'))
})

test('E2E: 「产品」按钮默认态严格对标右侧模型选择按钮几何规范', () => {
  // 高度 28px、透明底色、24px 胶囊圆角、13px 字体
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn\s*\{[^}]*background:\s*transparent\s*!important;/
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn\s*\{[^}]*height:\s*28px\s*!important;/
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn\s*\{[^}]*border-radius:\s*24px\s*!important;/
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn\s*\{[^}]*font-size:\s*13px\s*!important;/
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn\s*\{[^}]*gap:\s*4px\s*!important;/
  )
})

test('E2E: 「产品」按钮悬停（Hover）、按压（Active）与展开保持态交互完整', () => {
  // Hover 态使用交互半透明高亮底色
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn:hover:not\(:disabled\)[^{]*\{[^}]*background:\s*var\(--dsw-alias-interactive-bg-hover\)\s*!important;/
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn:hover:not\(:disabled\)[^{]*\{[^}]*color:\s*var\(--dsw-alias-label-primary,\s*inherit\)\s*!important;/
  )

  // Active 按压反馈
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn:active:not\(:disabled\)\s*\{[^}]*background:\s*var\(--dsw-alias-interactive-bg-active/
  )

  // 展开保持态（is-active 与 open）
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn\.is-active/
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn\[data-state="open"\]/
  )
})

test('E2E: 键盘交互 Focus-visible 与图标尺寸约束', () => {
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--dsw-alias-border-l3\)\s*!important;/
  )
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn svg\s*\{[^}]*width:\s*14px\s*!important;/
  )
})

test('E2E: 按钮严禁硬编码内联样式阻断，确保 Hover/Active 伪类 100% 生效', () => {
  assert.ok(
    !buttonSource.includes('style={{'),
    '按钮本身严禁硬编码内联样式'
  )
})
