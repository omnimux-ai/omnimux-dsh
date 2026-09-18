import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dialogPath = join(here, '../../src/client/projects/NewLocalProjectDialog.jsx')
const dialogSrc = readFileSync(dialogPath, 'utf8')

const libraryPath = join(here, '../../src/client/projects/ProjectLibraryPage.jsx')
const librarySrc = readFileSync(libraryPath, 'utf8')

const canvasTabPath = join(here, '../../src/client/projects/CanvasTab.jsx')
const canvasTabSrc = readFileSync(canvasTabPath, 'utf8')

test('E2E: 创作画布与工作区同频流转契约 (#2224)', () => {
  // 1. 新建本地项目弹窗支持路径自动预填契约
  assert.match(
    dialogSrc,
    /initialPath\s*=\s*''/,
    'NewLocalProjectDialog 必须支持 initialPath 属性',
  )
  assert.match(
    dialogSrc,
    /const\s*\[path,\s*setPath\]\s*=\s*useState\s*\(\s*initialPath/,
    'NewLocalProjectDialog 必须将 path state 初始化为 initialPath',
  )
  assert.match(
    dialogSrc,
    /extractFolderName\s*\(\s*initialPath\s*\)/,
    '未传标题时必须根据 initialPath 自动提取当前工作区文件夹名',
  )

  // 2. 项目中心自动预填当前工作区物理路径
  assert.match(
    librarySrc,
    /initialPath=\{\s*resolveCurrentCwd\s*\(\s*sessions,\s*workspaces\s*\)\s*\|\|\s*''\s*\}/,
    '项目中心打开新建弹窗必须传入当前工作区的物理绝对路径',
  )
  assert.match(
    librarySrc,
    /createProjectSession\s*\(\s*sessions,\s*workspaces,\s*selectedProject\.path\s*\|\|\s*selectedProject\.title\s*\)/,
    '项目中心打开创作页必须优先使用项目的真实物理路径反查工作区',
  )

  // 3. 画布标签页前置未建项拦截与就地项目化
  assert.match(
    canvasTabSrc,
    /isUnprojected\s*=\s*Boolean\s*\(\s*sessionId\s*&&\s*sessionBinding\s*&&\s*sessionBinding\.project\s*===\s*null\s*&&\s*!hasExplicitCanvas\s*\)/,
    'CanvasTab 必须识别当前工作区是否尚未创建项目且无显式画布',
  )
  assert.match(
    canvasTabSrc,
    /isPickedForSession\s*=\s*Boolean\s*\(/,
    'CanvasTab 必须严格校验 pickedBySession 属于当前会话，防御跨会话缓存污染',
  )
  assert.match(
    canvasTabSrc,
    /hasExplicitCanvas\s*=\s*Boolean\s*\(/,
    'CanvasTab 必须检测是否已有显式画布目标以避免误拦截',
  )
  assert.match(
    canvasTabSrc,
    /visible\s*&&\s*isUnprojected\s*&&\s*autoPromptedSession\s*!==\s*sessionId/,
    '未建项工作区激活画布时必须自动呼出新建项目弹窗',
  )
  assert.match(
    canvasTabSrc,
    /<div\s+className="omnimux-workflow-canvas-unprojected"/,
    '未建项工作区必须渲染专属引导卡片，严禁直接渲染空白散列画板',
  )
  assert.match(
    canvasTabSrc,
    /<NewLocalProjectDialog[\s\S]*?initialPath=\{\s*sessionBinding\?\.workspaceDir\s*\|\|\s*''\s*\}/,
    'CanvasTab 呼出的新建项目弹窗必须自动预填当前工作区物理路径',
  )
  assert.match(
    canvasTabSrc,
    /t\('canvas\.unprojectedTitle'\)/,
    'CanvasTab 必须通过多语言函数读取未建项标题',
  )
})
