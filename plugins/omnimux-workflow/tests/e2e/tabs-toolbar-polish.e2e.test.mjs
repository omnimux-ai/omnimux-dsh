import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pagePath = join(here, '../../src/client/projects/ProjectLibraryPage.jsx')
const stylesPath = join(here, '../../src/client/styles.js')

const pageSrc = readFileSync(pagePath, 'utf8')
const stylesSrc = readFileSync(stylesPath, 'utf8')

test('E2E: 项目详情页选项卡图标与新建按键对齐 design.md 规范契约', () => {
  // 1. 图标纯净化契约：严禁出现裸字符 ⓘ
  assert.doesNotMatch(
    pageSrc,
    /ⓘ/,
    '项目库代码中不得出现任何字符 ⓘ',
  )
  assert.match(
    pageSrc,
    /<Info\s+size=\{13\}\s+className="omnimux-tab-info-icon"/,
    '选项卡说明图标必须统一引入矢量 Info 图标组件',
  )

  // 2. 主操作按钮契约：新建创作页必须采用组件库 Button variant="primary"
  assert.match(
    pageSrc,
    /<Button[^>]*variant="primary"[^>]*className="omnimux-create-page-btn"/,
    '新建创作页按钮必须采用组件库 Button variant="primary"',
  )

  // 3. 几何规范契约：按钮严格对齐 32px 控件高与 8px 圆角，严禁 9999px 胶囊圆角
  assert.match(
    stylesSrc,
    /\.omnimux-create-page-btn\s*\{[^}]*height:\s*32px;/,
    '新建创作页按钮高度必须严格对齐 32px 基准',
  )
  assert.match(
    stylesSrc,
    /\.omnimux-create-page-btn\s*\{[^}]*border-radius:\s*8px;/,
    '新建创作页按钮圆角必须严格遵循 8px 基础圆角规范',
  )
  assert.doesNotMatch(
    stylesSrc,
    /\.omnimux-create-page-btn\s*\{[^}]*border-radius:\s*9999px;/,
    '新建创作页按钮严禁使用 9999px 胶囊圆角',
  )
})
