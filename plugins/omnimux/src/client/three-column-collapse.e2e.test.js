/**
 * 三分栏收起左侧栏「会话栏保宽 + 右栏吃掉释放空间」端到端回归（工单 #2074）。
 *
 * 断言的是生产源码里的真实规则形状：规则被删、被改回 `auto`、或右栏全宽分支丢失，
 * 都会让本套件变红。真实内核几何由 scripts/three-column-collapse-qa.mjs 负责，
 * 这里只做源码契约回归，保证重构不会悄悄退回旧缺陷。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PRODUCT_STAGE_CHROME } from './conversation-box.js'
import { applyTopbarToggleCssVars } from './sidebar-toggle-topbar.js'

const here = dirname(fileURLToPath(import.meta.url))
const chromeSource = readFileSync(join(here, 'conversation-box.js'), 'utf8')
const toggleSource = readFileSync(join(here, 'sidebar-toggle-topbar.js'), 'utf8')

describe('three-column sidebar collapse keeps conversation width (issue #2074)', () => {
  it('never pins the third track to auto (the rule that crushed the right workspace)', () => {
    assert.doesNotMatch(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*0px\s+minmax\(0px,\s*1fr\)\s+auto/,
      'auto 第三轨会让右侧工作台与 1fr 竞争后被压成 0px，必须彻底消失',
    )
  })

  it('keeps conversation width and hands the released rail width to the right workspace', () => {
    assert.match(
      PRODUCT_STAGE_CHROME,
      /grid-template-columns:\s*0px\s+var\(--omnimux-conversation-width,\s*\d+px\)\s+minmax\(0px,\s*1fr\)\s*!important/,
      '三分栏收起左侧栏时必须保持会话栏宽度并把释放空间给右栏',
    )
  })

  it('still lets the conversation own the full width when the right workspace is closed', () => {
    assert.match(
      PRODUCT_STAGE_CHROME,
      /data-rightbar-collapsed="true"[\s\S]{0,400}?grid-template-columns:\s*0px\s+minmax\(0px,\s*1fr\)\s+0px\s*!important/,
      '右栏确证收起时会话栏必须回到 100vw 全宽，不得留下黑洞',
    )
    const gap = PRODUCT_STAGE_CHROME.indexOf('var(--omnimux-conversation-width')
    const selectorBlock = PRODUCT_STAGE_CHROME.slice(Math.max(0, gap - 900), gap)
    assert.match(
      selectorBlock,
      /:not\(\[data-rightbar-collapsed="true"\]\)/,
      '保宽规则必须排除右栏已收起态，否则会话栏无法全宽',
    )
    assert.doesNotMatch(
      selectorBlock.split('{').pop(),
      /:not\(\[data-details-collapsed="true"\]\)/,
      '选择器收尾必须落在 :not 链上，不能提前闭括号',
    )
  })

  it('publishes the conversation width baseline from the chrome geometry writer', () => {
    assert.match(
      toggleSource,
      /setProperty\(\s*'--omnimux-conversation-width'/,
      '必须由几何写入方发布会话栏基准宽度变量',
    )
  })

  it('writes a usable baseline even when the column cannot be measured', () => {
    const doc = {
      documentElement: {
        style: {
          props: new Map(),
          setProperty(k, v) {
            this.props.set(k, v)
          },
          getPropertyValue(k) {
            return this.props.get(k) ?? ''
          },
          removeProperty(k) {
            this.props.delete(k)
          },
        },
      },
      querySelector() {
        return null
      },
      body: null,
    }

    applyTopbarToggleCssVars(doc)

    const written = Number.parseFloat(doc.documentElement.style.getPropertyValue('--omnimux-conversation-width'))
    assert.ok(Number.isFinite(written), '必须始终写入会话栏基准宽度')
    assert.ok(written >= 320, `基准宽度不得低于会话栏地板，实际 ${written}`)
  })

  it('extracts the production rule verbatim, so the QA harness cannot drift from shipped CSS', () => {
    assert.match(chromeSource, /export const PRODUCT_STAGE_CHROME = `/)
    assert.ok(
      PRODUCT_STAGE_CHROME.includes('--omnimux-conversation-width'),
      '抽取到的生产样式必须包含会话栏宽度变量',
    )
  })
})
