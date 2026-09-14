import assert from 'node:assert/strict'
import { bindWorkbenchDeps } from './workbench/host-adapter.js'
import { describe, it } from 'node:test'
import {
  formatCompactContextBlock,
  getUiContext,
  registerContextContributor,
} from './workbench/context.js'
import {
  installWorkbenchGlobal,
  resetWorkbenchForTests,
} from './workbench.js'

describe('Native sidebar context admission', () => {
  const media = 'omnimux:media-viewer'
  function setup({ expanded = true, tab = { id: 'tab:opaque', kind: media }, current = 'session-a' } = {}) {
    resetWorkbenchForTests()
    const state = { current, expanded, tab }
    bindWorkbenchDeps({
      sessions: { list: { getSnapshot: () => ({ current: state.current }) } },
      betterSidebar: { getSnapshot: () => ({ sessionId: 'stale-session', state: {
        panelOpen: true, activePane: 'pane:old',
        splits: { kind: 'leaf', id: 'pane:old', active: media, tabs: [{ id: media }] },
      } }) },
      sidebarRight: { active: () => state.tab, isExpanded: () => state.expanded },
    })
    return state
  }
  it('uses native kind for contributor/admission and retains opaque instance id', () => {
    setup()
    registerContextContributor(media, () => ({ view: { kind: 'media', activeMediaId: 'sample' } }))
    const value = getUiContext()
    assert.equal(value.surface.tabId, media)
    assert.equal(value.surface.instanceId, 'tab:opaque')
    assert.equal(value.surface.panelOpen, true)
    assert.equal(value.view.activeMediaId, 'sample')
    assert.equal(value.surface.openedTabs[0].id, 'tab:opaque')
  })
  it('does not revive closed native sidebar from stale legacy true', () => {
    setup({ expanded: false })
    assert.equal(getUiContext().surface.panelOpen, false)
    assert.equal(getUiContext().reason, 'panel-collapsed')
  })
  it('rejects absent mounted active tab despite expanded and stale legacy true', () => {
    setup({ tab: null })
    assert.equal(getUiContext().surface.tabId, null)
    assert.equal(getUiContext().surface.panelOpen, false)
  })
  it('does not treat a media-shaped instance id as the media kind', () => {
    setup({ tab: { id: media, kind: 'editor' } })
    assert.equal(getUiContext().surface.tabId, 'editor')
    assert.equal(getUiContext().surface.instanceId, media)
  })
  it('reads current session on each call and never falls back to stale legacy session', () => {
    const state = setup()
    assert.equal(getUiContext().sessionId, 'session-a')
    state.current = 'session-b'
    state.tab = { id: 'tab:b', kind: 'editor' }
    assert.equal(getUiContext().sessionId, 'session-b')
    assert.equal(getUiContext().surface.tabId, 'editor')
    state.current = undefined
    assert.equal(getUiContext().sessionId, 'default')
    assert.equal(getUiContext().surface.panelOpen, false)
    assert.equal(getUiContext().surface.tabId, null)
  })
  it('restores the pure legacy read only when optional native API is removed', () => {
    setup({ expanded: false })
    bindWorkbenchDeps({ sidebarRight: null })
    assert.equal(getUiContext().surface.panelOpen, true)
    assert.equal(getUiContext().surface.tabId, media)
    assert.equal(getUiContext().surface.instanceId, undefined)
  })
})

