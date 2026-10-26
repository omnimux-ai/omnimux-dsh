import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

/**
 * 侧栏一级入口的会话真源契约（Issue #3800）。
 *
 * 现象：Dev 上左侧栏所有 OmniMux 一级入口点击后页面不打开。
 * 真机实测：`betterSidebar` 服务自身的会话槽位恒为 `null`，`openTab` 一进去就
 * `return`，`openWorkbench` 拿不到会话即返回 `false`。
 *
 * 根因是读法：侧栏支持包 0.19.1 只用 `sessions.list.current` 设槽位，而 rc.3
 * 运行时在该字段留空时槽位永远为空。0.28.0 改读 `ctx.sidebarRight.mounted`。
 *
 * 本文件锁三件事：
 * 1. 本仓解析会话必须 `mounted` 优先、`current` 兜底，且不拿列表首项冒充；
 * 2. 会话切换必须触发左栏激活位与工作台同步；
 * 3. 交付的支持包身份必须是读 `mounted` 的那一代（不得回落到 0.19.1 读法）。
 */

const adapterPath = path.join(root, 'plugins/omnimux/src/client/workbench/host-adapter.js')
const chromePath = path.join(root, 'plugins/omnimux/src/client/chrome.js')

test('E2E: 会话真源 mounted 优先、current 兜底，且不猜列表首项', () => {
  const src = fs.readFileSync(adapterPath, 'utf8')

  assert.match(src, /export function mountedSessionId/, '必须导出 mountedSessionId，读官方在屏会话面')
  assert.match(src, /sidebarRight\?\.mounted\?\.getSnapshot\?\./, 'mountedSessionId 必须读 sidebarRight.mounted')

  const fnStart = src.indexOf('export function currentSessionId')
  assert.ok(fnStart > 0, 'currentSessionId 必须保留')
  const body = src.slice(fnStart, fnStart + 900)

  const mountedAt = body.indexOf('mountedSessionId()')
  const currentAt = body.indexOf('snap?.current')
  assert.ok(mountedAt > 0, 'currentSessionId 必须调用 mountedSessionId')
  assert.ok(currentAt > mountedAt, 'mounted（在屏）必须排在 current（选中）之前')
  assert.match(body, /return selected/, 'current 兜底必须原样返回选中会话')
  assert.doesNotMatch(body, /ids\s*\[\s*0\s*\]/, '禁止拿列表首项冒充当前会话')
})

test('E2E: 会话切换驱动左栏激活位与工作台同步', () => {
  const src = fs.readFileSync(chromePath, 'utf8')
  assert.match(src, /sidebarRight\?\.mounted/, 'chrome 必须订阅 sidebarRight.mounted')
  assert.match(src, /requestRailActivationSync\(\)/, 'mounted 变更必须重算左栏激活位')
  assert.match(src, /notifyWorkbenchChange\(\)/, 'mounted 变更必须广播工作台状态')
})

test('E2E: 交付的支持包身份是读 mounted 的那一代', () => {
  const identity = JSON.parse(fs.readFileSync(path.join(root, 'scripts/sidebar-support-identity.json'), 'utf8'))
  assert.equal(identity.name, 'dsh-better-sidebar')

  const installed = path.join(root, 'plugins/omnimux-studio/node_modules/dsh-better-sidebar/lib/client.js')
  assert.ok(fs.existsSync(installed), '任务沙箱必须实装侧栏支持包，e2e 才能核对读法')

  const bundle = fs.readFileSync(installed, 'utf8')
  const count = (re) => (bundle.match(re) || []).length

  assert.equal(count(/sessionList\.current/g), 0,
    '0.19.1 的 sessionList.current 读法不得回流：rc.3 运行时留空时槽位永远为空，入口全废')
  assert.ok(count(/\.mounted/g) > 0,
    '支持包必须读 ctx.sidebarRight.mounted，否则服务会话槽位拿不到在屏会话')

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugins/omnimux-studio/node_modules/dsh-better-sidebar/package.json'), 'utf8'))
  assert.equal(manifest.version, identity.version,
    '实装版本必须与身份声明一致，否则 Dev 物化会装回旧读法')
})
