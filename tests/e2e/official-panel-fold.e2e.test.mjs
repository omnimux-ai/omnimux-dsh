import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

/**
 * 官方侧栏面板行折叠契约（Issue #3806）。
 *
 * 官方左侧栏自带 `插件` / `自动化任务` 两行内置面板入口。它们是官方入口，不是产品入口，
 * 与产品自定义行混排会占满侧栏第一屏，因此在侧栏不显示、改由官方「更多」菜单提供。
 *
 * 本文件锁定三条不可回退的边界：
 *   1. 折叠按「是不是更多行」判定，不按面板 id / 文案 / 语言匹配（否则需要第二份 id 清单）；
 *   2. 折叠规则在展开态与收起态都生效（轨道上也不该留面板图标）；
 *   3. 菜单里的折叠行必须消费官方 owner props（entries + onOpen），不复制面板 id、不另写导航。
 *
 * 实机证据：`docs/evidence/official-panel-fold-into-more/sidebar-panel-chrome.png` + `.json`。
 */
const chromePath = path.join(root, 'plugins/omnimux/src/client/sidebar-panel-chrome.js')
const menuPath = path.join(root, 'plugins/omnimux/src/client/explore-more-menu.jsx')

test('E2E: 官方面板行折叠只按「是否更多行」判定，不按面板 id / 文案匹配', () => {
  assert.ok(fs.existsSync(chromePath), 'sidebar-panel-chrome.js 必须存在')
  const source = fs.readFileSync(chromePath, 'utf8')

  assert.match(
    source,
    /\[class\*="panelRow"\]/,
    '折叠规则必须挂在官方 panelRow 上',
  )
  assert.match(
    source,
    /:not\(\[aria-haspopup="menu"\]\)/,
    '折叠规则必须只命中非「更多」面板行（更多行带 aria-haspopup="menu"）',
  )

  // 不得按面板 id / 文案匹配：那需要第二份清单，官方加面板或改文案即漂移。
  for (const banned of [
    /id\s*===\s*['"]plugins['"]/,
    /id\s*===\s*['"]schedules['"]/,
    /面板行\s*[:=]\s*\[[^\]]*['"]插件['"]/,
  ]) {
    assert.equal(banned.test(source), false, `折叠不得按面板 id / 文案匹配：${banned}`)
  }
})

test('E2E: 折叠在展开态与收起态都生效（规则不带收起态排除）', () => {
  const lines = fs.readFileSync(chromePath, 'utf8').split('\n')
  // 折叠规则的选择器走常量插值（含 `${}` 花括号），因此按行定位：
  // 找到声明 display: none 的行，再向上取它的选择器行。
  const hideSelectors = []
  lines.forEach((line, index) => {
    if (!/^\s*display:\s*none\s*;?\s*$/.test(line)) return
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = lines.at(cursor)
      if (candidate.includes('{')) {
        hideSelectors.push(candidate)
        break
      }
    }
  })
  const hideRules = hideSelectors.filter((selector) => selector.includes('PANEL_ROW_SELECTOR'))
  assert.equal(hideRules.length, 1, '只允许一条折叠规则，不要为展开 / 收起各写一份')
  const rule = hideRules.at(0)
  assert.doesNotMatch(
    rule,
    /data-sidebar-collapsed/,
    '折叠规则不得带收起态排除：56px 轨道同样不该留面板图标',
  )
  assert.match(rule, /SIDEBAR_SCOPE/, '折叠规则必须限定在侧栏作用域内，不得全局裸命中同名类')
  assert.match(rule, /:not\(\[aria-haspopup="menu"\]\)/, '只隐藏非「更多」面板行')
})

test('E2E: 菜单折叠行消费官方 owner props，不复制面板 id、不另写导航', () => {
  assert.ok(fs.existsSync(menuPath), 'explore-more-menu.jsx 必须存在')
  const source = fs.readFileSync(menuPath, 'utf8')

  // 1. 组件签名必须接收官方 owner props。
  assert.match(source, /\(\{\s*onDismiss,\s*entries,\s*onOpen\s*\}\)/, '菜单内容必须接收 entries 与 onOpen')
  // 2. 折叠行点击必须先关菜单、再走官方 onOpen(id)。
  assert.match(source, /onDismiss\?\.\(\)[\s\S]{0,80}onOpen\?\.\(entry\.id\)/, '折叠行点击必须先 onDismiss 再 onOpen(entry.id)')
  // 3. 文案与选中态取自官方 entry，不硬编码。
  assert.match(source, /entry\.label/, '折叠行文案必须取自官方 entry.label')
  assert.match(source, /entry\.active\s*===\s*true/, '折叠行选中态必须取自官方 entry.active')

  // 4. 不得复制面板 id 清单，也不得自行调用布局服务导航。
  for (const banned of [/'schedules'/, /"schedules"/, /'plugins'/, /selectPanel\(/]) {
    assert.equal(banned.test(source), false, `菜单不得复制面板 id 或另写导航：${banned}`)
  }
})

test('E2E: 折叠块排在产品入口之前，两者之间画一条分隔线', () => {
  const source = fs.readFileSync(menuPath, 'utf8')
  // 折叠块先于 items.map 渲染。
  const panelsIndex = source.indexOf('panels.map')
  const itemsIndex = source.indexOf('items.map')
  assert.ok(panelsIndex > 0 && itemsIndex > 0, '两段渲染都必须存在')
  assert.ok(panelsIndex < itemsIndex, '折叠块必须排在产品入口之前')
  // 产品首行在折叠块存在时带分隔线。
  assert.match(
    source,
    /index === 0 && panels\.length > 0/,
    '折叠块与产品入口之间必须有分隔线',
  )
})
