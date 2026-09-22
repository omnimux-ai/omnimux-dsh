/**
 * 快捷链接卡槽的**共同构造**：快捷方式按钮区（输入框下方）与链接卡槽行
 * （输入框内侧上方，与素材导轨同一行）都只从这里取卡槽形状，不各自拼一份。
 *
 * 卡槽对象沿用既有 `PromptSlot` 契约（`attachments/promptSlotDetector.ts`），
 * 因此可以直接喂给既有组件 `attachments/PromptSlotChips.tsx` 渲染，
 * 不需要任何新的卡槽 UI。
 *
 * **令牌判据与界面语言解耦**：令牌文本是跟随语言的显示名（`[视频]` / `[Video]`），
 * 但判据一律走「链接种类（kind）」这个稳定标识——本模块把全部支持语言的显示名
 * 收成一张登记表，任何语言的令牌都能反查回同一个 kind。否则用户切换界面语言后，
 * 输入框里那条旧语言的令牌既判不出「已填」，也剥不掉，卡槽会重新变可点并插进
 * 第二种语言的重复令牌。
 *
 * **链接已改成真正的胶囊节点**（`linkChip.js` 定义形态、`dom.js` 负责插入与读取），
 * 因此「已填」的主判据从「草稿文本里有令牌」换成「输入框里有该种类的胶囊节点」：
 * 胶囊不进草稿文本，槽位投影看不见它，卡槽两态只能靠节点种类判。文本令牌判据保留
 * 下来兼容用户手打的 `[视频]`（提示词槽位高亮仍认它），两条输入合成同一份判据。
 */

import { QUICK_LINK_KINDS, quickLinkLabelKey, quickShortcutLinks } from './catalog.js'
import { en, zh } from '../locales.js'

/**
 * 链接卡槽的**令牌文本**（`[视频]` / `[商品]`）。
 *
 * 链接本身早已由胶囊节点承载（`dom.js`），令牌此刻只剩两个用途：喂给
 * `PromptSlotChips` 的 `raw` 契约字段，以及兼容用户手打的同名令牌
 * （提示词槽位高亮仍按它解析，卡槽据此判「已填」）。
 * @param {string} label 跟随语言的卡槽显示名（视频 / 商品）
 * @returns {string}
 */
export function quickLinkToken(label) {
  const text = typeof label === 'string' ? label.trim() : ''
  return text ? `[${text}]` : ''
}

/** 链接种类 → 全部支持语言的显示名（kind 才是稳定标识，显示名只是它在某语言下的写法）。 */
function buildLabelRegistry() {
  const registry = new Map()
  for (const kind of QUICK_LINK_KINDS) {
    const key = quickLinkLabelKey(kind)
    const labels = []
    for (const dictionary of [zh, en]) {
      const raw = dictionary ? dictionary[key] : ''
      const label = typeof raw === 'string' ? raw.trim() : ''
      if (label && !labels.includes(label)) labels.push(label)
    }
    registry.set(kind, Object.freeze(labels))
  }
  return registry
}

/** 令牌文本 → 链接种类：跨语言反查，使判据不依赖「当前是哪种语言」。 */
function buildTokenIndex() {
  const index = new Map()
  for (const kind of QUICK_LINK_KINDS) {
    for (const label of LINK_LABELS_BY_KIND.get(kind) || []) {
      const token = quickLinkToken(label)
      if (token) index.set(token, kind)
    }
  }
  return index
}

const LINK_LABELS_BY_KIND = buildLabelRegistry()
const KIND_BY_TOKEN = buildTokenIndex()

/**
 * 某个链接种类在全部支持语言下的令牌（`[视频]` / `[Video]`）。
 * @param {string} kind
 * @returns {readonly string[]}
 */
