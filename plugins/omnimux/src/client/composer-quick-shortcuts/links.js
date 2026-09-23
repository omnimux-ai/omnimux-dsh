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
 * 输入框里那条旧语言的令牌判不出「已填」，卡槽会重新变可点并插进第二种语言的重复令牌。
 *
 * **链接已改成真正的胶囊节点**（`linkChip.js` 定义形态、`dom.js` 负责插入与读取），
 * 因此「已填」的主判据从「草稿文本里有令牌」换成「输入框里有该种类的胶囊节点」：
 * 胶囊不进草稿文本，槽位投影看不见它，卡槽两态只能靠节点种类判。文本判据保留下来
 * 兼容**用户手打**的令牌：`[视频]` 这种裸令牌照旧算「已填」；商品那一路还认它自己的
 * 提交形态 `[商品: <值>]`（与 `attachments/promptSlotDetector.ts` 的「名称: 值」解析同口径），
 * 否则草稿里已经躺着一条商品槽位、卡槽却仍判未填，再点就插出第二枚商品胶囊。
 */

import { QUICK_LINK_KINDS, quickLinkLabelKey, quickLinkEntryLabelKey } from './catalog.js'
import { quickLinkChipSpec } from './linkChip.js'
import { en, zh } from '../locales.js'

/**
 * 链接卡槽的**令牌文本**（`[视频]` / `[商品]`）。
 *
 * 链接本身由胶囊节点承载（`dom.js`），令牌只剩一个用途：喂给
 * `PromptSlotChips` 的 `raw` 契约字段，以及兼容**用户手打**的同名令牌
 * （提示词槽位高亮仍按它解析，卡槽据此判「已填」）。本通道自己不往草稿写令牌。
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

/** 正则元字符转义（显示名目前都是纯文本，转义只为不依赖这个前提）。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 各种类的**槽位形态**匹配式：`[<名称>: <值>]`。
 *
 * 只给提交形态是 `markdown-slot` 的种类建式（现在是商品）：视频的提交形态是
 * `[视频](url)`，而 `[视频: xxx]` 在 `promptSlotDetector` 口径里落的是文件槽位，
 * 不该被算成「视频链接已填」。名称取登记表里全部支持语言的显示名，
 * 因此 `[商品: url]` 与 `[Product: url]` 都认。
 */
function buildSlotFormIndex() {
  const index = new Map()
  for (const kind of QUICK_LINK_KINDS) {
    const spec = quickLinkChipSpec(kind)
    if (!spec || spec.markdown !== 'markdown-slot') continue
    const forms = []
    for (const label of LINK_LABELS_BY_KIND.get(kind) || []) {
      if (label) forms.push(new RegExp(`\\[\\s*${escapeRegExp(label)}\\s*:\\s*[^\\]\\n]+\\]`))
    }
    index.set(kind, Object.freeze(forms))
  }
  return index
}

const SLOT_FORMS_BY_KIND = buildSlotFormIndex()

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
 * 解析各链接种类的显示名（令牌使用）。文案缺失时退回中文原名，绝不渲染空卡槽。
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
 * 解析各链接种类的入口展示名（“视频链接” / “商品链接”）。文案缺失时退回中文原名。
 * @param {(key: string) => string} t
 * @returns {{ video: string, product: string }}
 */
export function quickLinkEntryLabels(t) {
  const read = (kind, fallback) => {
    const key = quickLinkEntryLabelKey(kind)
    if (typeof t !== 'function') return fallback
    const value = t(key)
    return typeof value === 'string' && value && value !== key ? value : fallback
  }
  return { video: read('video', '视频链接'), product: read('product', '商品链接') }
}

/**
 * 把链接种类数组构建成既定组件可消费的卡槽列表。
 *
 * `protocol: 'url'` 只用于复用既有卡槽的链接图标与文案分支；
 * 点击行为由调用方经 `onSelectSlot` 覆盖，不走协议自身的默认分支。
 *
 * @param {readonly string[]} links 链接种类（顺序即展示顺序）
 * @param {{ video: string, product: string }} labels 底层令牌名称（用于 raw / token 生成）
 * @param {{ video: string, product: string }} [entryLabels] 入口展示标签（用于 placeholder 渲染）
 * @returns {ReadonlyArray<object>}
 */
export function buildQuickLinkSlots(links, labels, entryLabels) {
  if (!Array.isArray(links) || links.length === 0) return []
  const slots = []
  for (const kind of links) {
    const label = labels && labels[kind]
    const token = quickLinkToken(label)
    if (!token) continue
    const entryLabel = (entryLabels && entryLabels[kind]) || label
    slots.push(Object.freeze({
      id: `omx-quick-link-${kind}`,
      raw: token,
      placeholder: entryLabel,
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
 * 两条文本判据：裸令牌（用户手打），以及该种类自己的**提交形态槽位**
 * `[商品: <值>]`（本通道提交时写进草稿的就是它，`promptSlotDetector` 同口径解析）。
 * 缺了后者，草稿里已有商品槽位时卡槽仍判未填，再点会插出第二枚商品胶囊。
 *
 * 胶囊节点的种类读口在 `dom.js` 的 `readQuickLinkChipKinds`；这里只负责文本，
 * 两条输入由 `mergeQuickLinkKinds` 合成同一份「已填」判据。
 * @param {string | null | undefined} draft
 * @returns {readonly string[]}
 */
export function quickLinkKindsInDraft(draft) {
  const text = typeof draft === 'string' ? draft : ''
  if (!text) return []
  const kinds = []
  for (const kind of QUICK_LINK_KINDS) {
    const bare = quickLinkTokensForKind(kind).some((token) => text.includes(token))
    const slotForm = (SLOT_FORMS_BY_KIND.get(kind) || []).some((pattern) => pattern.test(text))
    if (bare || slotForm) kinds.push(kind)
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

/**
 * 撤回时只剥掉**本快捷方式写入**的那部分草稿。
 *
 * 本通道写草稿只写一样东西——条目自带的预填提示语（`entry.prompt`）；链接由胶囊节点
 * 承载，**不写任何文本令牌**。因此这里只做一件事：提示语仍在草稿开头时把它剥掉，
 * 用户在提示语之后手打的追加文字原样保留，绝不整篇清空。
 *
 * 曾经的「按卡槽集数量为上限剥离令牌」已删除（Issue #2579 审查 中-7）：那时点快捷方式
 * 会往草稿写 `[视频]` 文本令牌，剥离上限按卡槽集算还说得过去；现在写入的令牌数为 0，
 * 同一条上限就会反过来吃掉**用户手打**的 `[视频]` / `[视频](url)` 令牌——违反
 * 「绝不动用户手打的同名令牌」这条承诺。胶囊的清理交给胶囊删除通道
 * （`dom.js` 的 `removeQuickLinkChips`，按当前会话的输入框卡片收敛）。
 *
 * 代价：用户改过提示语时（提示语不再是草稿开头）整条保留，不再顺手清掉末尾令牌；
 * 宁可留下一行可见的文字，也不静默删掉用户可能不是在替我们写的内容。
 *
 * @param {{ prompt?: string } | null | undefined} entry 快捷方式条目
 * @param {string | null | undefined} draft 当前草稿
 * @returns {string} 剥掉本快捷方式提示语后的草稿
 */
export function stripQuickShortcutText(entry, draft) {
  const text = typeof draft === 'string' ? draft : ''
  if (!text) return ''
  const prompt = entry && typeof entry.prompt === 'string' ? entry.prompt : ''
  if (!prompt || !text.startsWith(prompt)) return text.trim()
  return text.slice(prompt.length).trim()
}
