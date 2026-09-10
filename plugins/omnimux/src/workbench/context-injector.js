import { randomUUID } from 'node:crypto'
import { formatCompactContextBlock } from './contract.js'

/**
 * Creates a native DSH context UserMessage.
 * Rendered by DSH Chat UI as: Context injection · omnimux-workbench (collapsible).
 *
 * @param {string} text
 */
export function createWorkbenchContextMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: 'omnimux-workbench',
      form: 'snapshot',
      sections: [{
        name: 'workbench-viewport',
        text,
      }],
    },
  }
}

/**
 * Mounts native DSH runtime context injection for OmniMux workbench viewport.
 * Listens on 'agent/pre-step'. On turn start (step 1), if the current session has an active,
 * open workbench panel with a valid tab, injects a standard DSH context UserMessage.
 *
 * @param {object} ctx Cordis context
 * @param {{ mailbox: { getActiveView: (sessionId?: string) => { ok: boolean, uiContext?: object } } }} deps
 */
export function mountWorkbenchContextInjector(ctx, deps) {
  if (!ctx || typeof ctx.on !== 'function') return () => {}
  const mailbox = deps?.mailbox
  if (!mailbox || typeof mailbox.getActiveView !== 'function') return () => {}

  return ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const decision = await next()
    if (!decision || decision.kind === 'reject' || signal?.aborted) return decision

    // Only inject at the first step of each turn
    if (step !== 1) return decision

    const sessionId = agent?.session?.id
    const activeView = mailbox.getActiveView(sessionId)
    if (!activeView?.ok || !activeView.uiContext) return decision

    const { surface } = activeView.uiContext
    // Only inject when panel is actually open and has an active tab
    if (!surface?.panelOpen || !surface?.tabId) return decision

    const text = formatCompactContextBlock(activeView.uiContext)
    if (!text) return decision

    const contextMessage = createWorkbenchContextMessage(text)

    return {
      ...decision,
      messages: [...(decision.messages || []), contextMessage],
    }
  }, { prepend: true })
}
