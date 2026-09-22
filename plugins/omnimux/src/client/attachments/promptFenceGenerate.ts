/**
 * Chat prompt cards.
 *
 * A fenced block is actionable only when its language mark is exactly
 * `prompt-image` or `prompt-video` (case-insensitive, optional trailing note).
 * The added button opens the right-hand image/video page and fills the prompt.
 * It does not submit a generation.
 */

import { queueComposerPrefill } from '../media-viewer/composer-prefill.js'
import { MEDIA_VIEWER_TAB_ID } from '../media-viewer/media-viewer-store.js'

export const PROMPT_FENCE_ATTR = 'data-omx-prompt-fence'
export const PROMPT_FENCE_STYLE_ID = 'omx-prompt-fence-styles'
const BLOCK_SELECTOR = '.md-code-block, [data-code-block-banner]'

const KIND_LABEL = {
  image: { zh: '图片提示词', en: 'Image prompt' },
  video: { zh: '视频提示词', en: 'Video prompt' },
} as const

const FOOT_LABEL = {
  image: { zh: '图片', en: 'Image' },
  video: { zh: '视频', en: 'Video' },
} as const

const BUTTON_COPY = {
  idle: { zh: '使用提示词生成', en: 'Generate with prompt' },
  done: { zh: '已填入', en: 'Filled' },
} as const

export type PromptFenceKind = keyof typeof KIND_LABEL
export type PromptFenceLang = 'zh' | 'en'

/** 跟随软件语言：英文设置或页面语言以 en 开头时用英文，其余用中文。 */
export function resolvePromptFenceLang(doc: Document = document): PromptFenceLang {
  const win = doc.defaultView as (Window & {
    __omnimuxLocale?: { active?: string, getLocale?: () => { active?: string } }
  }) | null
  const active = win?.__omnimuxLocale?.active || win?.__omnimuxLocale?.getLocale?.()?.active || ''
  if (/^en\b/i.test(active)) return 'en'
  const pageLang = doc.documentElement?.lang || ''
  if (/^en\b/i.test(pageLang)) return 'en'
  return 'zh'
}

const FENCE_CSS = `
.md-code-block[${PROMPT_FENCE_ATTR}] .omx-prompt-mark {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.md-code-block[${PROMPT_FENCE_ATTR}] .omx-prompt-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
}
.md-code-block[${PROMPT_FENCE_ATTR}] .omx-prompt-foot-kind {
  color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.72));
  font-size: 13px;
  line-height: 20px;
}
.md-code-block[${PROMPT_FENCE_ATTR}] .omx-prompt-generate {
  height: 32px;
  margin: 0;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary, #fff));
  color: var(--dsw-alias-label-primary-inverted, #111);
  font: 13px/32px inherit;
  cursor: pointer;
  flex-shrink: 0;
}
.md-code-block[${PROMPT_FENCE_ATTR}] .omx-prompt-generate:hover {
  background: var(--dsw-alias-button-primary-hover, rgba(255,255,255,0.88));
}
.md-code-block[${PROMPT_FENCE_ATTR}] .omx-prompt-generate:disabled {
  cursor: default;
  opacity: 0.55;
}
`

/** `prompt-image` / `prompt-video`, optional trailing note. The Chinese caption is ignored. */
export function parsePromptFenceKind(lang: string | null | undefined): PromptFenceKind | null {
  const head = String(lang ?? '').trim().toLowerCase().split(/[\s\u4e00-\u9fff]/)[0] ?? ''
  if (head === 'prompt-image') return 'image'
  if (head === 'prompt-video') return 'video'
  return null
}

export function readFencePrompt(block: Element): string {
  const content = block.querySelector('[data-code-block-content]')
  const source = content?.querySelector('pre') ?? block.querySelector('pre')
  return (source?.textContent ?? '').replace(/\n$/, '')
}

