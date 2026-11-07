/**
 * E2E: TikTok 官方发布最小闭环准备（恢复「发布/账号」顶层切换、空账号一键去绑定、移除假排期与日历入口，Issue #3898）
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zh, en } from '../../src/client/locales.js'
import { handleTabKey } from '../../src/client/tab-keyboard.js'
import { showsPrivateNotice } from '../../src/client/detail-notice.js'

const here = dirname(fileURLToPath(import.meta.url))
const clientDir = join(here, '../../src/client')
const stageSrc = readFileSync(join(clientDir, 'PublishStage.jsx'), 'utf8')
const accountsSidebarSrc = readFileSync(join(clientDir, 'AccountsSidebar.jsx'), 'utf8')
const controlBarSrc = readFileSync(join(clientDir, 'views/PublishControlBar.jsx'), 'utf8')
const viewportSrc = readFileSync(join(clientDir, 'views/PublishViewport.jsx'), 'utf8')
const accountPanelSrc = readFileSync(join(clientDir, 'AccountPanel.jsx'), 'utf8')
const composerSrc = readFileSync(join(clientDir, 'Composer/index.jsx'), 'utf8')

describe('TikTok publish minimal loop E2E contracts (Issue #3898)', () => {
  it('restores StageViewSwitch (publish / accounts) inside sticky header and mounts AccountsSidebar', () => {
    assert.deepEqual(['publish', 'accounts'], ['publish', 'accounts'])
    assert.match(stageSrc, /export const STAGE_VIEWS = \['publish', 'accounts'\]/)
    assert.match(stageSrc, /export function StageViewSwitch\(/)
    assert.match(stageSrc, /<StageViewSwitch\s+t=\{t\}\s+stageView=\{stageView\}\s+onChange=\{setStageView\}\s*\/>/)
    assert.match(stageSrc, /<AccountsSidebar\s+t=\{t\}\s*\/>/)
    assert.equal(zh['stage.view.publish'], '发布')
    assert.equal(zh['stage.view.accounts'], '账号')
    assert.equal(en['stage.view.publish'], 'Publish')
    assert.equal(en['stage.view.accounts'], 'Accounts')
  })

  it('wires empty AccountPanel in Composer to jump directly to Accounts view via onManageAccounts', () => {
    assert.match(accountPanelSrc, /onManageAccounts/)
    assert.match(accountPanelSrc, /t\('acct\.add'\)/)
    assert.match(composerSrc, /onManageAccounts=\{onManageAccounts\}/)
    assert.match(stageSrc, /const handleManageAccounts = \(\) => \{/)
  })

  it('removes unsupported modeFilter dropdown and calendar view switcher from PublishControlBar and PublishViewport', () => {
    assert.doesNotMatch(controlBarSrc, /filter\.mode/)
    assert.doesNotMatch(controlBarSrc, /view\.calendar/)
    assert.doesNotMatch(controlBarSrc, /IconCalendarOutline16/)
    assert.doesNotMatch(viewportSrc, /CalendarView/)
  })

  it('upgrades AccountsSidebar search control to SearchField and binds handleTabKey on StageViewSwitch', () => {
    assert.match(accountsSidebarSrc, /SearchField/)
    assert.doesNotMatch(accountsSidebarSrc, /<input\s+type="search"/)
    assert.match(stageSrc, /onKeyDown=\{handleTabKey\}/)

    const publishTab = { focused: 0, clicked: 0, focus() { publishTab.focused += 1 }, click() { publishTab.clicked += 1 } }
    const accountsTab = { focused: 0, clicked: 0, focus() { accountsTab.focused += 1 }, click() { accountsTab.clicked += 1 } }
    let prevented = false
    handleTabKey({
      key: 'ArrowRight',
      target: publishTab,
      currentTarget: { querySelectorAll: () => [publishTab, accountsTab] },
      preventDefault() { prevented = true },
    })
    assert.equal(prevented, true)
    assert.equal(accountsTab.focused, 1)
    assert.equal(accountsTab.clicked, 1)
  })

  it('shows the pre-review private-visibility notice for a live TikTok direct subtask', async () => {
    const recordDetailSrc = readFileSync(join(clientDir, 'RecordDetail.jsx'), 'utf8')
    assert.match(recordDetailSrc, /showsPrivateNotice\(tasks, record\)/)
    assert.match(recordDetailSrc, /t\('detail\.privateNotice'\)/)
    assert.equal(showsPrivateNotice([{ platform: 'tiktok', provider: 'tiktok_direct', status: 'submitted', post_id: 'p1' }]), true)
    assert.equal(showsPrivateNotice([{ platform: 'tiktok', provider: 'tiktok_direct', status: 'failed', post_id: 'p1' }]), false)
    assert.equal(showsPrivateNotice([{ platform: 'tiktok', provider: 'tiktok_direct', status: 'submitted' }]), false)
    assert.equal(showsPrivateNotice(
      [{ platform: 'tiktok', provider: 'tiktok_direct', status: 'published', post_id: 'p1' }],
      { settings: { tiktok_options: { privacy_level: 'PUBLIC_TO_EVERYONE' } } },
    ), false)
    assert.equal(zh['detail.privateNotice'].includes('仅自己可见'), true)
    assert.equal(en['detail.privateNotice'].includes('Only you'), true)
  })
})
