import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALPHA_DESCRIPTION, isAlphaEntry } from '../../plugins/omnimux/src/client/sidebar-coordinator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

/**
 * E2E 契约（Issue #3985）：「AI 网红工作室」官方「更多」菜单行显示 Alpha 角标。
 *
 * 判定沿用中枢单一真源（plugin-lifecycle.json → isAlphaEntry）；avatar 通过
 * window.__omnimuxSidebar 公共 seam 读取判定与统一说明，不复制第二份名单/文案。
 */
test('E2E: avatar 菜单行消费中枢 Alpha 判定并渲染统一角标', () => {
  assert.equal(isAlphaEntry('omnimux-avatar-entry'), true, 'omnimux-avatar 必须在 Alpha 名单内')
  assert.equal(typeof ALPHA_DESCRIPTION, 'string')
  assert.ok(ALPHA_DESCRIPTION.length > 0, '统一内测说明不得为空')

  const menuSource = read('plugins/omnimux-avatar/src/client/avatar-more-menu.jsx')
  assert.match(menuSource, /isAlpha/, '菜单内容必须接收 Alpha 判定')
  assert.match(menuSource, /omnimux-avatar-more-alpha/, 'Alpha 行必须渲染角标元素')
  assert.match(menuSource, /alphaDescription/, '角标 title 必须取中枢统一说明')

  const indexSource = read('plugins/omnimux-avatar/src/client/index.js')
  assert.match(indexSource, /window\.__omnimuxSidebar\?\.isAlphaEntry\?\.\('omnimux-avatar'\)/, '判定必须读中枢公共 seam')
  assert.match(indexSource, /window\.__omnimuxSidebar\?\.alphaDescription/, '说明必须读中枢公共 seam')

  const coordinatorSource = read('plugins/omnimux/src/client/sidebar-coordinator.js')
  assert.match(coordinatorSource, /isAlphaEntry,\n\s*alphaDescription: ALPHA_DESCRIPTION/, '中枢 seam 必须暴露判定与说明')

  const stylesSource = read('plugins/omnimux-avatar/src/client/styles.js')
  assert.match(stylesSource, /\.omnimux-avatar-more-alpha\s*\{/, '角标样式必须在本插件样式表内')
})
