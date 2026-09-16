import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mountWorkbenchTools, WORKBENCH_VIEWPORT_PROMPT_SECTION, MAX_TAB_SWITCHES_PER_SESSION } from './tools.js'
import { createHubEventBus } from '../events/hub-event-bus.js'
import { createWorkbenchMailbox } from './mailbox.js'
import { JSON_TOOL_OUTPUT } from '../tools/schema.js'
import { createTestToolContext } from '../test-support/tool-context.js'

function captureTools() {
  return createTestToolContext()
}

describe('Workbench Tools', () => {
  it('registers tools with dsh-tools output contract and executes get_active_view', async () => {
    const { tools, ctx } = captureTools()
    const promptSections = []
    ctx.systemPrompt = {
      section(spec) {
        promptSections.push(spec)
        return () => {}
      },
    }

    const bus = createHubEventBus()
    const mailbox = createWorkbenchMailbox({ hubEvents: bus })
    mailbox.updateViewport({
      schemaVersion: 1,
      ok: true,
      capturedAt: Date.now(),
      surface: { tabId: 'omnimux-assets:library', panelOpen: true },
      view: { kind: 'canvas', extra: { workspaceId: 'ws_abc' } },
    })

    mountWorkbenchTools(ctx, {
      mailbox,
      jsonOut: JSON_TOOL_OUTPUT,
    })

    assert.ok(tools.has('workbench_get_active_view'))
    assert.ok(tools.has('workbench_open_tab'))
    assert.equal(typeof tools.get('workbench_get_active_view').output.render, 'function')
    assert.equal(typeof tools.get('workbench_open_tab').output.render, 'function')

    const viewportSection = promptSections.find((s) => s.name === WORKBENCH_VIEWPORT_PROMPT_SECTION.name)
    assert.ok(viewportSection, 'workbench:viewport prompt registered')
    assert.equal(viewportSection.order, WORKBENCH_VIEWPORT_PROMPT_SECTION.order)
    assert.match(viewportSection.text, /ui_context/)
    assert.match(viewportSection.text, /workspace/)

    const getTool = tools.get('workbench_get_active_view')
    const viewRes = await getTool.execute({})
    assert.equal(viewRes.ok, true)
    assert.equal(viewRes.stale, false)
    assert.equal(viewRes.uiContext.surface.tabId, 'omnimux-assets:library')
    assert.equal(viewRes.uiContext.view.extra.workspaceId, 'ws_abc')
  })

  it('defaults to JSON_TOOL_OUTPUT when jsonOut is omitted', () => {
    const { tools, ctx } = captureTools()
    const bus = createHubEventBus()
    const mailbox = createWorkbenchMailbox({ hubEvents: bus })
    mountWorkbenchTools(ctx, { mailbox })
    assert.equal(tools.get('workbench_get_active_view').output, JSON_TOOL_OUTPUT)
  })

  it('workbench_open_tab respects panel-collapsed anti-annoyance guard', async () => {
    const { tools, ctx } = captureTools()
    const bus = createHubEventBus()
    const mailbox = createWorkbenchMailbox({ hubEvents: bus })

    mailbox.updateViewport({
      schemaVersion: 1,
      ok: true,
      capturedAt: Date.now(),
      surface: { tabId: 'omnimux-assets:library', panelOpen: false },
    })

    mountWorkbenchTools(ctx, { mailbox, jsonOut: JSON_TOOL_OUTPUT })
    const openTool = tools.get('workbench_open_tab')

    const res = await openTool.execute({
      tabId: 'omnimux-workflow:canvas',
      reason: '需要切换至创作画布查看效果',
    })

    assert.equal(res.ok, true)
    assert.equal(res.applied, false)
    assert.equal(res.code, 'panel-collapsed')
  })

  it('workbench_open_tab returns already-active when opening same active tab', async () => {
    const { tools, ctx } = captureTools()
    const bus = createHubEventBus()
    const mailbox = createWorkbenchMailbox({ hubEvents: bus })

    mailbox.updateViewport({
      schemaVersion: 1,
      ok: true,
      capturedAt: Date.now(),
      surface: { tabId: 'omnimux-assets:library', panelOpen: true },
    })

    mountWorkbenchTools(ctx, { mailbox, jsonOut: JSON_TOOL_OUTPUT })
    const openTool = tools.get('workbench_open_tab')

    const res = await openTool.execute({
      tabId: 'omnimux-assets:library',
      reason: '再次聚焦资产库',
    })

    assert.equal(res.ok, true)
    assert.equal(res.applied, true)
    assert.equal(res.code, 'already-active')
  })

  it('用完本会话切换配额后返回可读中文说明，且不谎称可重试（#2104）', async () => {
    const { tools, ctx } = captureTools()
    const bus = createHubEventBus()
    const mailbox = createWorkbenchMailbox({ hubEvents: bus })

    mailbox.updateViewport({
      schemaVersion: 1,
      ok: true,
      capturedAt: Date.now(),
      sessionId: 'session-quota',
      surface: { tabId: 'omnimux-assets:library', panelOpen: true },
    })
    let opened = 0
    mailbox.sendRpc = async (payload) => {
      opened += 1
      return { ok: true, applied: true, code: 'opened', requestId: payload.requestId }
    }

    mountWorkbenchTools(ctx, { mailbox, jsonOut: JSON_TOOL_OUTPUT })
    const openTool = tools.get('workbench_open_tab')

    for (let i = 0; i < MAX_TAB_SWITCHES_PER_SESSION; i += 1) {
      const allowed = await openTool.execute({ tabId: 'omnimux-workflow:canvas', reason: `第 ${i + 1} 次切换` })
      assert.equal(allowed.applied, true, '配额内应正常切换')
    }

    const blocked = await openTool.execute({ tabId: 'omnimux-workflow:canvas', reason: '再切一次' })
    assert.equal(blocked.ok, true)
    assert.equal(blocked.applied, false)
    assert.equal(blocked.code, 'quota-exceeded')
    assert.equal(blocked.retryable, false, '同会话内重试必然失败，不得暗示可重试')
    assert.match(blocked.message, /创作画布/, '面向用户说的是页签名，不是内部 tabId')
    assert.match(blocked.message, /手动打开/, '必须给出可执行动作')
    assert.equal(opened, MAX_TAB_SWITCHES_PER_SESSION, '超额后不得再发 RPC')
  })
})
