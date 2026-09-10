import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createWorkbenchContextMessage, mountWorkbenchContextInjector } from './context-injector.js'

describe('Workbench Context Injector', () => {
  it('creates native DSH context user message with correct snapshot structure', () => {
    const text = '<ui_context schema="1">\ntab: omnimux-assets:library\n</ui_context>'
    const msg = createWorkbenchContextMessage(text)

    assert.equal(msg.role, 'user')
    assert.equal(typeof msg.id, 'string')
    assert.deepEqual(msg.content, [{ type: 'text', text }])
    assert.equal(msg.source.kind, 'plugin')
    assert.equal(msg.source.plugin, 'omnimux-workbench')
    assert.equal(msg.source.form, 'snapshot')
    assert.deepEqual(msg.source.sections, [{
      name: 'workbench-viewport',
      text,
    }])
  })

  it('skips injection on step > 1', async () => {
    const listeners = new Map()
    const ctx = {
      on: (ev, fn) => { listeners.set(ev, fn); return () => {} },
    }
    const mailbox = {
      getActiveView: () => ({
        ok: true,
        uiContext: {
          surface: { tabId: 'omnimux-assets:library', panelOpen: true },
        },
      }),
    }

    mountWorkbenchContextInjector(ctx, { mailbox })
    const handler = listeners.get('agent/pre-step')

    const decision = await handler(
      { agent: { session: { id: 's1' } }, turn: 1, step: 2, signal: {} },
      async () => ({ kind: 'enter', messages: [] }),
    )

    assert.equal(decision.messages.length, 0)
  })

  it('skips injection when panel is closed or tabId is missing', async () => {
    const listeners = new Map()
    const ctx = {
      on: (ev, fn) => { listeners.set(ev, fn); return () => {} },
    }
    let panelOpen = false
    let tabId = 'omnimux-assets:library'
    const mailbox = {
      getActiveView: () => ({
        ok: true,
        uiContext: {
          surface: { tabId, panelOpen },
        },
      }),
    }

    mountWorkbenchContextInjector(ctx, { mailbox })
    const handler = listeners.get('agent/pre-step')

    // 1. Panel closed
    const res1 = await handler(
      { agent: { session: { id: 's1' } }, turn: 1, step: 1, signal: {} },
      async () => ({ kind: 'enter', messages: [] }),
    )
    assert.equal(res1.messages.length, 0)

    // 2. TabId empty
    panelOpen = true
    tabId = null
    const res2 = await handler(
      { agent: { session: { id: 's1' } }, turn: 1, step: 1, signal: {} },
      async () => ({ kind: 'enter', messages: [] }),
    )
    assert.equal(res2.messages.length, 0)
  })

  it('injects context message when panel is open on step 1', async () => {
    const listeners = new Map()
    const ctx = {
      on: (ev, fn) => { listeners.set(ev, fn); return () => {} },
    }
    const mailbox = {
      getActiveView: (sessionId) => ({
        ok: true,
        sessionId,
        uiContext: {
          schemaVersion: 1,
          ok: true,
          capturedAt: Date.now(),
          surface: { tabId: 'omnimux-inspiration:library', title: '灵感库', panelOpen: true, focus: 'split' },
          view: { kind: 'grid' },
        },
      }),
    }

    mountWorkbenchContextInjector(ctx, { mailbox })
    const handler = listeners.get('agent/pre-step')

    const userMsg = { role: 'user', content: [{ type: 'text', text: '分析视频 https://example.com' }] }
    const decision = await handler(
      { agent: { session: { id: 'session-xyz' } }, turn: 1, step: 1, signal: {} },
      async () => ({ kind: 'enter', messages: [userMsg] }),
    )

    assert.equal(decision.messages.length, 2)
    assert.equal(decision.messages[0], userMsg) // Original user message untouched!
    const contextMsg = decision.messages[1]
    assert.equal(contextMsg.source.kind, 'plugin')
    assert.equal(contextMsg.source.plugin, 'omnimux-workbench')
    assert.equal(contextMsg.source.form, 'snapshot')
    assert.ok(contextMsg.content[0].text.includes('tab: omnimux-inspiration:library (灵感库)'))
    assert.ok(contextMsg.content[0].text.includes('panel: open | focus: split'))
  })
})
