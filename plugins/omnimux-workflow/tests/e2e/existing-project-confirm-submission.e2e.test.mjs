import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const libraryPath = join(here, '../../src/client/projects/ProjectLibraryPage.jsx')
const dialogPath = join(here, '../../src/client/projects/NewLocalProjectDialog.jsx')
const newProjectSrcPath = join(here, '../../src/client/projects/newProject.js')

test('E2E: 项目库已有项目二次确认加页与文案契约闭环 (#2700)', () => {
  const librarySrc = readFileSync(libraryPath, 'utf8')
  const dialogSrc = readFileSync(dialogPath, 'utf8')
  const newProjectSrc = readFileSync(newProjectSrcPath, 'utf8')

  // 1. ProjectLibraryPage 必须透传 handleDialogSubmit 的 Promise 返回值
  assert.match(
    librarySrc,
    /<NewLocalProjectDialog[\s\S]*?onSubmit=\{handleDialogSubmit\}/,
    'ProjectLibraryPage 必须直接传递 handleDialogSubmit 透传 Promise，严禁使用 void 包装吞掉返回值'
  )
  assert.doesNotMatch(
    librarySrc,
    /onSubmit=\{\s*\(payload\)\s*=>\s*\{\s*void\s+handleDialogSubmit/,
    'ProjectLibraryPage 严禁出现丢弃 Promise 的 void handleDialogSubmit 匿名函数'
  )

  // 2. NewLocalProjectDialog 必须包含按钮文案自适应
  assert.match(
    dialogSrc,
    /confirmedExisting\s*\?\s*\(\s*t\('projects\.existingConfirmSubmit'\)/,
    'NewLocalProjectDialog 确认态必须展示 projects.existingConfirmSubmit（新建创作页）'
  )

  // 3. NewLocalProjectDialog 必须包含对 error prop 的二次确认防御监听
  assert.match(
    dialogSrc,
    /confirmMessage\s*=\s*t\('projects\.existingConfirm'\)/,
    'NewLocalProjectDialog 必须读取 projects.existingConfirm 词典比对'
  )
  assert.match(
    dialogSrc,
    /setConfirmedExisting\(true\)/,
    'NewLocalProjectDialog 必须能在匹配时自动激活 confirmedExisting'
  )

  // 4. 后端契约协同：runNewProject 必须返回 existing: true，且 confirmedExisting 为 true 时放行加页
  assert.match(
    newProjectSrc,
    /needsConfirm\s*=\s*!stillStaying\s*&&\s*!confirmedExisting/,
    'runNewProject 必须根据 confirmedExisting 决定是否放行二次确认'
  )
  assert.match(
    newProjectSrc,
    /existing:\s*true/,
    'runNewProject 撞档时必须输出 existing: true 回执'
  )
})
