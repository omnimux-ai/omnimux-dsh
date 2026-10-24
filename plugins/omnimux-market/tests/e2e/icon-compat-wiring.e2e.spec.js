/**
 * @file 图标导入收敛的端到端接线断言（#3652）。
 *
 * 0.2.1-rc.3 改掉了 `@deepseek-ai/dsh-client-ui-primitives` 的图标命名，旧名在新宿主上是
 * undefined。market 的客户端入口原来从 primitives 解构 `IconCloseOutline16`，现在改为从
 * `dsh-ui-kit` 兼容层取；本 spec 断言构建产物确实如此，且 primitives 仍是外部 require
 * （由宿主提供）。
 *
 * 这是产物接线断言，不是浏览器旅程；功能路径的浏览器证据见
 * `docs/evidence/worktree-web-qa-report.json`（本工作树 6/6 通过）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const bundle = readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8')

test('E2E 接线：market 产物不再从 primitives 解构旧图标名', () => {
  assert.match(bundle, /require\("@deepseek-ai\/dsh-client-ui-primitives"\)/, 'primitives 必须仍是外部 require')
  assert.doesNotMatch(
    bundle,
    /IconCloseOutline16\s*\}\s*=\s*require\("@deepseek-ai\/dsh-client-ui-primitives"\)/,
    '旧图标名不得再从 primitives 解构',
  )
  assert.match(bundle, /IconCloseOutline16/, '兼容层导出的稳定名应出现在产物中')
})
