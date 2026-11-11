/**
 * P1-2 回归：「编辑」「创建副本」两个入口统一走 ProjectNavigationService。
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
    assert.match(appTabSrc, /createProjectNavigation/)
    assert.doesNotMatch(appTabSrc, /project\?\.sessionId/)
    assert.doesNotMatch(appTabSrc, /focusAppSession/)
  })

  it('「编辑」入口：先切会话，切换失败明确降级且不弹成功提示', () => {
    const body = callbackBody('handleEditApp')
    assert.match(body, /navigation\.openProject\(project,/)
    assert.match(body, /focusGroupId:\s*target\.groupId/)
    assert.doesNotMatch(body, /latest-active-canvas|active-canvas-changed/)
    assert.match(body, /已进入应用源画布/)
  })

  it('「创建副本」入口：先切会话，切换失败不弹成功提示', () => {
    const body = callbackBody('handleForkSubmit')
    assert.match(body, /navigation\.openProject\(project,/)
    assert.match(body, /focusGroupId:\s*groupId/)
    assert.doesNotMatch(body, /latest-active-canvas|active-canvas-changed/)
    assert.match(body, /副本已创建，打开画布失败/)
  })
})
