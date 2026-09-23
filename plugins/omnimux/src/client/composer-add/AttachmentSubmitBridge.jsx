import React, { useLayoutEffect, useRef, useState } from 'react'
import { focusEditorElement } from '../attachments/focusEditorElement.ts'
import { detectOffset } from '../attachments/linkReference.ts'
import { getCreativePresetsStore } from '../presets/presets-store.js'
import { getComposerModeStore } from '../composer-mode/composer-mode-store.js'
import { compileCreativePrompt } from '../presets/compiler.js'
import { getGlobalShadowContextStore } from '../reference/shadow-context.ts'
import { submittedAttachmentStore } from '../attachments/submittedAttachmentStore.ts'
import {
  isQuickLinkChipTarget,
  quickLinkChipMarkdown,
  quickLinkChipSelectorFor,
} from '../composer-quick-shortcuts/linkChip.js'
import { notifyQuickLinkChipChange, resolveComposerCard } from '../composer-quick-shortcuts/dom.js'

/**
 * 立即把本会话的 viewport 信封推给宿主，不等 2s 心跳。
 *
 * 附件真源只经宿主原生 `agent/pre-step` 注入抵达模型（`getUiContext().attachedContextText`），
 * 而信封按会话缓存：新建会话后在心跳到达前就发送时，宿主可能还没有该会话的信封。
 * 发送这一刻补推一次，把「附件路径到不了模型」的窗口关掉。
 */
function pushViewportNow() {
  try {
    if (typeof window === 'undefined') return
    window.__omnimuxHubEvents?.pushViewport?.()
  } catch {}
}

