import React, { useLayoutEffect, useRef, useState } from 'react'
import { focusEditorElement } from '../attachments/focusEditorElement.ts'
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
export function AttachmentSubmitBridge({ sessionId, useInput, inputActions, attachmentStore, attachmentAdmission, getCurrentSessionId, t }) {
  const input = useInput(value => value)
  const live = useRef(null)
  const anchor = useRef(null)
  const [notice, setNotice] = useState(null)
  live.current = { input, inputActions }

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
      let draft = value.draft

      // 选中的技能只显示在技能按钮旁的名称标签上。发送时由会话试用通道
      // 把技能说明带进上下文，草稿正文保持用户写下的原话，不再补斜杠指令。

      // Reconcile inline link chips to their submit forms:
      // video -> `[视频](url)` (pinned by composer-video-token.test.js),
      // product -> `[商品: url]` (the existing product slot fill form).
      // Both markers are language-independent fixed names (linkChip.js `commitLabel`).
      // 读取范围收敛到**本会话**的输入框卡片：宿主可以同时挂载两张卡（分屏、多标签保活），
      // 按整文档取节点会把别的会话的链接读走。卡片解析不到时（本会话没有卡片，例如夹具环境）
      // 才退回整文档——这条兜底只覆盖「文档里就只有这一套输入框」的降级路径。
      const card = resolveComposerCard(anchor.current)
      const scope = card || root?.ownerDocument || (typeof document !== 'undefined' ? document : null)
      const readChip = (kind) => {
        const node = scope?.querySelector?.(quickLinkChipSelectorFor(kind))
        const value = node?.querySelector?.('input')
        const label = node?.getAttribute?.('data-omx-chip-label') || ''
        return { node, label, url: value?.value?.trim() || '' }
      }
      const appendBlock = (block) => {
        if (!block) return false
        draft = draft.trim() ? `${draft.trim()}\n\n${block}` : block
        try {
          actions?.setDraft?.(draft)
          return true
        } catch {
          return false
        }
      }
      // 胶囊只有在链接**真的进了草稿**之后才允许消费（写进去，或草稿里已经有同一条链接）。
      // `setDraft` 抛错时草稿没落地，这时若照样删掉节点，用户填的链接就只存在于被删的胶囊里
      // ——彻底丢失且无任何提示。宁可留着胶囊让用户重试。
      const consumeChip = (chip, url, block) => {
        if (!url) return false
        if (draft.includes(url)) {
          chip.node?.remove?.()
          return true
        }
        if (!appendBlock(block)) {
          console.warn('[AttachmentSubmitBridge] 链接未写入草稿，保留胶囊让用户重试:', url)
          return false
        }
        chip.node?.remove?.()
        return true
      }

      const video = readChip('video')
      const videoToken = typeof window !== 'undefined' ? window.__omnimuxVideoToken : null
      const url = video.url || (videoToken && typeof videoToken.url === 'string' ? videoToken.url.trim() : '')

      // 消费掉全局视频令牌。事件构造器取宿主 window 自己那份并整体兜错：
      // 这一段抛错会中断后面全部的提交流程（附件信封、预设编译），代价远大于通知本身。
      const clearVideoToken = () => {
        try {
          if (typeof window === 'undefined') return
          window.__omnimuxVideoToken = null
          const Ctor = typeof window.CustomEvent === 'function' ? window.CustomEvent : null
          if (Ctor) window.dispatchEvent(new Ctor('omnimux:video-token:cleared'))
        } catch {}
      }

      let consumedChip = false
      if (url) {
        const appended = !draft.includes(url)
        if (consumeChip(video, url, quickLinkChipMarkdown('video', url))) {
          consumedChip = true
          if (appended) clearVideoToken()
        }
      }

      const product = readChip('product')
      if (product.url && consumeChip(product, product.url, quickLinkChipMarkdown('product', product.url))) {
        consumedChip = true
      }

      if (consumedChip) notifyQuickLinkChipChange()

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

      // 附件上下文绝不写进用户草稿：它只该喂给模型，写进去就得靠事后擦 DOM 掩盖，
      // 而擦除只能清文本、清不掉承载图标的引用块，气泡里就会留下空行与孤立小图标。
      // 附件真源由宿主原生 `agent/pre-step` 注入，这里只把最新信封推给宿主。
      if (attachments.length > 0) pushViewportNow()

      // 坚决不拦截发送，坚决不弹出阻断警告，回车立即顺畅发出
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
  return <div ref={anchor} style={notice ? undefined : { display: 'none' }}>{notice && <p role="status">{t(`attachments.submit.${notice}`)}</p>}</div>
}
