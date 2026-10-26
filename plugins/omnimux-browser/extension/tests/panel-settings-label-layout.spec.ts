// @vitest-environment jsdom
//
// 设置面板行标签与说明句的网格（Issue #3796）。
//
// 回归点：`.settings label` 曾用 `grid-template-columns: 1fr auto`，说明句按内容撑满整行，
// 标签列被压到不足一个字宽，中文逐字竖排（「文本生成模型」在 420px 面板里叠成 6 行）。
// 真实浏览器几何证据见 `scripts/verify-browser-settings-label-layout.mjs`；这里钉住样式契约本身。

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

const styles: string = readFileSync(`${process.cwd()}/src/panel/styles.css`, 'utf8')

/** 取某条选择器规则体；选择器必须出现，否则断言先失败而不是静默跳过。 */
function rule(selectorPattern: RegExp): string {
  const matched: string | undefined = styles.match(selectorPattern)?.[1]
  assert.ok(matched, `styles.css 缺少规则：${selectorPattern}`)
  return matched
}

describe('设置面板行标签布局（#3796）', () => {
  it('标签列按文字取宽，说明句列可收缩', () => {
    const rowRule = rule(/\.settings label\s*\{([^}]*)\}/)

    // 标签列按内容取宽并带 45% 上限：无限 `max-content` 会被超长标签撑出容器。
    assert.match(rowRule, /(?:^|\n)\s*grid-template-columns:\s*fit-content\(45%\)\s+minmax\(0,\s*1fr\);/)
    // 旧的 `1fr auto` 正是竖排成因：说明句撑满、标签列被压扁，不得回退。
    assert.doesNotMatch(rowRule, /(?:^|\n)\s*grid-template-columns:\s*1fr\s+auto;/)
    // 裸 `max-content` 无上限，同样会让长标签溢出后被父容器静默裁掉。
    assert.doesNotMatch(rowRule, /grid-template-columns:\s*max-content\s/)
  })

  it('说明句可收缩并可断词，不独占整行宽度', () => {
    const descriptionRule = rule(/\.settings label > small\s*\{([^}]*)\}/)

    assert.match(descriptionRule, /(?:^|\n)\s*min-width:\s*0;/)
    assert.match(descriptionRule, /(?:^|\n)\s*overflow-wrap:\s*anywhere;/)
  })

  it('窄面板把说明句叠到标签下方，且不波及开关行', () => {
    const narrow = rule(/@media\s*\(max-width:\s*480px\)\s*\{([\s\S]*?)\n\}/)

    assert.match(narrow, /\.settings label:not\(\.setting-toggle\)\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/)
    // 开关行自带两列（文案 + 开关），被这条规则压成单列会把开关挤到下一行。
    assert.doesNotMatch(narrow, /\.settings label\.setting-toggle/)
  })
})
