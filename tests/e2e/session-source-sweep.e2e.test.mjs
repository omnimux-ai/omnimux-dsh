import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

/**
 * 当前会话解析的单一读数口（Issue #3806）。
 *
 * rc.3 运行时 `sessions.list.getSnapshot().current` 恒为 `undefined`（实测 `null`，
 * `phase: 'ready'`），只读它的代码全部拿不到会话。唯一正确读法是
 * `workbench/host-adapter.js` 的 `currentSessionId()`：`sidebarRight.mounted`（在屏）
 * 优先、`current`（选中）兜底。
 *
 * 本文件挡回退：生产代码不得再直读 `.current`，跨插件只经 hub 的全局缝取值。
 */

/** 递归收集指定目录下的源码文件。 */
function collectSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectSources(full, out)
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** 测试替身与注释不是生产读数面。 */
function isExempt(rel) {
  return (
    rel.includes('/test-support/')
    || rel.includes('/tests/')
    || rel.endsWith('.test.js')
    || rel.endsWith('.test.mjs')
    || rel.endsWith('.e2e.test.mjs')
    || rel.endsWith('.spec.js')
  )
}

test('E2E: 生产代码不得直读 sessions.list.getSnapshot().current', () => {
  const offenders = []
  for (const file of collectSources(path.join(root, 'plugins'))) {
    const rel = path.relative(root, file)
    if (isExempt(rel)) continue
    // viewer 的 MediaViewerTab 是 `.current || currentSessionId()`，本就有兜底，
    // 且挂着 #3571 的历史证据哈希锁，不在 #3806 范围。
    if (rel.startsWith('plugins/omnimux-viewer/')) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      // 注释行不算（说明性文字可以提到这个字段）。
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue
      if (/list\s*\??\.\s*getSnapshot\s*\(\)\s*\??\.\s*current\b/.test(line)) {
        offenders.push(`${rel}: ${line.trim().slice(0, 90)}`)
      }
    }
  }
  assert.equal(offenders.length, 0,
    `生产代码禁止直读 sessions.list.getSnapshot().current（rc.3 恒 undefined）；改用 currentSessionId()。命中:\n${offenders.join('\n')}`)
})

test('E2E: 跨插件经 hub 全局缝取会话，不 import 有状态的读数口', () => {
  // omnimux-viewer 不在扫描面（见上一条注释）。
  const domains = ['omnimux-inspiration', 'omnimux-market', 'omnimux-assets', 'omnimux-avatar']
  const violations = []
  for (const name of domains) {
    const dir = path.join(root, 'plugins', name)
    if (!fs.existsSync(dir)) continue
    for (const file of collectSources(dir)) {
      const rel = path.relative(root, file)
      if (isExempt(rel)) continue
      const text = fs.readFileSync(file, 'utf8')
      // host-adapter 的 currentSessionId 依赖模块级 deps；跨插件 import 会各建一份
      // 未绑定副本，读了也是空。纯函数（hostDocument / hostWindow）无状态，可以共用。
      const named = text.match(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*workbench\/host-adapter\.js['"]/)
      if (!named) continue
      const imported = named[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
      const stateful = imported.filter((id) => /^(currentSessionId|mountedSessionId|bindWorkbenchDeps|getWorkbenchService|getAttachedStore|liveSnapshot)$/.test(id))
      if (stateful.length > 0) violations.push(`${rel} -> ${stateful.join(', ')}`)
    }
  }
  assert.deepEqual(violations, [],
    `域插件不得跨插件 import 有状态的读数口（模块级 deps 各建一份、绑定为空）；经 window.__omnimuxWorkbench.getCurrentSessionId() 取值。命中:\n${violations.join('\n')}`)
})

test('E2E: hub 在全局 API 上暴露当前会话读数口', () => {
  const src = fs.readFileSync(path.join(root, 'plugins/omnimux/src/client/workbench.js'), 'utf8')
  assert.match(src, /getCurrentSessionId:\s*\(\)\s*=>\s*currentSessionId\(\)/,
    'workbench 全局 API 必须暴露 getCurrentSessionId，供域插件取值')
})