export function quickLinkTokensForKind(kind) {
  const labels = LINK_LABELS_BY_KIND.get(kind)
  if (!labels) return []
  return labels.map(quickLinkToken).filter(Boolean)
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
 * 取卡槽对应的链接种类，优先用卡槽自带的稳定标识（`quickLinkKind`），
 * 退回用令牌文本跨语言反查。两处都不认才返回空串（判据不上抛、不猜）。
 * @param {object | null | undefined} slot
 * @returns {string}
 */
function resolveSlotKind(slot) {
  if (!slot || typeof slot !== 'object') return ''
  const declared = slot.quickLinkKind
  if (typeof declared === 'string' && LINK_LABELS_BY_KIND.has(declared)) return declared
  const raw = typeof slot.raw === 'string' ? slot.raw.trim() : ''
  return raw ? (KIND_BY_TOKEN.get(raw) || '') : ''
}

/**
 * 草稿文本里出现的链接种类（跨语言反查令牌，`[视频]` 与 `[Video]` 都认）。
 *
 * 胶囊节点的种类读口在 `dom.js` 的 `readQuickLinkChipKinds`；这里只负责文本令牌，
 * 两条输入由 `mergeQuickLinkKinds` 合成同一份「已填」判据。
 * @param {string | null | undefined} draft
 * @returns {readonly string[]}
 */
export function quickLinkKindsInDraft(draft) {
  const text = typeof draft === 'string' ? draft : ''
  if (!text) return []
  const kinds = []
  for (const kind of QUICK_LINK_KINDS) {
    if (quickLinkTokensForKind(kind).some((token) => text.includes(token))) kinds.push(kind)
  }
  return kinds
}

/**
 * 合成「输入框里已有哪些链接种类」：胶囊节点种类 + 草稿里的手打令牌种类。
 * 按真源顺序去重，判据因此仍然只有一份。
 * @param {readonly string[] | null | undefined} chipKinds 胶囊节点上的种类
 * @param {string | null | undefined} draft 草稿文本
 * @returns {readonly string[]}
 */
export function mergeQuickLinkKinds(chipKinds, draft) {
  const present = Array.isArray(chipKinds) ? chipKinds : []
  const textKinds = quickLinkKindsInDraft(draft)
  const kinds = []
  for (const kind of QUICK_LINK_KINDS) {
    if (present.includes(kind) || textKinds.includes(kind)) kinds.push(kind)
  }
  return kinds
}

/**
 * 卡槽是否处于「链接已在输入框内」的不可点态。
 * 按链接种类判定：`[视频]` 与 `[Video]` 是同一个卡槽的两种语言写法，
 * 切换界面语言后旧令牌仍然算「已填」。
 * @param {readonly string[] | null | undefined} presentKinds 输入框里已有的链接种类
 * @param {object} slot
 * @returns {boolean}
 */
export function isQuickLinkSlotFilled(presentKinds, slot) {
  const kind = resolveSlotKind(slot)
  if (!kind) return false
  return Array.isArray(presentKinds) && presentKinds.includes(kind)
}

/**
 * 把卡槽列表拆成「已有胶囊（不可点）」与「缺胶囊（可点）」两拨 id，
 * 供卡槽组件一次拿到两态判据。
 * @param {readonly string[] | null | undefined} presentKinds 输入框里已有的链接种类
 * @param {ReadonlyArray<object>} slots
 * @returns {{ filledIds: readonly string[], openIds: readonly string[] }}
 */
export function splitQuickLinkSlots(presentKinds, slots) {
  const filledIds = []
  const openIds = []
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slot || typeof slot.id !== 'string') continue
    if (isQuickLinkSlotFilled(presentKinds, slot)) filledIds.push(slot.id)
    else openIds.push(slot.id)
  }
  return { filledIds, openIds }
}

/**
 * 把输入框已解析出的令牌列表折成一份**等效草稿文本**。
 *
 * 卡槽的两态必须随草稿变化重渲染，而渲染期读 DOM 是不可靠的派生源；
 * `usePromptSlotEnhancer` 的 `slots` 本身就是草稿文本的响应式投影
 * （`extractPromptSlots` 的产物），因此用它拼一份等效文本，
 * 交给同一个 `isQuickLinkSlotFilled` 判据，判据仍然只有一份实现。
 *
 * @param {readonly { raw?: string }[]} detectedSlots 输入框已解析出的令牌
 * @returns {string}
 */
export function detectedSlotsDraftText(detectedSlots) {
  if (!Array.isArray(detectedSlots)) return ''
  return detectedSlots
    .map((slot) => (slot && typeof slot.raw === 'string' ? slot.raw : ''))
    .filter(Boolean)
    .join(' ')
}