describe('Workbench UI Context and Envelope', () => {
  it('formats compact context block correctly', () => {
    const envelope = {
      schemaVersion: 1,
      ok: true,
      capturedAt: Date.now(),
      surface: {
        tabId: 'omnimux-assets:library',
        panelOpen: true,
        focus: 'gui',
      },
      view: {
        filterType: 'character',
        query: 'hero',
      },
      selection: [
        { id: 'ast_1', name: '林晓' },
      ],
    }

    const block = formatCompactContextBlock(envelope)
    assert.ok(block.includes('<ui_context schema="1">'))
    assert.ok(block.includes('tab: omnimux-assets:library'))
    assert.ok(block.includes('filter: character'))
    assert.ok(block.includes('query: hero'))
    assert.ok(block.includes('selected: 林晓 (ast_1)'))
    assert.ok(block.includes('panel: open | focus: gui'))
    assert.ok(block.includes('</ui_context>'))
  })

  it('formats canvas workspace routing keys in compact block', () => {
    const envelope = {
      schemaVersion: 1,
      ok: true,
      capturedAt: Date.now(),
      surface: {
        tabId: 'omnimux-workflow:canvas',
        title: '创作画布',
        panelOpen: true,
        focus: 'split',
      },
      view: {
        kind: 'canvas',
        pageId: 'workflow-canvas',
        extra: { workspaceId: 'ws_5b511f810d9f', secretPath: '/Users/x/secret' },
      },
      selection: [],
    }
    const block = formatCompactContextBlock(envelope)
    assert.ok(block.includes('view: canvas'))
    assert.ok(block.includes('page: workflow-canvas'))
    assert.ok(block.includes('workspace: ws_5b511f810d9f'))
    assert.equal(block.includes('secretPath'), false)
    assert.equal(block.includes('/Users/'), false)
  })

  it('rejects path-like workspace ids from compact block', () => {
    const block = formatCompactContextBlock({
      schemaVersion: 1,
      ok: true,
      capturedAt: Date.now(),
      surface: { tabId: 'omnimux-workflow:canvas', panelOpen: true },
      view: { kind: 'canvas', extra: { workspaceId: '/tmp/evil' } },
    })
    assert.equal(block.includes('workspace:'), false)
  })

  it('collects context from registered contributor', () => {
    resetWorkbenchForTests()
    const api = installWorkbenchGlobal()

    const unsub = api.registerContextContributor('omnimux-assets:library', () => ({
      view: { filterType: 'scene' },
      selection: [{ id: 'ast_sc1', name: '夜市' }],
    }))

    // Without betterSidebar service, getUiContext still builds a safe envelope
    const ctx = api.getUiContext()
    assert.equal(ctx.schemaVersion, 1)
    assert.equal(ctx.ok, true)
    assert.ok(typeof ctx.capturedAt === 'number')

    unsub()
  })

  it('correctly reads state from snap.state when panel is open', () => {
    resetWorkbenchForTests()
    const api = installWorkbenchGlobal()
    api.bind({
      betterSidebar: {
        getSnapshot: () => ({
          sessionId: 'ses_test',
          state: {
            panelOpen: true,
            activePane: 'pane:1',
            splits: {
              kind: 'leaf',
              id: 'pane:1',
              tabs: [{ id: 'omnimux-assets:library' }],
              active: 'omnimux-assets:library',
            },
          },
        }),
      },
    })

    const ctx = api.getUiContext()
    assert.equal(ctx.ok, true)
    assert.equal(ctx.reason, 'ok')
    assert.equal(ctx.surface.panelOpen, true)
    assert.equal(ctx.surface.tabId, 'omnimux-assets:library')
    assert.equal(ctx.surface.title, '资产库')
  })

  it('describes native Files editor tab with human title (not opaque tab:N)', () => {
    resetWorkbenchForTests()
    const api = installWorkbenchGlobal()
    api.bind({
      betterSidebar: {
        getSnapshot: () => ({
          sessionId: 'ses_native',
          state: {
            panelOpen: true,
            activePane: 'pane:1',
            splits: {
              kind: 'leaf',
              id: 'pane:1',
              tabs: [
                { id: 'tab:5', type: 'editor', title: 'Files', meta: { treeOpen: true } },
                { id: 'omnimux-workflow:canvas', type: 'omnimux-workflow:canvas', title: '创作画布' },
              ],
              active: 'omnimux-workflow:canvas',
            },
          },
        }),
      },
    })

    const ctx = api.getUiContext()
    assert.equal(ctx.ok, true)
    assert.equal(ctx.surface.tabId, 'omnimux-workflow:canvas')
    assert.equal(ctx.surface.title, '创作画布')
    assert.equal(ctx.surface.openedTabs.length, 2)
    assert.equal(ctx.surface.openedTabs[0].id, 'tab:5')
    assert.equal(ctx.surface.openedTabs[0].title, 'Files')
    assert.equal(ctx.surface.openedTabs[0].kind, 'files')
    assert.equal(ctx.surface.openedTabs[1].kind, 'workbench')

    const block = formatCompactContextBlock(ctx)
    assert.ok(block.includes('创作画布'))
    assert.ok(block.includes('Files'))
    assert.ok(block.includes('open:'))
  })
})
