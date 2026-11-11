/**
 * CanvasTab：画布目标只能来自 WorkspaceContextStore，不再读取会话级缓存。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')

test('源码契约：无 targetWorkspaceId 不渲染 CanvasBridge', () => {
  assert.match(src, /targetWorkspaceId && !isLoading \?/)
  assert.match(src, /<CanvasLoadingState t=\{t\} \/>/)
  const bridgeIdx = src.lastIndexOf('<CanvasBridge')
  const guardIdx = src.indexOf('targetWorkspaceId && !isLoading')
  assert.ok(guardIdx >= 0 && bridgeIdx > guardIdx, 'CanvasBridge 必须在目标守卫之后')
})

test('源码契约：画布目标只从 WorkspaceContextStore 解析', () => {
  assert.match(src, /useWorkspaceContext\(workspaceContext\)/)
  assert.match(src, /resolveWorkspaceContextPage\(project, pageId\)/)
  assert.doesNotMatch(src, /fetchSessionProjectBinding/)
  assert.doesNotMatch(src, /pickedBySession/)
  assert.doesNotMatch(src, /omnimux:active-canvas-changed/)
})

test('源码契约：注册 Context Contributor 携带目标 canvas workspaceId', () => {
  assert.match(src, /registerContextContributor\(CANVAS_TAB_ID/)
  assert.match(src, /kind:\s*'canvas'/)
  assert.match(src, /extra:\s*\{\s*workspaceId:\s*targetWorkspaceId\s*\}/)
  assert.match(src, /CANVAS_PAGE_ID/)
})

test('源码契约：CanvasTab 安全读取 workspace 服务', () => {
  assert.match(src, /function safeGetService\(/)
  assert.match(src, /workspaces:\s*propWorkspaces/)
  assert.match(src, /effectiveWorkspaces = propWorkspaces/)
})
