import { randomUUID } from 'node:crypto'
import { formatCompactContextBlock } from './contract.js'
import { withReferenceNavigation } from './reference-navigation.js'

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

    const messages = [...(decision.messages || [])]

    // 1. 原生 DSH 方式注入会话附件与场景上下文 (绝不污染用户输入框)
    // 素材自带统一虚拟引用时，把推荐动作一并带上，避免 Agent 在首轮自行摸索工具。
    if (activeView.uiContext.attachedContextText) {
      messages.push(createWorkbenchContextMessage(withReferenceNavigation(activeView.uiContext.attachedContextText)))
    }

    // 2. 注入工作台面板视图快照 (面板展开时)
    const { surface } = activeView.uiContext
    if (surface?.panelOpen && surface?.tabId) {
      const text = formatCompactContextBlock(activeView.uiContext)
      if (text) {
        messages.push(createWorkbenchContextMessage(text))
      }
    }

    return {
      ...decision,
      messages,
    }
  }, { prepend: true })
}
