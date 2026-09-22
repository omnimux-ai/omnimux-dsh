/**
 * 快捷链接卡槽的**共同构造**：快捷方式按钮区（输入框下方）与链接卡槽行
 * （输入框内侧上方，与素材导轨同一行）都只从这里取卡槽形状，不各自拼一份。
 *
 * 卡槽对象沿用既有 `PromptSlot` 契约（`attachments/promptSlotDetector.ts`），
 * 因此可以直接喂给既有组件 `attachments/PromptSlotChips.tsx` 渲染，
 * 不需要任何新的卡槽 UI。
 */

import { quickLinkLabelKey } from './catalog.js'

/**
 * 链接胶囊令牌：草稿里真正被插进输入框的那段文本。
 * 采用既有 prompt 变量槽位的方括号语法，因而会被输入框的行内高亮
 * （`usePromptSlotEnhancer` 的 `omx-prompt-slot`）渲染成胶囊，零新增机制。
 * @param {string} label 跟随语言的卡槽显示名（视频 / 商品）
 * @returns {string}
 */
export function quickLinkToken(label) {
  const text = typeof label === 'string' ? label.trim() : ''
  return text ? `[${text}]` : ''
}

/**
 * 解析各链接种类的显示名。文案缺失时退回中文原名，绝不渲染空卡槽。
 * @param {(key: string) => string} t
 * @returns {{ video: string, product: string }}
 */
export function quickLinkLabels(t) {
  const read = (kind, fallback) => {
    const key = quickLinkLabelKey(kind)
    if (typeof t !== 'function') return fallback
    const value = t(key)
    return typeof value === 'string' && value && value !== key ? value : fallback
  }
  return { video: read('video', '视频'), product: read('product', '商品') }
}

/**
 * 把链接种类数组构建成既定组件可消费的卡槽列表。
 *
 * `protocol: 'url'` 只用于复用既有卡槽的链接图标与文案分支；
 * 点击行为由调用方经 `onSelectSlot` 覆盖，不走协议自身的默认分支。
 *
 * @param {readonly string[]} links 链接种类（顺序即展示顺序）
 * @param {{ video: string, product: string }} labels
 * @returns {ReadonlyArray<object>}
 */
export function buildQuickLinkSlots(links, labels) {
  if (!Array.isArray(links) || links.length === 0) return []
  const slots = []
  for (const kind of links) {
    const label = labels && labels[kind]
    const token = quickLinkToken(label)
    if (!token) continue
    slots.push(Object.freeze({
      id: `omx-quick-link-${kind}`,
      raw: token,
      placeholder: label,
      protocol: 'url',
      start: -1,
      end: -1,
      delimiter: '[',
      quickLinkKind: kind,
    }))
  }
  return slots
}

/**
 * 卡槽是否处于「链接已在输入框内」的不可点态。
 * @param {string | null | undefined} draft
 * @param {object} slot
 * @returns {boolean}
 */
export function isQuickLinkSlotFilled(draft, slot) {
  const token = slot && typeof slot.raw === 'string' ? slot.raw : ''
  if (!token) return false
  const text = typeof draft === 'string' ? draft : ''
  return text.includes(token)
}

/**
 * 把卡槽列表拆成「已有胶囊（不可点）」与「缺胶囊（可点）」两拨 id，
 * 供卡槽组件一次拿到两态判据。
 * @param {string | null | undefined} draft
 * @param {ReadonlyArray<object>} slots
 * @returns {{ filledIds: readonly string[], openIds: readonly string[] }}
 */
export function splitQuickLinkSlots(draft, slots) {
  const filledIds = []
  const openIds = []
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slot || typeof slot.id !== 'string') continue
    if (isQuickLinkSlotFilled(draft, slot)) filledIds.push(slot.id)
    else openIds.push(slot.id)
  }
  return { filledIds, openIds }
}
