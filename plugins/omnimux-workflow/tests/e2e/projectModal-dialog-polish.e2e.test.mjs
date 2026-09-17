import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pagePath = join(here, '../../src/client/projects/ProjectLibraryPage.jsx')
const pageSrc = readFileSync(pagePath, 'utf8')

test('E2E: 项目库彻底消灭原生 window.prompt/confirm 并全链路对齐设计规范模态框', () => {
  // 1. 源码绝对纯净度契约：严禁任何 window.prompt 与 window.confirm 残留
  assert.doesNotMatch(
    pageSrc,
    /window\.prompt\s*\(/,
    '项目库代码中不得出现任何 window.prompt 调用',
  )
  assert.doesNotMatch(
    pageSrc,
    /window\.confirm\s*\(/,
    '项目库代码中不得出现任何 window.confirm 调用',
  )

  // 2. 规范组件契约：必须引入 ModalDialog 并声明 PromptModal
  assert.match(
    pageSrc,
    /import\s*\{[^}]*ModalDialog[^}]*\}\s*from\s*['"]dsh-ui-kit['"]/,
    '必须从 dsh-ui-kit 引入标准 ModalDialog',
  )
  assert.match(
    pageSrc,
    /function\s+PromptModal\s*\(/,
    '必须声明标准受控的 PromptModal 输入型对话框组件',
  )

  // 3. 删除创作页契约：必须通过 pendingDeletePage 联动 ConfirmModal
  assert.match(
    pageSrc,
    /setPendingDeletePage\s*\(/,
    '删除创作页必须通过 setPendingDeletePage 挂起确认状态',
  )
  assert.match(
    pageSrc,
    /pendingDeletePage\s*\?\s*\(\s*<ConfirmModal[\s\S]*?confirmVariant="danger"/,
    '删除创作页确认框必须声明 confirmVariant="danger" 危险语义',
  )

  // 4. 重命名与新建文件夹契约：必须通过 promptModal 挂起并受控提交
  assert.match(
    pageSrc,
    /handleRenameProject\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*setPromptModal\s*\(/,
    '项目重命名必须调度 setPromptModal 打开规范输入框',
  )
  assert.match(
    pageSrc,
    /handleRenamePage\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*setPromptModal\s*\(/,
    '创作页重命名必须调度 setPromptModal 打开规范输入框',
  )
  assert.match(
    pageSrc,
    /handleCreateFolder\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*setPromptModal\s*\(/,
    '新建文件夹必须调度 setPromptModal 打开规范输入框',
  )
})
