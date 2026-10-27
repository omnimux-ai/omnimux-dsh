import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

/**
 * Alpha 内测标识的端到端契约（Issue #3823）。
 *
 * 用户可见的标识面是官方「更多」菜单：Alpha 名单在 `plugin-lifecycle.json`，
 * 标识渲染在 `explore-more-menu.jsx`，样式在 `styles.js`。本文件锁定三件事：
 * 1. 判定真源仍是生命周期注册表，菜单面不维护第二份 Alpha 名单；
 * 2. 标识只挂在 Alpha 项上，非 Alpha 项的行内容保持纯字符串；
 * 3. 标识样式走官方 Token 与合规字阶，且注入点仍是 `injectHubStyles()`。
 *
 * 组件面渲染断言在 `plugins/omnimux/src/client/explore-more-menu.test.js`，
 * 真实浏览器几何证据在 `scripts/verify-explore-registration-browser.mjs`。
 */

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

test('E2E: Alpha 判定真源仍是生命周期注册表，菜单面不复制第二份名单', () => {
  const lifecycle = JSON.parse(read('plugins/omnimux/src/plugin-lifecycle.json'))
  const alphaPlugins = Object.entries(lifecycle)
    .filter(([, entry]) => entry.stage === 'alpha')
    .map(([name]) => name)
  assert.ok(alphaPlugins.length >= 4, 'Alpha 名单至少覆盖 4 个内测插件')

  const menu = read('plugins/omnimux/src/client/explore-more-menu.jsx')
  assert.match(menu, /isAlphaEntry/, '菜单面必须复用 coordinator 的 Alpha 判定')
  assert.doesNotMatch(
    menu,
    /^\s*import\b[^\n]*plugin-lifecycle\.json/m,
    '菜单面不得自行 import 生命周期注册表',
  )
  assert.doesNotMatch(menu, /stage\s*===\s*['"]alpha['"]/, '菜单面不得内联第二份 Alpha 判定')
  assert.doesNotMatch(menu, /ALPHA_(?:PLUGIN|LIST|IDS)/, '菜单面不得维护第二份 Alpha 名单常量')

  const coordinator = read('plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.match(coordinator, /export const ALPHA_DESCRIPTION/, '内测说明必须是可复用的单一真源')
})

test('E2E: 标识只挂在 Alpha 项上，非 Alpha 项行内容保持纯字符串', () => {
  const menu = read('plugins/omnimux/src/client/explore-more-menu.jsx')
  assert.match(menu, /omnimux-explore-more-alpha/, 'Alpha 项必须渲染标识元素')
  assert.match(menu, /title=\{ALPHA_DESCRIPTION\}/, '标识必须承载内测说明')
  assert.match(menu, /if \(!isAlpha\) return item\.label/, '非 Alpha 项必须原样返回纯字符串文案')

  const coordinator = read('plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.match(
    coordinator,
    /if \(typeof id !== 'string' \|\| id === ''\) return false/,
    'isAlphaEntry 对缺失 id 必须返回 false，运行时注册项不得抛错',
  )
})

test('E2E: 标识样式走官方 Token 与合规字阶，注入点仍是 injectHubStyles', () => {
  const styles = read('plugins/omnimux/src/client/styles.js')
  const block = styles.slice(styles.indexOf('.omnimux-explore-more-alpha'))
  assert.ok(block.length > 0, 'styles.js 必须包含标识样式')
  assert.match(block, /var\(--dsw-alias-border-l2\)/, '边框必须走官方 Token')
  assert.match(block, /var\(--dsw-alias-label-secondary\)/, '文字色必须走官方 Token')
  assert.match(block, /font-size:\s*12px/, '字号必须是合规字阶 12px')
  assert.match(block, /flex:\s*none/, '标识必须 flex:none，防止被单行省略吞掉')
  assert.doesNotMatch(block.slice(0, block.indexOf('}')), /#[0-9a-fA-F]{3,8}\b/, '不得硬编码裸色')

  assert.equal((styles.match(/document\.getElementById\(STYLES_ID\)/g) || []).length >= 1, true)
  assert.equal(
    (styles.match(/createElement\('style'\)/g) || []).length,
    1,
    '必须只有一个 <style> 注入点（injectHubStyles），不得新建第二个',
  )
})
