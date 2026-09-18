/**
 * E2E 契约：Skill 市场搜索框内层边框消除与样式穿透防护。
 * 覆盖：
 *  1. 标准 SearchField 嵌套在 .search-box 中时，内部 input 边框彻底消除并保持背景透明；
 *  2. 原生回退 input 样式收敛为直接子选择器 (.search-box > input)，杜绝污染组件内部节点；
 *  3. 标准搜索组件在外层容器中平滑铺满 (width: 100%; max-width: none)。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const cssSrc = readFileSync(join(root, 'src/client/css.js'), 'utf8')

test('E2E 搜索框内部输入区域彻底抹平边框与背景，消除双重边框嵌套瑕疵', () => {
  // 必须针对 SearchField 内部 input 声明清除边框与背景，且设置 !important 防穿透覆盖
  assert.match(
    cssSrc,
    /\.search-box \[class\*="SearchField-root"\] input,\.search-box \.dshUk-SearchField-root input\{border:none !important;background:transparent !important/,
    '必须彻底清除搜索框内部 input 边框并保持背景透明'
  )
  assert.match(
    cssSrc,
    /\.search-box \[class\*="SearchField-root"\] input,\.search-box \.dshUk-SearchField-root input\{[^}]*outline:none !important;box-shadow:none !important\}/,
    '内部 input 必须禁止聚焦环与外发光以防内外抢焦'
  )
})

test('E2E 原生回退输入框限定为直接子选择器，杜绝后代样式穿透', () => {
  // 必须使用 .search-box > input，禁止无约束的 .search-box input
  assert.match(
    cssSrc,
    /\.search-box > input\{/,
    '原生 input 必须使用直接子代选择器'
  )
  assert.doesNotMatch(
    cssSrc,
    /\.search-box input\{/,
    '严禁存在未加直接子代约束的 .search-box input 全局后代样式'
  )
})

test('E2E 搜索组件在外层容器中自适应撑满，保持与导航栏一致的视觉节奏', () => {
  assert.match(
    cssSrc,
    /\.search-box \.dshUk-SearchField-root,\.search-box \.dshUk-SearchField-stretch,\.search-box \[class\*="SearchField-root"\]\{width:100%;max-width:none\}/,
    '搜索组件根容器必须自适应占满并取消最大宽度限制'
  )
})
