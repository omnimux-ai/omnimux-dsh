/**
 * tests/e2e/account-monitor-remove-pool-bar.e2e.test.mjs
 * 账号监控移除「额度/更新于」状态条整行：端到端契约。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../')
const client = path.join(root, 'plugins/omnimux-inspiration/src/client')

test('E2E 契约一：外壳不再挂载监控池状态条', () => {
  const section = fs.readFileSync(path.join(client, 'InspirationSection.jsx'), 'utf8')
  assert.doesNotMatch(section, /<RivalPoolStatusBar/, 'InspirationSection 不得再挂载状态条组件')
  assert.doesNotMatch(section, /import[^\n]*RivalPoolStatusBar[^\n]*\.jsx['"][^\n]*\bRivalPoolStatusBar\b/, '不得再具名引入状态条')
  assert.doesNotMatch(section, /data-rival-pool/, '外壳不得再渲染状态条容器')
  assert.doesNotMatch(section, /poolFreshnessMinutes/, '外壳不得再计算新鲜度')
  assert.match(section, /RivalRefreshButton/, '筛选行刷新主按钮必须保留')
})

test('E2E 契约二：状态条组件与样式、字典无残留', () => {
  const barSrc = fs.readFileSync(path.join(client, 'RivalPoolStatusBar.jsx'), 'utf8')
  assert.doesNotMatch(barSrc, /export function RivalPoolStatusBar/, '状态条组件必须已删除')
  assert.match(barSrc, /export function RivalRefreshButton/, '刷新按钮必须保留在同一文件')

  const styles = fs.readFileSync(path.join(client, 'rival-styles.js'), 'utf8')
  assert.doesNotMatch(styles, /\.omnimux-rival-pool\b/, '状态条样式必须已删除')
  assert.match(styles, /\.omnimux-rival-refresh/, '刷新按钮样式必须保留')

  const locales = fs.readFileSync(path.join(client, 'locales.js'), 'utf8')
  assert.doesNotMatch(locales, /rivalAccounts\.pool\.quota/, 'zh/en 额度字典必须已删除')
  assert.doesNotMatch(locales, /rivalAccounts\.pool\.freshness/, 'zh/en 新鲜度字典必须已删除')

  const health = fs.readFileSync(path.join(client, 'rival-health.js'), 'utf8')
  assert.doesNotMatch(health, /export function poolFreshnessMinutes/, '新鲜度纯函数必须已删除')
  assert.match(health, /export function poolQuota/, '额度口径纯函数必须保留（供刷新按钮置灰与角标）')
})