export function injectPromptFenceStyles(doc: Document): void {
  if (doc.getElementById(PROMPT_FENCE_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = PROMPT_FENCE_STYLE_ID
  style.textContent = FENCE_CSS
  ;(doc.head || doc.documentElement).appendChild(style)
}

function findCodeBlock(node: Element): HTMLElement | null {
  if (node.classList?.contains('md-code-block')) return node as HTMLElement
  return node.querySelector?.('.md-code-block') as HTMLElement | null
}

type OpenWorkbench = (opts: { tabId: string }) => Promise<boolean> | boolean | void

function openGenerationPage(doc: Document): Promise<boolean> {
  const win = doc.defaultView as (Window & { __omnimuxWorkbench?: { openWorkbench?: OpenWorkbench, open?: OpenWorkbench } }) | null
  const wb = win?.__omnimuxWorkbench
  const openFn = wb?.openWorkbench || wb?.open
  if (typeof openFn !== 'function') return Promise.resolve(false)
  try {
    const result = openFn.call(wb, { tabId: MEDIA_VIEWER_TAB_ID })
    if (result && typeof (result as Promise<boolean>).then === 'function') {
      return Promise.resolve(result as Promise<boolean>).then((opened) => opened === true).catch(() => false)
    }
    return Promise.resolve(result === true)
  } catch {
    return Promise.resolve(false)
  }
}

function paintPromptFence(root: HTMLElement, kind: PromptFenceKind, doc: Document): void {
  const lang = resolvePromptFenceLang(doc)
  const caption = root.querySelector('.omx-prompt-caption')
  setTextIfChanged(caption, KIND_LABEL[kind][lang])
  const footKind = root.querySelector('.omx-prompt-foot-kind')
  setTextIfChanged(footKind, FOOT_LABEL[kind][lang])
  const button = root.querySelector('.omx-prompt-generate') as HTMLButtonElement | null
  if (button && button.dataset.state !== 'done') setTextIfChanged(button, BUTTON_COPY.idle[lang])
}

function setTextIfChanged(node: Element | null, text: string): void {
  if (node && node.textContent !== text) node.textContent = text
}

/**
 * Add the footer action to one code block. Returns false when the block is not a marked prompt.
 */
export function enhancePromptFence(
  block: Element,
  doc: Document = block.ownerDocument,
  resetTimers?: Set<ReturnType<typeof setTimeout>>,
): boolean {
  const root = findCodeBlock(block) ?? (block as HTMLElement)
  if (!root || root.nodeType !== 1) return false
  const banner = root.querySelector('[data-code-block-banner]')
  if (!banner) return false
  const label = Array.from(banner.children).find((child) => !child.querySelector('button') && child.tagName !== 'BUTTON')
  const stored = root.getAttribute(PROMPT_FENCE_ATTR)
  const kind = (stored === 'image' || stored === 'video') ? stored : parsePromptFenceKind(label?.textContent)
  if (!kind) return false
  root.setAttribute(PROMPT_FENCE_ATTR, kind)
  // 中文只放在独立节点。原始语言标记留着，宿主重绘后仍能认出。
  let caption = banner.querySelector('.omx-prompt-caption')
  if (!caption && label) {
    const mark = doc.createElement('span')
    mark.className = 'omx-prompt-mark'
    while (label.firstChild) mark.appendChild(label.firstChild)
    caption = doc.createElement('span')
    caption.className = 'omx-prompt-caption'
    label.append(mark, caption)
  }

  let foot = root.querySelector(':scope > .omx-prompt-foot') as HTMLElement | null
  let button = foot?.querySelector('.omx-prompt-generate') as HTMLButtonElement | null
  if (!foot) {
    foot = doc.createElement('div')
    foot.className = 'omx-prompt-foot'
    const kindLabel = doc.createElement('span')
    kindLabel.className = 'omx-prompt-foot-kind'
    button = doc.createElement('button')
    button.type = 'button'
    button.className = 'omx-prompt-generate'
    foot.append(kindLabel, button)
    root.appendChild(foot)
  }
  if (!button) return false
  button.dataset.kind = kind
  paintPromptFence(root, kind, doc)
  button.onclick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const prompt = readFencePrompt(root)
    if (!prompt.trim()) return
    void openGenerationPage(doc).then((opened) => {
      if (opened) queueComposerPrefill({ prompt, kind })
      if (!button.isConnected) return
      const current = resolvePromptFenceLang(doc)
      button.dataset.state = opened ? 'done' : ''
      button.textContent = opened ? BUTTON_COPY.done[current] : BUTTON_COPY.idle[current]
      if (!opened) return
      const reset = doc.defaultView?.setTimeout(() => {
        if (reset) resetTimers?.delete(reset)
        if (!button.isConnected) return
        button.dataset.state = ''
        button.textContent = BUTTON_COPY.idle[resolvePromptFenceLang(doc)]
      }, 1200)
      if (reset) resetTimers?.add(reset)
    })
  }
  return true
}

export function scanPromptFences(root: ParentNode = document, resetTimers?: Set<ReturnType<typeof setTimeout>>): number {
  if (!root || typeof (root as ParentNode).querySelectorAll !== 'function') return 0
  const seen = new Set<Element>()
  let count = 0
  root.querySelectorAll(BLOCK_SELECTOR).forEach((node) => {
    const block = findCodeBlock(node as Element)
    if (!block || seen.has(block)) return
    seen.add(block)
    const doc = block.ownerDocument
    if (doc && enhancePromptFence(block, doc, resetTimers)) count += 1
  })
  return count
}

export function installPromptFenceGenerate(targetDoc: Document = document): () => void {
  if (!targetDoc || typeof targetDoc.createElement !== 'function') return () => {}
  injectPromptFenceStyles(targetDoc)

  const resetTimers = new Set<ReturnType<typeof setTimeout>>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const scroll = targetDoc.querySelector('[data-conversation-scroll]')
      scanPromptFences(scroll || targetDoc, resetTimers)
    }, 60)
  }

  const Observer = targetDoc.defaultView?.MutationObserver
  const scroll = targetDoc.querySelector('[data-conversation-scroll]')
  const watch = scroll || targetDoc.body || targetDoc.documentElement
  const observer = Observer ? new Observer(() => schedule()) : null
  observer?.observe(watch, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  const langObserver = Observer ? new Observer(() => schedule()) : null
  if (targetDoc.documentElement && targetDoc.documentElement !== watch) {
    langObserver?.observe(targetDoc.documentElement, { attributes: true, attributeFilter: ['lang'] })
  }
  const onLocale = () => schedule()
  targetDoc.defaultView?.addEventListener('omnimux:locale-change', onLocale)
  targetDoc.defaultView?.addEventListener('languagechange', onLocale)
  schedule()

  return () => {
    if (timer) clearTimeout(timer)
    for (const reset of resetTimers) clearTimeout(reset)
    resetTimers.clear()
    observer?.disconnect()
    langObserver?.disconnect()
    targetDoc.defaultView?.removeEventListener('omnimux:locale-change', onLocale)
    targetDoc.defaultView?.removeEventListener('languagechange', onLocale)
  }
}
