/**
 * P1-2 回归：「编辑」「创建副本」两个入口必须先切换会话再激活画布。
 *
 * 只把 project.sessionId 传给 activateProjectCanvas 而不切会话，
 * better-sidebar 会把 openTab 排队到非前台会话：当前会话毫无变化，调用方却
 * 弹成功提示。这里锁定源码契约：先 focusAppSession，切换失败走失败文案。
 * 现行 DSH 壳已移除 sessions.open（0.1.7 起），切换只能走
 * focusSessionForCanvas（uiWorkspace.openSession，旧宿主回退 sessions.open）。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appTabSrc = readFileSync(join(here, 'AppTab.jsx'), 'utf8')

function callbackBody(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = appTabSrc.match(new RegExp(`const ${escaped} = useCallback\\(async \\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\}, \\[`))
  assert.ok(match, `必须找到 ${name} 定义`)
  return match[1]
}

function assertSessionOpenedBeforeCanvas(body, label) {
  const focusAt = body.indexOf('focusAppSession(project?.sessionId)')
  const activateAt = body.indexOf('activateProjectCanvas(')
  assert.ok(focusAt >= 0, `${label} 必须在激活画布前切换到应用所属会话`)
  assert.ok(activateAt >= 0, `${label} 必须调用 activateProjectCanvas`)
  assert.ok(focusAt < activateAt, `${label} 必须先切换会话再激活画布，否则 openTab 会被排队到非前台会话`)
}

describe('P1-2 应用卡片入口先切会话再激活画布', () => {
  it('统一的会话切换辅助调用 focusSessionForCanvas，而不是已移除的 sessions.open', () => {
    assert.match(appTabSrc, /const focusAppSession = useCallback\(/, '必须提供统一的会话切换辅助')
    assert.match(appTabSrc, /focusSessionForCanvas\(/, '必须走现行会话导航接缝')
    assert.match(appTabSrc, /getSessionNavigation: props\?\.getSessionNavigation/, '必须显式传入会话导航接缝')
    assert.doesNotMatch(appTabSrc, /sessions\?\.open\(/, '不得再依赖 DSH 0.1.7 已移除的 sessions.open')
  })

  it('「编辑」入口：先切会话，切换失败明确降级且不弹成功提示', () => {
    const body = callbackBody('handleEditApp')
    assertSessionOpenedBeforeCanvas(body, '编辑入口')
    assert.match(body, /if \(!focusAppSession\(project\?\.sessionId\)\)/, '切换会话失败必须提前返回')
    assert.match(body, /无法切换到应用所属会话，请重试。/, '切换会话失败必须给出明确失败文案')
    const failureBlock = body.match(/if \(!focusAppSession\(project\?\.sessionId\)\) \{([\s\S]*?)\n        \}/)
    assert.ok(failureBlock, '切换会话失败必须走独立降级分支')
    assert.doesNotMatch(failureBlock[1], /已进入应用源画布/, '切换失败的降级分支不得弹成功提示')
  })

  it('「创建副本」入口：先切会话，切换失败不弹成功提示', () => {
    const body = callbackBody('handleForkSubmit')
    assert.match(body, /const sessionReady = focusAppSession\(project\?\.sessionId\)/, '必须记录会话切换结果')
    assertSessionOpenedBeforeCanvas(body, '创建副本入口')
    assert.match(body, /sessionReady\s*\n?\s*\? await activateProjectCanvas\(/, '会话没切成功时不得激活画布')
    assert.match(body, /else if \(sessionReady\)/, '打开失败与会话切换失败必须区分降级')
    assert.match(body, /副本已创建，但无法切换到所属会话，请到项目库查看。/, '切换失败必须给出明确失败文案')
  })
})
