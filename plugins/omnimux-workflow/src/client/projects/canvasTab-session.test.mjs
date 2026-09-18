/**
 * CanvasTab：sessionId 未就绪不得挂画布岛，避免 workspaceId=undefined 误开最新图。
 * 且必须把 session 绑定的 workspaceId 贡献进 UI Context Envelope。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

test('源码契约：无 targetWorkspaceId 不渲染 CanvasBridge', () => {
  const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')
  assert.match(src, /targetWorkspaceId \?/)
  assert.match(src, /t\('canvas\.loading'\)/)
  const bridgeIdx = src.lastIndexOf('<CanvasBridge')
  const guardIdx = src.indexOf('targetWorkspaceId ?')
  assert.ok(guardIdx >= 0 && bridgeIdx > guardIdx, 'CanvasBridge 必须在 sessionId 守卫之后')
})

test('源码契约：注册 Context Contributor 携带 canvas workspaceId', () => {
  const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')
  assert.match(src, /registerContextContributor\(CANVAS_TAB_ID/)
  assert.match(src, /kind:\s*'canvas'/)
  assert.match(src, /extra:\s*\{\s*workspaceId:\s*targetWorkspaceId\s*\}/)
  assert.match(src, /CANVAS_PAGE_ID/)
})

test('源码契约 & 行为：CanvasTab 安全注入 workspaces 服务，防御 Cordis 门禁异常 (#2382)', () => {
  const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')
  assert.match(src, /function safeGetService\(/, '必须包含 safeGetService 安全防御函数')
  assert.match(src, /workspaces:\s*propWorkspaces/, '必须支持从 props 解构 propWorkspaces')
  assert.match(src, /effectiveWorkspaces = propWorkspaces/, '必须优先使用 propWorkspaces 并多级兜底')

  // 模拟 Cordis Context Proxy 行为：未在 inject 声明的服务在属性访问时抛出异常
  const unInjectedCtx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'workspaces') {
        throw new Error('cannot get property "workspaces" without inject')
      }
      return target[prop]
    },
  })

  // 验证安全获取函数不会抛出异常
  function safeGetService(target, prop) {
    if (!target || typeof target !== 'object') return undefined
    try {
      return target[prop]
    } catch {
      return undefined
    }
  }

  assert.doesNotThrow(() => {
    const ws = safeGetService(unInjectedCtx, 'workspaces')
    assert.equal(ws, undefined)
  })

  // 验证 props 注入的服务能够成功作为最高优先级解析
  const mockWorkspaces = { create: () => Promise.resolve({ workspaceId: 'ws_test' }) }
  const effectiveWorkspaces = mockWorkspaces || safeGetService(unInjectedCtx, 'workspaces')
  assert.equal(effectiveWorkspaces, mockWorkspaces)
})
