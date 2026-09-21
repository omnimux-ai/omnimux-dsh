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
  // 1. 新建本地项目弹窗支持路径自动预填契约（空 initialPath 走空态，非空走选中卡片）
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
  assert.match(dialogSrc, /data-omnimux-new-project-drop/, '空态必须渲染源文件夹点击区')
  assert.match(dialogSrc, /data-omnimux-new-project-picked/, '选中态必须渲染可移除目录卡片')
  assert.match(dialogSrc, /data-omnimux-new-project-browse/, '点添加后必须在弹窗内浏览目录')
  assert.doesNotMatch(dialogSrc, /pickProjectDirectory/, '不得再弹出系统选文件夹窗口')
  assert.doesNotMatch(dialogSrc, /projects\.dialog\.pathPlaceholder/, '不得再手填绝对路径')

  // 2. 项目中心打开新建弹窗不得预填当前工作区路径
  assert.match(
    librarySrc,
    /initialPath=""/,
    '项目中心打开新建弹窗必须传入空 initialPath',
  )
  assert.doesNotMatch(
    librarySrc,
    /resolveCurrentCwd/,
    '项目中心不得再把当前工作区路径预填进新建弹窗',
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

  // 4. 侧边栏画布注册显式注入工作流服务，防御 Context 未注入异常 (#2382)
  const indexClientPath = join(here, '../../src/client/index.js')
  const indexClientSrc = readFileSync(indexClientPath, 'utf8')
  assert.match(
    indexClientSrc,
    /registerCanvas\s*=\s*\(sidebar\)\s*=>[\s\S]*?createElement\(CanvasTab,\s*\{[\s\S]*?workspaces:\s*ctx\.workspaces[\s\S]*?\}\)/,
    'registerCanvas 必须显式将工作流已 inject 的 workspaces 服务透传给 CanvasTab',
  )
  assert.match(
    canvasTabSrc,
    /workspaces:\s*propWorkspaces/,
    'CanvasTab 必须声明接收并优先使用 props 传入的 workspaces 服务',
  )
  assert.match(
    canvasTabSrc,
    /safeGetService\(ctx,\s*'workspaces'\)/,
    'CanvasTab 必须对 ctx 进行安全服务属性读取防护，防御未注入 Context 崩溃',
  )
})

test('E2E: 确认创建按路径加页或先问再加页 (#2519)', () => {
  const newProjectSrc = readFileSync(join(here, '../../src/client/projects/newProject.js'), 'utf8')
  const promptSrc = readFileSync(join(here, '../../src/client/projects/promptNewProjectName.js'), 'utf8')
  const forkSrc = readFileSync(join(here, '../../src/client/projects/appLibrary.js'), 'utf8')

  assert.match(newProjectSrc, /createCanvasProjectPage/, '已有项目必须走带画布的加页')
  assert.match(newProjectSrc, /needsConfirm\s*=\s*!stillStaying\s*&&\s*!confirmedExisting/, '换到其他已有项目文件夹必须先问')
  assert.match(newProjectSrc, /existing:\s*true/, '换路径撞档必须把已有项目标记回给弹窗')
  assert.match(promptSrc, /let confirmedExisting = false/, '侧栏弹窗确认标记必须跨两次提交存活')
  assert.match(promptSrc, /confirmedExisting = true/, '第一次撞档后必须记下确认')
  assert.match(dialogSrc, /confirmedExisting/, '主弹窗第二次提交必须带确认标记')
  assert.match(forkSrc, /\$\{appName\}_副本/, '别人的应用必须复制一页原名_副本')
  assert.match(forkSrc, /hostProject/, '有当前项目时不得另开项目')
  assert.doesNotMatch(librarySrc, /confirmedExisting:\s*true/, '项目库不得偷偷带上二次确认')
  assert.doesNotMatch(canvasTabSrc, /confirmedExisting:\s*true/, '画布弹窗不得偷偷带上二次确认')
})