/** 正则元字符转义（显示名目前都是纯文本，转义只为不依赖这个前提）。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 本快捷方式写过的令牌匹配式：跨语言（`[视频]` 或 `[Video]`），
 * 且**整体**吃掉 markdown 形态 `[视频](url)`——只删方括号会留下 `(url)` 残骸，
 * 而 `isQuickLinkSlotFilled` 又把该形态判为「已填」，两者必须对称。
 * @param {readonly string[]} kinds
 * @returns {RegExp | null}
 */
function shortcutTokenPattern(kinds) {
  const alternatives = []
  for (const kind of kinds) {
    for (const token of quickLinkTokensForKind(kind)) {
      const label = token.slice(1, -1)
      if (label) alternatives.push(escapeRegExp(label))
    }
  }
  if (alternatives.length === 0) return null
  return new RegExp(`\\[(?:${alternatives.join('|')})\\](?:\\([^)\\s]*\\))?`, 'g')
}

/** 一次扫出全部令牌命中，取首个与末个（首末各用于一个方向的定点剥离）。 */
function tokenSpans(text, pattern) {
  let first = null
  let last = null
  for (const match of text.matchAll(pattern)) {
    if (!first) first = match
    last = match
  }
  return { first, last }
}

/**
 * 从头吃掉「空白 + 本快捷方式的令牌」这一串，最多吃 budget 个。
 * @returns {{ rest: string, used: number }}
 */
function consumeLeadingTokens(text, pattern, budget) {
  let rest = text
  let used = 0
  while (used < budget) {
    const trimmed = rest.replace(/^\s+/, '')
    const { first } = tokenSpans(trimmed, pattern)
    if (!first || first.index !== 0) break
    rest = trimmed.slice(first[0].length)
    used += 1
  }
  return { rest: used > 0 ? rest : text, used }
}

/**
 * 从尾吃掉「本快捷方式的令牌 + 空白」这一串，最多吃 budget 个。
 * @returns {{ rest: string, used: number }}
 */
function consumeTrailingTokens(text, pattern, budget) {
  let rest = text
  let used = 0
  while (used < budget) {
    const trimmed = rest.replace(/\s+$/, '')
    const { last } = tokenSpans(trimmed, pattern)
    if (!last || last.index + last[0].length !== trimmed.length) break
    rest = trimmed.slice(0, last.index)
    used += 1
  }
  return { rest: used > 0 ? rest : text, used }
}

/**
 * 撤回时只剥掉**本快捷方式写入**的那部分草稿：预填提示语与它带来的链接令牌。
 * 用户在提示语之后手打的追加文字原样保留，绝不整篇清空；用户自己独立输入的
 * 同名令牌也不动——剥离按「本快捷方式写入的尾块」定点进行，且以本条目写过的
 * 链接种类数为出现次数上限（每种链接本条目只写一个令牌，故与写入的令牌数相等）。
 *
 * 提示语只在仍是草稿开头时才剥（用户改过提示语就整段保留）；用户改过提示语时，
 * 令牌会落在草稿末尾，因此尾块再收一次，两次合计仍不超过种类数上限。
 *
 * @param {{ prompt?: string } | null | undefined} entry 快捷方式条目
 * @param {string | null | undefined} draft 当前草稿
 * @returns {string} 剥掉本快捷方式内容后的草稿
 */
export function stripQuickShortcutText(entry, draft) {
  const text = typeof draft === 'string' ? draft : ''
  if (!text) return ''
  const kinds = quickShortcutLinks(entry)
  if (kinds.length === 0) return text.trim()

  const pattern = shortcutTokenPattern(kinds)
  if (!pattern) return text.trim()

  const prompt = entry && typeof entry.prompt === 'string' ? entry.prompt : ''
  let rest = text
  if (prompt && rest.startsWith(prompt)) rest = rest.slice(prompt.length)

  // 上限 = 本条目的卡槽集会写入的链接种类数（默认链接 + 上方可点的可追加链接）：
  // 点快捷方式只写默认链接，可追加链接要用户点上方卡槽才写，故两者都算本条目名下。
  // 用户后来自己敲的同名令牌不在上限内，绝不动。
  let budget = kinds.length
  const leading = consumeLeadingTokens(rest, pattern, budget)
  rest = leading.rest
  budget -= leading.used

  if (budget > 0) rest = consumeTrailingTokens(rest, pattern, budget).rest

  return rest.trim()
}
