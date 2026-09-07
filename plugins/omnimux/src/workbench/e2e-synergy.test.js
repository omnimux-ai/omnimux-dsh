import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHubEventBus } from '../events/hub-event-bus.js'
import { createWorkbenchMailbox } from './mailbox.js'
import { mountWorkbenchTools } from './tools.js'
import { JSON_TOOL_OUTPUT } from '../tools/schema.js'
import { createEventsClient } from '../client/events-client.js'
import { formatCompactContextBlock } from '../client/workbench/context.js'
import { attachComposerEnvelope } from '../client/composer-envelope.js'

describe('Agent-Workbench Synergy End-to-End Closed Loop', () => {
  it('verifies full cycle: context capture -> tool execution -> RPC bridge -> event invalidation', async () => {
    // 1. Setup Hub Host bus & mailbox & tools
    const bus = createHubEventBus()
    const mailbox = createWorkbenchMailbox({ hubEvents: bus })
    const tools = new Map()
    const fakeCtx = { tools: { register: (t) => tools.set(t.name, t) } }
    mountWorkbenchTools(fakeCtx, { mailbox, jsonOut: JSON_TOOL_OUTPUT })

    // 2. Client side setup
    let currentTab = 'omnimux-assets:library'
    const openWorkbenchMock = async ({ tabId }) => {
      currentTab = tabId
      return true
    }

    const fakeWorkbench = {
      open: openWorkbenchMock,
      getUiContext: () => ({
        schemaVersion: 1,
        ok: true,
        capturedAt: Date.now(),
        surface: { tabId: currentTab, panelOpen: true, focus: 'gui' },
        view: { filterType: 'character' },
        selection: [{ id: 'ast_101', name: '测试角色' }],
      }),
      formatCompactContextBlock,
    }

    const eventsClient = createEventsClient({
      getWorkbench: () => fakeWorkbench,
      fetch: async (url, opts) => {
        if (url.includes('/viewport')) {
          const body = JSON.parse(opts.body)
          mailbox.updateViewport(body)
          return { ok: true }
        }
        if (url.includes('/rpc/ack')) {
          const body = JSON.parse(opts.body)
          mailbox.handleRpcAck(body)
          return { ok: true }
        }
        return { ok: true }
      },
    })

    // Forward bus emits directly to eventsClient for in-memory E2E
    bus.subscribe((ev) => {
      eventsClient.notifyMessageForTests(ev)
    })

    // Step A: User is in assets library, composer sends message -> UI Context is attached
    const fakeTextarea = { value: '请帮我生成一张正面照', dispatchEvent: () => {} }
    const attached = attachComposerEnvelope(
      fakeTextarea,
      fakeWorkbench.getUiContext,
      fakeWorkbench.formatCompactContextBlock,
    )
    assert.equal(attached, true)
    assert.ok(fakeTextarea.value.includes('<ui_context schema="1">'))
    assert.ok(fakeTextarea.value.includes('tab: omnimux-assets:library'))
    assert.ok(fakeTextarea.value.includes('filter: character'))
    assert.ok(fakeTextarea.value.includes('selected: 测试角色 (ast_101)'))

    // Step B: Client reports viewport heartbeat to Host
    const initialView = mailbox.getActiveView()
    // Trigger heartbeat via eventsClient
    mailbox.updateViewport(fakeWorkbench.getUiContext())
    const activeView = mailbox.getActiveView()
    assert.equal(activeView.ok, true)
    assert.equal(activeView.stale, false)
    assert.equal(activeView.uiContext.surface.tabId, 'omnimux-assets:library')

    // Step C: Agent calls workbench_open_tab to switch to workflow canvas
    const openTool = tools.get('workbench_open_tab')
    const rpcPromise = openTool.execute({
      tabId: 'omnimux-workflow:canvas',
      reason: '已生成角色，正在切换至创作画布完成编排',
    })

    const rpcRes = await rpcPromise
    assert.equal(rpcRes.ok, true)
    assert.equal(rpcRes.applied, true)
    assert.equal(rpcRes.code, 'opened')
    assert.equal(currentTab, 'omnimux-workflow:canvas')
    assert.ok(rpcRes.undoToken.startsWith('undo_'))

    // Step D: Backend emits assets:changed -> Client receives instant invalidation
    let refreshed = false
    eventsClient.subscribe('omnimux:assets:changed', (ev) => {
      if (ev.payload.op === 'create') {
        refreshed = true
      }
    })

    bus.emit({
      type: 'omnimux:assets:changed',
      payload: {
        lrev: 12,
        arev: 3,
        op: 'create',
        ids: ['ast_new_img'],
        assetType: 'character',
        at: Date.now(),
      },
    })

    assert.equal(refreshed, true, 'Front-end client instantly caught omnimux:assets:changed without 5s poll!')
  })
})
