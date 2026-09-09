import { useEffect, useSyncExternalStore } from 'react'
import { createFormsBridge } from './bridge.js'
import * as prefill from './session-prefill.js'

export const SESSION_PREFILL_SLOT = 'conversation.input.dock'
export function SessionPrefillConsumer(props) {
  const intent = useSyncExternalStore(prefill.subscribeSessionPrefill, prefill.getPendingSessionPrefill, prefill.getPendingSessionPrefill)
  const state = props.useInput?.(state => state)
  useEffect(() => {
    if (!state) return
    prefill.consumeSessionPrefill(intent, { sessionId: props.sessionId, draft: state.draft,
      protected: state.imageIds?.length > 0 || state.phase !== 'plain', inputActions: props.inputActions })
  }, [intent, state, props.sessionId, props.inputActions])
  return null
}
export function mountFormsBridge(ctx, store) {
  ctx.effect(() => {
    window.__omnimuxSessionPrefill = prefill
    return () => { prefill.resetSessionPrefill(); if (window.__omnimuxSessionPrefill === prefill) delete window.__omnimuxSessionPrefill }
  }, 'omnimux: session draft seam')
  ctx.slots.inject(SESSION_PREFILL_SLOT, () => ctx.slots.register({ name: SESSION_PREFILL_SLOT, id: 'omnimux:session-prefill', order: 100 }, SessionPrefillConsumer))
  ctx.inject(['sessions', 'workspaces'], inner => {
    inner.effect(() => {
      const bridge = createFormsBridge({ sessions: inner.sessions, workspaces: inner.workspaces, store })
      window.__omnimuxForms = bridge
      window.dispatchEvent(new Event('omnimux-forms-ready'))
      return () => { if (window.__omnimuxForms === bridge) delete window.__omnimuxForms }
    }, 'omnimux: forms bridge')
  })
}