/** Session-scoped owner actions keep attachment text in the official input snapshot. */
export function AttachmentSubmitBridge({ sessionId, useInput, inputActions, insertText, attachmentStore, attachmentAdmission, getCurrentSessionId, t = key => key }) {
  const input = useInput(value => value)
  const live = useRef(null)
  const anchor = useRef(null)
  const pending = useRef(null)
  const [notice, setNotice] = useState(null)
  live.current = { input, inputActions, insertText }

  useLayoutEffect(() => () => {
    clearTimeout(pending.current?.timer)
    pending.current = null
    setNotice(null)
  }, [sessionId])

  // Consumption requires a published public snapshot, not a mutation receipt alone.
  useLayoutEffect(() => {
    const operation = pending.current
    if (!operation) return
    if (operation.sessionId !== sessionId) {
      pending.current = null
      setNotice(null)
      return
    }
    if (!operation.accepted || operation.unconfirmed) return
    const revisioned = Number.isSafeInteger(operation.revision)
    if (revisioned ? input.draftRev === operation.revision : input.draft === operation.before) return
    clearTimeout(operation.timer)
    pending.current = null
    if ((!revisioned || input.draftRev > operation.revision) && input.draft === operation.draft
      && JSON.stringify(input.occurrences || []) === operation.occurrences) {
      operation.consume()
      setNotice('ready')
    } else {
      setNotice('changed')
    }
  })

  // 跨组件输入框草稿同步桥接 (供 ComposerModeTabs 模式切换时清空/恢复输入框)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    window.__omnimuxComposerActions = {
      // 回执契约：只有真的把草稿交给了官方输入框才回 true。
      // `inputActions.setDraft` 缺失、或调用抛错时回 false——消费方（输入框下方的
      // 四条快捷方式）据此整条不生效，不会出现「输入框没变、卡槽与技能已变」的错位。
      setDraft: (text) => {
        try {
          const actions = live.current?.inputActions
          if (live.current?.input?.occurrences?.length) return false
          if (!actions || typeof actions.setDraft !== 'function') {
            console.warn('[AttachmentSubmitBridge] setDraft unavailable: input actions not mounted')
            return false
          }
          actions.setDraft(text)
          return true
        } catch (err) {
          console.warn('[AttachmentSubmitBridge] setDraft failed:', err)
          return false
        }
      },
      getDraft: () => live.current?.input?.draft || '',
      // 把用户视线带到附件区：附件导轨监听后滚动到可见、高亮最新卡片，这里补上输入框焦点。
      // 事件名与 AttachmentTray 的 REVEAL_ATTACHMENTS_EVENT 一致；按既有跨插件惯例写字面量，避免引入组件模块。
      revealAttachments: () => {
        try {
          window.dispatchEvent(new CustomEvent('omnimux:attachments:reveal', { detail: { sessionId } }))
        } catch (err) {
          console.warn('[AttachmentSubmitBridge] revealAttachments failed:', err)
        }
        focusEditorElement()
      },
    }
    const handleSetDraftEvent = (e) => {
      const { sessionId: targetSessionId, draft } = e.detail || {}
      if ((!targetSessionId || targetSessionId === sessionId) && !live.current?.input?.occurrences?.length) {
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
      let draft = value.draft

      // 选中的技能只显示在技能按钮旁的名称标签上。发送时由会话试用通道
      // 把技能说明带进上下文，草稿正文保持用户写下的原话，不再补斜杠指令。

      if (pending.current) {
        const operation = pending.current
        const canRecheck = operation.unconfirmed && operation.revisionBound
          && Number.isSafeInteger(value.draftRev) && value.draftRev > operation.revision
          && value.phase === 'plain'
        if (!canRecheck) {
          setNotice(operation.unconfirmed
            ? (operation.revisionBound ? 'unconfirmed' : 'legacyUnconfirmed') : 'waiting')
          return false
        }
        // A newer revision invalidates the old CAS. Reconcile only on this explicit send.
        pending.current = null
      }
      // Only legacy chips inside this session card are reconciled. Native references
      // already belong to the host draft; global tokens cannot prove session ownership.
      const scope = resolveComposerCard(anchor.current)
      const chips = ['video', 'product'].map(kind => {
        const node = scope?.querySelector?.(quickLinkChipSelectorFor(kind))
        return { kind, node, url: node?.querySelector?.('input')?.value?.trim() || '' }
      }).filter(chip => chip.url)
      const appendBlock = block => {
        if (block) draft += `${draft ? '\n\n' : ''}${block}`
      }
      for (const chip of chips) {
        if (!draft.includes(chip.url)) appendBlock(quickLinkChipMarkdown(chip.kind, chip.url))
      }
      let presetsStore
      let currentPresets
      try {
        const currentMode = getComposerModeStore().getMode(sessionId)
        if (currentMode === 'marketing') {
          presetsStore = getCreativePresetsStore()
          currentPresets = presetsStore.getSnapshot(sessionId)
          if (currentPresets && (currentPresets.format || currentPresets.hook || currentPresets.style)) {
            // Append directives without serializing the user's native references again.
            const directives = compileCreativePrompt({ ...currentPresets, userQuery: '', language: 'zh-CN' })
            if (!draft.includes(directives)) appendBlock(directives)
          } else currentPresets = null
        }
      } catch (err) {
        console.error('[CreativePresets] Failed to compile prompt:', err)
        setNotice('unavailable')
        return false
      }
      const consume = () => {
        let changed = false
        for (const chip of chips) {
          // Do not remove a chip edited while the public mutation was pending.
          if (scope?.contains(chip.node) && chip.node.querySelector('input')?.value?.trim() === chip.url) {
            chip.node.remove()
            changed = true
          }
        }
        if (changed) notifyQuickLinkChipChange()
        if (currentPresets && presetsStore.getSnapshot(sessionId) === currentPresets) presetsStore.clearPresets(sessionId)
      }
      if (draft !== value.draft) {
        const operation = {
          sessionId, draft, before: value.draft, revision: value.draftRev,
          occurrences: JSON.stringify(value.occurrences || []), accepted: false, consume,
          revisionBound: typeof live.current.insertText === 'function' && Number.isSafeInteger(value.draftRev),
        }
        pending.current = operation
        try {
          if (typeof live.current.insertText === 'function') {
            const end = value.phase === 'plain'
              ? detectOffset({ ...value, occurrences: value.occurrences || [] }, value.draft.length)
              : null
            operation.accepted = end !== null && live.current.insertText(draft.slice(value.draft.length), {
              start: end, end, draftRev: value.draftRev,
            }) === true
          } else if (!value.occurrences?.length && typeof actions?.setDraft === 'function') {
            // Older hosts can still submit plain live drafts, never flattened references.
            operation.accepted = actions.setDraft(draft) !== false
          }
        } catch {}
        if (!operation.accepted) {
          pending.current = null
          setNotice('unavailable')
        } else {
          operation.timer = setTimeout(() => {
            if (pending.current !== operation) return
            operation.unconfirmed = true
            operation.consume = null
            setNotice(operation.revisionBound ? 'unconfirmed' : 'legacyUnconfirmed')
          }, 2000)
          setNotice('waiting')
        }
        return false
      }
      consume()

      if (!draft.trim() && !attachments.length) return true

      // 附件上下文绝不写进用户草稿：它只该喂给模型，写进去就得靠事后擦 DOM 掩盖，
      // 而擦除只能清文本、清不掉承载图标的引用块，气泡里就会留下空行与孤立小图标。
      // 附件真源由宿主原生 `agent/pre-step` 注入，这里只把最新信封推给宿主。
      if (attachments.length > 0) pushViewportNow()

      // Native-only drafts need no reconciliation and pass through unchanged.
      setNotice(null)
      return true
    }
    const arm = () => {
      try {
        const attList = attachmentStore.getSnapshot(sessionId)
        if (attList && attList.length > 0) {
          submittedAttachmentStore.record(sessionId, live.current?.input?.draft || '', attList)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('omnimux:user-message-submitted', {
              detail: { sessionId, draft: live.current?.input?.draft || '' },
            }))
          }
        }
        getGlobalShadowContextStore().consume(sessionId)
      } catch {}
      attachmentAdmission.arm(sessionId, live.current.input.draft,
        attachmentStore.getSnapshot(sessionId))
    }
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
      // 链接胶囊输入框里的回车归胶囊（确认粘贴的链接），既不进草稿也不触发发送。
      if (isQuickLinkChipTarget(event.target)) return
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
  }, [sessionId, attachmentStore, attachmentAdmission, getCurrentSessionId])
  return <div ref={anchor} style={notice ? undefined : { display: 'none' }}>{notice && <p role="status">{t(`attachments.submit.prepare.${notice}`)}</p>}</div>
}
