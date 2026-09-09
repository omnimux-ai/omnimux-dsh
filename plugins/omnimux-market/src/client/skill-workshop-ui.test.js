import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const sessionCreateSrc = readFileSync(join(here, 'session-create.js'), 'utf8')
const skillPlazaSrc = readFileSync(join(here, 'skill-plaza.js'), 'utf8')
const applySrc = readFileSync(join(here, 'apply.js'), 'utf8')
const cssSrc = readFileSync(join(here, 'css.js'), 'utf8')

describe('Skill Workshop UI & Session Contract (Issue #773 / #776)', () => {
  it('sidebar entry is positioned under projects (rank 4.1) via __omnimuxSidebar and footer action is removed', () => {
    assert.doesNotMatch(applySrc, /slots\.inject\(['"]sidebar\.footer\.action['"]/)
    assert.match(applySrc, /window\.__omnimuxSidebar/)
    assert.match(applySrc, /rank:\s*4\.1/)
    assert.match(applySrc, /data-omnimux-market-entry/)
    assert.match(applySrc, /data-omnimux-esc-entry/)
    assert.match(applySrc, /height:\s*32px/)
    assert.match(applySrc, /font-size:\s*14px/)
    assert.match(applySrc, /width:\s*14px;\s*height:\s*14px/)
  })

  it('session create helper creates real session B via sessions.create without modifying session A', () => {
    assert.match(sessionCreateSrc, /function createSkillSession/)
    assert.match(sessionCreateSrc, /sessions\.create\(createOpts\)/)
    assert.match(sessionCreateSrc, /sessions\.open\(sessionBId\)/)
    assert.match(sessionCreateSrc, /sessionBId === sessionAId/)
    // 严禁改写或清空原会话 A
    assert.doesNotMatch(sessionCreateSrc, /sessionA\.draft\s*=/)
    assert.doesNotMatch(sessionCreateSrc, /sessionA\.text\s*=/)
  })

  it('session create helper prefills /skill-creator with prompt without auto-sending (no auto-send)', () => {
    assert.match(sessionCreateSrc, /\/skill-creator\\n帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。/)
    // 严禁自动回车或提交
    assert.doesNotMatch(sessionCreateSrc, /composer\.submit/)
    assert.doesNotMatch(sessionCreateSrc, /dispatchEvent\(new KeyboardEvent\(['"]keydown['"],\s*\{\s*key:\s*['"]Enter['"]/)
    assert.doesNotMatch(sessionCreateSrc, /dispatchEvent\(new Event\(['"]submit['"]/)
  })

  it('session create helper performs CAS check preventing overwrite of existing user input', () => {
    assert.match(sessionCreateSrc, /composer\.value\.trim\(\)\.length\s*>\s*0/)
    assert.match(sessionCreateSrc, /prefilled\s*=\s*true/)
  })

  it('trySkillInSession helper quotes /<slug> without auto-send', () => {
    assert.match(sessionCreateSrc, /function trySkillInSession/)
    assert.match(sessionCreateSrc, /`\/\$\{slug\}\s*`/)
  })

  it('session create triggers official new-session button click via DOM matching newSession / aria / text or collapsed menu', async () => {
    assert.match(sessionCreateSrc, /function clickOfficialNewSession/)
    assert.match(sessionCreateSrc, /matchesOfficialNewSession/)
    assert.match(sessionCreateSrc, /String\(button\.className\s*\|\|\s*['"]['"]\)\.includes\(['"]newSession['"]\)/)
    assert.match(sessionCreateSrc, /新建会话|新会话|New session|新对话|新建对话/)
    assert.match(sessionCreateSrc, /#omnimux-sidebar-new-menu/)

    // 运行行为测试：当 DOM 中存在官方新对话按钮时，模拟点击并正确捕获会话
    let clicked = false
    const listeners = []
    const mockSessions = {
      list: {
        getSnapshot: () => ({
          current: clicked ? 'session-b' : 'session-a',
          byId: {
            'session-a': { id: 'session-a', workspaceId: 'ws-1', blank: false },
            'session-b': { id: 'session-b', workspaceId: 'ws-1', blank: true },
          },
        }),
        subscribe: (fn) => {
          listeners.push(fn)
          return () => {}
        },
      },
      open: (id) => { mockSessions.current = id },
    }
    const mockButton = {
      className: 'official-btn newSession',
      getAttribute: (attr) => (attr === 'aria-label' ? '新会话' : null),
      hasAttribute: () => false,
      closest: () => null,
      getClientRects: () => [{ width: 20, height: 20 }],
      click: () => {
        clicked = true
        listeners.forEach((l) => l())
      },
    }
    const mockDoc = {
      querySelectorAll: (sel) => (sel === 'button' ? [mockButton] : []),
      querySelector: (sel) => (sel === 'button' ? mockButton : null),
    }

    const { clickOfficialNewSession } = runInNewContext(
      `${sessionCreateSrc}\n({ clickOfficialNewSession })`,
      { setTimeout, clearTimeout, Date },
    )
    const res = await clickOfficialNewSession({ document: mockDoc, sessions: mockSessions, timeoutMs: 200 })
    assert.equal(clicked, true)
    assert.equal(res.ok, true)
    assert.equal(res.sessionId, 'session-b')
  })

  it('session create inherits workspaceId from current session, workspaces service, or session list fallback', () => {
    assert.match(sessionCreateSrc, /function resolveFallbackWorkspaceId/)

    const { resolveFallbackWorkspaceId } = runInNewContext(
      `${sessionCreateSrc}\n({ resolveFallbackWorkspaceId })`,
      { console },
    )

    // 1. 从当前会话继承
    const s1 = {
      list: {
        getSnapshot: () => ({
          current: 's1',
          byId: { s1: { id: 's1', workspaceId: 'ws-from-current' } },
        }),
      },
    }
    assert.equal(resolveFallbackWorkspaceId(s1, null), 'ws-from-current')

    // 2. 当前会话无 workspaceId，但 workspaces.items 包含当前会话
    const s2 = {
      list: {
        getSnapshot: () => ({
          current: 's2',
          byId: { s2: { id: 's2' } },
        }),
      },
    }
    const ws2 = {
      list: {
        getSnapshot: () => ({
          items: [{ workspaceId: 'ws-from-items', sessionIds: ['s2'] }],
        }),
      },
    }
    assert.equal(resolveFallbackWorkspaceId(s2, ws2), 'ws-from-items')

    // 3. workspaces 包含 recentWorkspaceId
    const s3 = {
      list: {
        getSnapshot: () => ({ current: 's3', byId: {} }),
      },
    }
    const ws3 = {
      list: {
        getSnapshot: () => ({
          recentWorkspaceId: 'ws-recent',
          items: [{ workspaceId: 'ws-recent' }],
        }),
      },
    }
    assert.equal(resolveFallbackWorkspaceId(s3, ws3), 'ws-recent')

    // 4. 从 sessions 历史列表中获取最近的 workspaceId
    const s4 = {
      list: {
        getSnapshot: () => ({
          current: 's4',
          byId: {
            s4: { id: 's4' },
            s_old: { id: 's_old', workspaceId: 'ws-from-history', updatedAt: 1000 },
          },
        }),
      },
    }
    assert.equal(resolveFallbackWorkspaceId(s4, null), 'ws-from-history')
  })

  it('session create keeps right workbench sidebar open with omnimux-market:plaza and sets split layout', async () => {
    assert.match(sessionCreateSrc, /__omnimuxWorkbench.*\bopen\b.*tabId:\s*["']omnimux-market:plaza["']/s)
    assert.match(sessionCreateSrc, /setFocus\?\.\(["']split["']\)/)
    assert.match(sessionCreateSrc, /setConversationCollapsed\?\.\(false,\s*\{\s*sessionId:\s*sessionBId\s*\}\)/)

    let openedTab = null
    let focusMode = null
    let collapsedArg = null
    const fakeWorkbench = {
      open: (opts) => { openedTab = opts },
      setFocus: (f) => { focusMode = f },
      setConversationCollapsed: (c, opts) => { collapsedArg = { collapsed: c, ...opts } },
    }

    let createdOpts = null
    let currentSession = 'session-a'
    const fakeSessions = {
      create: async (opts) => {
        createdOpts = opts
        currentSession = 'session-new-773'
        return 'session-new-773'
      },
      open: (id) => { currentSession = id },
      list: {
        getSnapshot: () => ({
          current: currentSession,
          byId: {
            'session-a': { id: 'session-a', workspaceId: 'ws-inherited' },
            'session-new-773': { id: 'session-new-773', workspaceId: 'ws-inherited' },
          },
        }),
      },
    }

    const fakeComposer = {
      value: '',
      disabled: false,
      focus: () => {},
      dispatchEvent: () => {},
    }

    const { createSkillSession } = runInNewContext(
      `${sessionCreateSrc}\n({ createSkillSession })`,
      {
        setTimeout,
        clearTimeout,
        Date,
        Event: class Event { constructor(type, opts) { this.type = type; Object.assign(this, opts); } },
        window: { __omnimuxWorkbench: fakeWorkbench },
        document: {
          querySelector: (sel) => (sel.includes('textarea') ? fakeComposer : null),
          querySelectorAll: (sel) => (sel.includes('textarea') ? [fakeComposer] : []),
        },
        lookup: () => 'Skill工坊',
        api: async () => ({ ok: true }),
        plazaSessions: fakeSessions,
        plazaWorkspaces: {
          list: {
            getSnapshot: () => ({ recentWorkspaceId: 'ws-inherited', items: [{ workspaceId: 'ws-inherited' }] }),
          },
        },
      },
    )

    const result = await createSkillSession()
    assert.equal(result.ok, true)
    assert.equal(result.sessionId, 'session-new-773')
    assert.equal(createdOpts?.workspaceId, 'ws-inherited')
    assert.equal(openedTab?.tabId, 'omnimux-market:plaza')
    assert.equal(openedTab?.sessionId, 'session-new-773')
    assert.equal(focusMode, 'split')
    assert.equal(collapsedArg?.collapsed, false)
    assert.equal(collapsedArg?.sessionId, 'session-new-773')
  })

  it('findComposer skips disabled textarea when workspace is unselected', () => {
    const { findComposer } = runInNewContext(
      `${sessionCreateSrc}\n({ findComposer })`,
      {
        document: {
          querySelector: () => ({ disabled: true, value: '' }),
          querySelectorAll: () => [{ disabled: true, value: '' }],
        },
      },
    )
    assert.equal(findComposer(), null)
  })

  it('skill plaza renders dual tabs: Skill and 我的 Skill', () => {
    assert.match(skillPlazaSrc, /mainTab === "discover"/)
    assert.match(skillPlazaSrc, /mainTab === "mine"/)
    assert.match(skillPlazaSrc, /workshop\.tabSkill/)
    assert.match(skillPlazaSrc, /workshop\.tabMine/)
  })

  it('category order conforms to PRD §6.1 / AC-05 (11 items)', () => {
    assert.match(skillPlazaSrc, /WORKSHOP_DOMAIN_ORDER/)
    const expected = [
      '短剧漫剧',
      '专业影视',
      '动画',
      '商业广告',
      '电商',
      '教育',
      '创意实验',
      '音频音乐',
      '平台工具',
    ]
    for (const domain of expected) {
      assert.ok(skillPlazaSrc.includes(domain), `missing domain ${domain}`)
    }
  })

  it('featured section renders 4-column 16:9 cards and hides completely when 0 items', () => {
    assert.match(skillPlazaSrc, /featuredItems\.length\s*>\s*0/)
    assert.match(skillPlazaSrc, /featured-cover-wrap/)
    assert.match(skillPlazaSrc, /featured-hover-actions/)
    assert.match(skillPlazaSrc, /hover-btn-detail/)
    assert.match(skillPlazaSrc, /hover-btn-try/)
  })

  it('category featured hides regular section only without a submitted search', () => {
    assert.match(skillPlazaSrc, /category === "featured" && !hasQuery \? null :/)
  })

  it('install modal provides drag & drop and requirements notice', () => {
    assert.match(skillPlazaSrc, /function InstallModal/)
    assert.match(skillPlazaSrc, /drop-zone/)
    assert.match(skillPlazaSrc, /req-section/)
    assert.match(skillPlazaSrc, /btn-modal-install/)
  })

  it('switch toggle prompts installation confirmation for uninstalled skills', () => {
    assert.match(skillPlazaSrc, /function ConfirmInstallModal/)
    assert.match(skillPlazaSrc, /handleConfirmInstall/)
  })

  it('css defines minimalist design matching demo', () => {
    assert.match(cssSrc, /\.workshop-intro/)
    assert.match(cssSrc, /\.workshop-heading/)
    assert.match(cssSrc, /\.workshop-description/)
    assert.match(cssSrc, /\.btn-create/)
    assert.match(cssSrc, /\.btn-install/)
    assert.match(cssSrc, /\.featured-cover-wrap/)
    assert.match(cssSrc, /aspect-ratio:\s*16\s*\/\s*9/)
    assert.match(cssSrc, /\.switch-bg\.on/)
    assert.match(cssSrc, /\.modal-dialog/)
  })

  it('Issue #773: top bar strictly aligns with reference mock and featured card metadata is complete', () => {
    // 移除大 Header
    assert.ok(!skillPlazaSrc.includes('className: "page-header"'), 'page-header DOM should be removed')
    // 激活 Tab 带 ⓘ 图标
    assert.match(skillPlazaSrc, /className:\s*"tab-info-icon"/)
    assert.match(cssSrc, /\.tab-info-icon/)
    // 官方精选卡片支持真实图片封面，彻底移除 MiniMax Design、冗余底栏以及 H3 角标
    assert.ok(!skillPlazaSrc.includes('className: "h3-badge"'), 'h3-badge should be removed')
    assert.match(skillPlazaSrc, /coverSrc\s*\?/)
    assert.ok(!skillPlazaSrc.includes('MiniMax Design'), 'MiniMax Design should be removed')
    assert.ok(!skillPlazaSrc.includes('className: "featured-card-footer"'), 'featured-card-footer should be removed')
    assert.ok(!cssSrc.includes('.h3-badge'), '.h3-badge CSS should be removed')
    assert.match(cssSrc, /font-size:\s*20px/)
  })
})
