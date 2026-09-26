import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const canvasTabPath = join(here, '../../src/client/projects/CanvasTab.jsx')
const libraryPath = join(here, '../../src/client/projects/ProjectLibraryPage.jsx')
const projectCanvasPath = join(here, '../../src/client/projects/projectCanvas.js')

const canvasTabSrc = readFileSync(canvasTabPath, 'utf8')
const librarySrc = readFileSync(libraryPath, 'utf8')
const projectCanvasSrc = readFileSync(projectCanvasPath, 'utf8')

test('E2E 契约: CanvasTab 事件监听器严格按 sessionId 隔离防御', () => {
  // 1. 主监听器防御：必须提取 eventSessionId 并拦截不匹配（包括无 sessionId）的事件
  assert.match(
    canvasTabSrc,
    /const eventSessionId = e\?\.detail\?\.sessionId/,
    'CanvasTab 必须在主监听器中提取 eventSessionId',
  )
  assert.match(
    canvasTabSrc,
    /if \(sessionId && eventSessionId !== sessionId\) \{\s*return\s*\}/,
    'CanvasTab 必须在存在 sessionId 时对不匹配的 eventSessionId（含 undefined/null）严格拦截',
  )

  // 2. 次级监听器防御：必须对齐相同的 sessionId 匹配守卫
  const countSessionChecks = (canvasTabSrc.match(/if \(sessionId && eventSessionId !== sessionId\) \{\s*return\s*\}/g) || []).length
  assert.ok(countSessionChecks >= 2, '主监听器与次级监听器均必须拥有严格的 sessionId 隔离拦截守卫')

  // 3. Tab meta 工作区传递必须与 sessionId 联动
  assert.match(
    canvasTabSrc,
    /sessionId && typeof tab\?\.meta\?\.canvasWorkspaceId === 'string' \? tab\.meta\.canvasWorkspaceId : undefined/,
    'CanvasTab 必须在有有效 sessionId 时才信任 tab.meta.canvasWorkspaceId',
  )
})

test('E2E 契约: ProjectLibraryPage 应用编辑/打开流程中拔除未就绪的提前广播', () => {
  // 1. 扫描会话就绪前的代码块，确保不存在无 sessionId 的提前 window.dispatchEvent
  const beforeSessionMatch = librarySrc.match(/const handleEditApp = async \(app\) => \{([\s\S]*?)let sessionId = project\?\.sessionId/)
  assert.ok(beforeSessionMatch, '必须包含 handleEditApp 前半部分逻辑')
  const beforeSessionBody = beforeSessionMatch[1]
  assert.doesNotMatch(
    beforeSessionBody,
    /window\.dispatchEvent\s*\(\s*new CustomEvent\('omnimux:active-canvas-changed'/,
    'handleEditApp 严禁在会话就绪前提前广播 active-canvas-changed 事件',
  )

  // 2. 必须在拥有合法 sessionId 之后才安全派发事件且携带 sessionId
  assert.match(
    librarySrc,
    /if \(sessionId && canvasWorkspaceId && typeof window !== 'undefined'\) \{\s*window\.dispatchEvent\(new CustomEvent\('omnimux:active-canvas-changed',\s*\{\s*detail:\s*\{\s*workspaceId:\s*canvasWorkspaceId,\s*sessionId\s*\},?\s*\}\)\)/,
    'handleEditApp 必须在拥有合法 sessionId 后才派发带 sessionId 的事件',
  )
})

test('E2E 契约: projectCanvas 严格联动 scopedCanvasWorkspaceId 与 sessionId', () => {
  // 1. 严格联动推导：无 sessionId 时强制为空串
  assert.match(
    projectCanvasSrc,
    /const scopedCanvasWorkspaceId = sessionId \? canvasWorkspaceId : ''/,
    '必须使用 sessionId ? canvasWorkspaceId : \'\' 严格联动作用域工作区 id',
  )

  // 2. 单例 Tab meta 透传防护：无有效 sessionId 时严禁写入 canvasWorkspaceId
  assert.match(
    projectCanvasSrc,
    /if \(scopedCanvasWorkspaceId\) nextMeta\.canvasWorkspaceId = scopedCanvasWorkspaceId/,
    '仅当 scopedCanvasWorkspaceId 存在（即存在有效 sessionId）时才向单例 Tab 透传 meta.canvasWorkspaceId',
  )

  // 3. 拥有有效会话时安全派发事件且携带 sessionId
  assert.match(
    projectCanvasSrc,
    /if \(scopedCanvasWorkspaceId && typeof window !== 'undefined'\) \{\s*window\.dispatchEvent\(new CustomEvent\('omnimux:active-canvas-changed',\s*\{\s*detail:\s*\{\s*workspaceId:\s*scopedCanvasWorkspaceId,\s*sessionId\s*\},?\s*\}\)\)/,
    '安全派发必须同时携带 workspaceId 与 sessionId',
  )
})
