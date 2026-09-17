import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const modalJsx = readFileSync(join(here, '../../src/client/AssetPreviewModal.jsx'), 'utf8')
const stylesJs = readFileSync(join(here, '../../src/client/styles.js'), 'utf8')

test('公共资产库大弹窗 (AssetPreviewModal) 采用统一外悬浮关闭按钮架构与无内嵌冗余', () => {
  // 1. 验证存在外层包装容器 .omnimux-assets-modal-wrapper
  assert.match(modalJsx, /className="omnimux-assets-modal-wrapper"/, '必须包含 .omnimux-assets-modal-wrapper')

  // 2. 验证外层关闭按钮具备统一类名、细线图标与无障碍标签
  assert.match(
    modalJsx,
    /className="omnimux-modal-close-btn is-external omnimux-assets-modal-close-external"/,
    '必须包含 .omnimux-modal-close-btn.is-external.omnimux-assets-modal-close-external 外悬浮关闭按钮'
  )
  assert.match(modalJsx, /strokeWidth="2\.2"/, '外悬浮关闭按钮必须采用统一的 2.2px 细线几何 X 图标')
  assert.match(modalJsx, /title=\{t\('modal\.close'\)/, '外悬浮关闭按钮必须带有明确的 title 属性')

  // 3. 验证弹窗头部 Header 内部彻底移除原内置的 IconButton.omnimux-assets-modal-close
  const headerStart = modalJsx.indexOf('<header className="omnimux-assets-modal-header">')
  const headerEnd = modalJsx.indexOf('</header>', headerStart)
  assert.ok(headerStart !== -1 && headerEnd !== -1, '必须存在完整的 header 标签')
  const headerSlice = modalJsx.slice(headerStart, headerEnd)
  assert.doesNotMatch(headerSlice, /omnimux-assets-modal-close/, 'Header 内部严禁残留旧式内嵌关闭按钮')
  assert.doesNotMatch(headerSlice, /<IconButton/, 'Header 内部严禁包含 IconButton 占位')
})

test('公共资产库样式表符合 .omnimux-modal-close-btn 与 <=1280px 响应式自适应规范', () => {
  // 1. 包含包装容器与外悬浮关闭按钮类
  assert.match(stylesJs, /\.omnimux-assets-modal-wrapper\s*\{/, '必须声明 .omnimux-assets-modal-wrapper')
  assert.match(stylesJs, /\.omnimux-modal-close-btn\s*\{/, '必须声明 .omnimux-modal-close-btn')
  assert.match(stylesJs, /\.omnimux-modal-close-btn\.is-external\s*\{/, '必须声明 .omnimux-modal-close-btn.is-external')

  // 2. 几何与尺寸规范（36px 圆形）
  assert.match(stylesJs, /width:\s*36px;/, '关闭按钮必须为 36px 宽')
  assert.match(stylesJs, /height:\s*36px;/, '关闭按钮必须为 36px 高')
  assert.match(stylesJs, /border-radius:\s*50%;/, '关闭按钮必须为正圆形')

  // 3. 响应式自适应规范（<=1280px 退回弹窗内部右上角）
  assert.match(stylesJs, /@media\s*\(max-width:\s*1280px\)/, '必须具备 1280px 视口断点响应式媒体查询')
})
