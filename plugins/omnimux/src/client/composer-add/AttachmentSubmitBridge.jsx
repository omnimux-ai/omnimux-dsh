import React, { useLayoutEffect, useRef, useState } from 'react'
import { buildAttachedContextBlock } from '../attachments/prompt-assembly.ts'
import { getCreativePresetsStore } from '../presets/presets-store.js'
import { getComposerModeStore } from '../composer-mode/composer-mode-store.js'
import { compileCreativePrompt } from '../presets/compiler.js'

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

  // 跨组件输入框草稿同步桥接 (供 ComposerModeTabs 模式切换时清空/恢复输入框)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    window.__omnimuxComposerActions = {
      setDraft: (text) => {
        try {
          live.current?.inputActions?.setDraft?.(text)
        } catch (err) {
          console.warn('[AttachmentSubmitBridge] setDraft failed:', err)
        }
      },
      getDraft: () => live.current?.input?.draft || '',
    }
    const handleSetDraftEvent = (e) => {
      const { sessionId: targetSessionId, draft } = e.detail || {}
      if (!targetSessionId || targetSessionId === sessionId) {
        try {
          live.current?.inputActions?.setDraft?.(draft || '')
        } catch {}
      }
    }
    window.addEventListener('omnimux:composer:set-draft', handleSetDraftEvent)
    return () => {
      window.removeEventListener('omnimux:composer:set-draft', handleSetDraftEvent)
      if (window.__omnimuxComposerActions?.setDraft) {
        window.__omnimuxComposerActions = null
      }
    }
  }, [sessionId])
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
      let draft = value.draft

      // Reconcile active skill gesture without polluting input UI
      const activeSkill = typeof window !== 'undefined' ? window.__omnimuxActiveSkill : null
      if (activeSkill) {
        const slug = activeSkill.slug || activeSkill.skill || (activeSkill.id ? String(activeSkill.id).replace(/^sk-tk-/, '') : '')
        if (slug) {
          const gesture = `/${slug}`
          if (!draft.includes(gesture)) {
            draft = draft.trim() ? `${gesture} ${draft.trim()}` : `${gesture} `
            try {
              actions?.setDraft?.(draft)
            } catch {}
          }
        }
      }

      // Reconcile video link token to [视频](url) markdown syntax
      const doc = root?.ownerDocument || (typeof document !== 'undefined' ? document : null)
      const tokenNode = doc?.querySelector?.('[data-omx-video-token="true"]')
      const tokenInput = tokenNode?.querySelector?.('input')
      const liveUrl = tokenInput?.value?.trim() || ''
      const videoToken = typeof window !== 'undefined' ? window.__omnimuxVideoToken : null
      const url = liveUrl || (videoToken && typeof videoToken.url === 'string' ? videoToken.url.trim() : '')

      if (url) {
        if (!draft.includes(url)) {
          const videoBlock = `[视频](${url})`
          draft = draft.trim() ? `${draft.trim()}\n\n${videoBlock}` : videoBlock
          try {
            actions?.setDraft?.(draft)
            if (typeof window !== 'undefined') {
              window.__omnimuxVideoToken = null
              window.dispatchEvent(new CustomEvent('omnimux:video-token:cleared'))
            }
          } catch {}
        }
        tokenNode?.remove?.()
      }

      // Reconcile creative presets (Format, Hook, Style) into structured system context (only in marketing mode)
      try {
        const modeStore = getComposerModeStore()
        const currentMode = modeStore.getMode(sessionId)
        if (currentMode === 'marketing') {
          const presetsStore = getCreativePresetsStore()
          const currentPresets = presetsStore.getSnapshot(sessionId)
          if (currentPresets && (currentPresets.format || currentPresets.hook || currentPresets.style)) {
            draft = compileCreativePrompt({
              format: currentPresets.format,
              hook: currentPresets.hook,
              style: currentPresets.style,
              userQuery: draft,
              language: 'zh-CN',
            })
            try {
              actions?.setDraft?.(draft)
              // 提交后清空当前预设，避免后续会话状态污染
              presetsStore.clearPresets(sessionId)
            } catch {}
          }
        }
      } catch (err) {
        console.error('[CreativePresets] Failed to compile prompt:', err)
      }

      if (!draft.trim() && !attachments.length) return true
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
