import React, { useLayoutEffect, useRef, useState } from 'react'
import { buildAttachedContextBlock } from '../attachments/prompt-assembly.ts'

/** Reconcile only the exact block this session wrote; preserve manual edits. */
export function reconcileAttachmentDraft(draft, previous, attachments) {
  const block = buildAttachedContextBlock(attachments)
  if (previous) {
    const index = draft.indexOf(previous)
    const end = index + previous.length
    if (index < 0 || index !== draft.lastIndexOf(previous)
      || (end !== draft.length && draft.slice(end, end + 2) !== '\n\n')) {
      return { status: 'edited', draft, block: previous }
    }
  }
  if (!previous && draft.includes('### 会话关联上下文')) return { status: 'edited', draft, block: previous }
  const next = previous ? draft.replace(previous, block) : draft + block
  return { status: next === draft ? 'ready' : 'synced', draft: next, block }
}

/** Session-scoped owner actions keep attachment text in the official input snapshot. */
export function AttachmentSubmitBridge({ sessionId, useInput, inputActions, attachmentStore, attachmentDrafts, attachmentAdmission, getCurrentSessionId, t }) {
  const input = useInput(value => value)
  const live = useRef(null)
  const anchor = useRef(null)
  const [notice, setNotice] = useState(null)
  live.current = { input, inputActions }
  useLayoutEffect(() => {
    const root = anchor.current?.closest('[data-phase]')
    if (!root) return
    const doc = root.ownerDocument
    let blockedPointer = false
    const send = target => target?.closest?.('button[aria-label="Send message"],button[aria-label="发送消息"],[data-send-button]')
    const belongs = target => root.contains(target) && getCurrentSessionId() === sessionId
    const stop = event => { event.preventDefault(); event.stopImmediatePropagation() }
    const check = () => {
      const { input: value, inputActions: actions } = live.current
      const attachments = attachmentStore.getSnapshot(sessionId)
      const previous = attachmentDrafts.get(sessionId) || ''
      if (!value.draft.trim() && !attachments.length) return true
      const draft = value.draft
      const result = reconcileAttachmentDraft(draft, previous, attachments)
      const attachmentsChanged = result.status === 'synced'
      if (result.status === 'ready' && result.draft !== value.draft) result.status = 'synced'
      if (result.status === 'edited') {
        // Removing all attachments explicitly leaves a manually edited draft alone.
        if (!attachments.length) { attachmentDrafts.delete(sessionId); setNotice(null); return true }
        setNotice('edited'); return false
      }
      if (result.status === 'ready') { setNotice(null); return true }
      if (value.phase !== 'plain' || value.occurrences?.length || !actions?.setDraft) { setNotice('unavailable'); return false }
      try {
        actions.setDraft(result.draft)
        live.current = { ...live.current, input: { ...value, draft: result.draft } }
        attachmentDrafts.set(sessionId, result.block)
        setNotice(attachmentsChanged ? 'synced' : null)
        if (!attachmentsChanged) return true
      } catch { setNotice('unavailable') }
      return false
    }
    const arm = () => attachmentAdmission.arm(sessionId, live.current.input.draft,
      attachmentStore.getSnapshot(sessionId), attachmentDrafts.get(sessionId))
    const pointer = event => {
      if (!belongs(event.target) || !send(event.target)) return
      blockedPointer = !check()
      if (blockedPointer) stop(event)
    }
    const click = event => {
      if (!belongs(event.target) || !send(event.target)) return
      const blocked = blockedPointer; blockedPointer = false
      if (blocked || !check()) stop(event)
      else arm()
    }
    const key = event => {
      if (!belongs(event.target) || event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
      if (!event.target.closest?.('[data-composer-input="true"]') && !send(event.target)) return
      if (doc.querySelector('[data-trigger-menu] [aria-activedescendant]')?.getAttribute('aria-activedescendant')) return
      if (!check()) stop(event)
      else arm()
    }
    // The guide's window capture validates URL edits before this document capture.
    doc.addEventListener('pointerdown', pointer, true)
    doc.addEventListener('click', click, true)
    doc.addEventListener('keydown', key, true)
    return () => {
      doc.removeEventListener('pointerdown', pointer, true)
      doc.removeEventListener('click', click, true)
      doc.removeEventListener('keydown', key, true)
    }
  }, [sessionId, attachmentStore, attachmentDrafts, attachmentAdmission, getCurrentSessionId])
  return <div ref={anchor} style={notice ? undefined : { display: 'none' }}>{notice && <p role="status">{t(`attachments.submit.${notice}`)}</p>}</div>
}
