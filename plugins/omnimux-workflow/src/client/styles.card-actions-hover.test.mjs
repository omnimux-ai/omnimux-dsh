/**
 * Issue #293：项目库卡片编辑/删除按钮悬停显示契约。
 * 断言 WORKFLOW_CSS 默认隐藏 actions，并在 card:hover / :focus-within 时显示。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { WORKFLOW_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const pageSrc =
  readFileSync(join(here, 'projects/ProjectLibraryPage.jsx'), 'utf8') +
  readFileSync(join(here, 'projects/ProjectPagesTab.jsx'), 'utf8') +
  readFileSync(join(here, 'projects/ProjectFolderCard.jsx'), 'utf8')

function extractRule(src, selector) {
  const needle = `${selector} {`
  const start = src.indexOf(needle)
  assert.ok(start >= 0, `缺少选择器 ${selector}`)
  let i = start + needle.length
  let depth = 1
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    i += 1
  }
  assert.ok(depth === 0, `${selector} 规则体未闭合`)
  return src.slice(start, i)
}

describe('Issue #293 card actions hover CSS contract', () => {
  it('ProjectLibraryPage 将 actions 放在 .omnimux-workflow-card 内', () => {
    assert.match(pageSrc, /omnimux-workflow-card/)
    assert.match(pageSrc, /omnimux-workflow-card-actions/)
    const cardStart = pageSrc.indexOf('omnimux-workflow-card')
    const actionsStart = pageSrc.indexOf('omnimux-workflow-card-actions')
    assert.ok(cardStart >= 0 && actionsStart > cardStart, 'actions 必须出现在 card 标记之后')
  })

  it('默认隐藏 .omnimux-workflow-card-actions', () => {
    const rule = extractRule(WORKFLOW_CSS, '.omnimux-workflow-card-actions')
    assert.match(rule, /opacity:\s*0/)
    assert.match(rule, /pointer-events:\s*none/)
    assert.match(rule, /transition:\s*opacity\s+0\.12s\s+ease/)
  })

  it('hover 与 focus-within 时显示 actions', () => {
    assert.match(
      WORKFLOW_CSS,
      /\.omnimux-workflow-card:hover\s+\.omnimux-workflow-card-actions/,
    )
    assert.match(
      WORKFLOW_CSS,
      /\.omnimux-workflow-card:focus-within\s+\.omnimux-workflow-card-actions/,
    )
    const hoverIdx = WORKFLOW_CSS.indexOf(
      '.omnimux-workflow-card:hover .omnimux-workflow-card-actions',
    )
    const focusIdx = WORKFLOW_CSS.indexOf(
      '.omnimux-workflow-card:focus-within .omnimux-workflow-card-actions',
    )
    assert.ok(hoverIdx >= 0 && focusIdx >= 0)
    const block = WORKFLOW_CSS.slice(Math.min(hoverIdx, focusIdx), Math.max(hoverIdx, focusIdx) + 220)
    assert.match(block, /opacity:\s*1/)
    assert.match(block, /pointer-events:\s*auto/)
  })
})
