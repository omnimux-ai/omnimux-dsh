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

describe('P1-2 应用卡片入口走工作区锚定的项目导航', () => {
  it('AppTab 引入 ProjectNavigationService，且不再使用 project.sessionId', () => {
    assert.match(appTabSrc, /createProjectNavigation/)
    assert.doesNotMatch(appTabSrc, /project\?\.sessionId/)
    assert.doesNotMatch(appTabSrc, /focusAppSession/)
  })

  it('「编辑」入口：委托 navigation.openProject 并保留 focusGroup', () => {
    const body = callbackBody('handleEditApp')
    assert.match(body, /navigation\.openProject\(project,/)
    assert.match(body, /focusGroupId:\s*target\.groupId/)
    assert.doesNotMatch(body, /latest-active-canvas|active-canvas-changed/)
    assert.match(body, /已进入应用源画布/)
  })

  it('「创建副本」入口：委托 navigation.openProject 并保留 focusGroup', () => {
    const body = callbackBody('handleForkSubmit')
    assert.match(body, /navigation\.openProject\(project,/)
    assert.match(body, /focusGroupId:\s*groupId/)
    assert.doesNotMatch(body, /latest-active-canvas|active-canvas-changed/)
    assert.match(body, /副本已创建，打开画布失败/)
  })
})
