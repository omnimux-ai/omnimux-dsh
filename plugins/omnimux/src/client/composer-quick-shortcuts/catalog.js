/**
 * 输入框下方四条快捷方式的**唯一真源**。
 *
 * 一条快捷方式 = 预填提示语 + 默认链接卡槽（+ 可追加链接卡槽）+ 一款已内置技能。
 * 技能不在作品里硬编码身份，只记 slug，运行时经全局技能库通道
 * （`window.__omnimuxSkillLibrary`，由 omnimux-market 发布）按 slug 解析；
 * 解析不到就**整条不渲染**，绝不弹空选择器。
 *
 * 本模块只做纯数据与纯函数：不碰 DOM、不碰 Store、不发起请求，
 * 便于 node:test 直接消费，也便于跨文件对拍。
 */

/** 预填提示语原文，逐字写死，任何改写都是产品事故。 */
export const QUICK_SHORTCUTS = Object.freeze([
  Object.freeze({
    id: 'clone',
    labelKey: 'quickShortcuts.clone',
    prompt: '请用我的产品复刻这个爆款视频',
    skillSlug: 'replicate-viral-video',
    defaultLink: 'video',
    extraLinks: Object.freeze(['product']),
    showModelControls: true,
  }),
  Object.freeze({
    id: 'breakdown',
    labelKey: 'quickShortcuts.breakdown',
    prompt: '请帮我分析拆解这个视频。',
    skillSlug: 'video-hook-analysis',
    defaultLink: 'video',
    extraLinks: Object.freeze([]),
    showModelControls: false,
  }),
  Object.freeze({
    id: 'selling',
    labelKey: 'quickShortcuts.selling',
    prompt: '请帮我一键生成一条带货视频。',
    skillSlug: 'create-selling-video',
    defaultLink: 'product',
    extraLinks: Object.freeze(['video']),
    showModelControls: true,
  }),
  Object.freeze({
    id: 'reverse',
    labelKey: 'quickShortcuts.reverse',
    prompt: '请把这个视频反推成 Seedance 可用的 AI 提示词。',
    skillSlug: 'reverse-video-prompt',
    defaultLink: 'video',
    extraLinks: Object.freeze([]),
    showModelControls: false,
  }),
])

/** 链接种类 → 卡槽显示名（i18n key）；真源只有视频与商品两种。 */
export const QUICK_LINK_KINDS = Object.freeze(['video', 'product'])

/** 链接种类的卡槽文案 key。 */
export function quickLinkLabelKey(kind) {
  return kind === 'product' ? 'quickShortcuts.link.product' : 'quickShortcuts.link.video'
}

/**
 * 一条快捷方式会用到的全部链接卡槽：默认链接在前，可追加链接在后。
 * @param {{ defaultLink?: string, extraLinks?: readonly string[] } | null | undefined} entry
 * @returns {readonly string[]} 去重后的链接种类；非法输入返回空数组
 */
export function quickShortcutLinks(entry) {
  if (!entry || typeof entry !== 'object') return []
  const kinds = []
  const push = (kind) => {
    if (typeof kind !== 'string' || !QUICK_LINK_KINDS.includes(kind)) return
    if (!kinds.includes(kind)) kinds.push(kind)
  }
  push(entry.defaultLink)
  if (Array.isArray(entry.extraLinks)) entry.extraLinks.forEach(push)
  return kinds
}

/**
 * 按当前技能库解析四条快捷方式：解析不到技能的那条**不进入结果**。
 *
 * @param {(slug: string) => object | null | undefined} resolveSkill 技能解析器
 * @returns {ReadonlyArray<object>} 可渲染的快捷方式（保留真源顺序）
 */
export function resolveQuickShortcuts(resolveSkill) {
  if (typeof resolveSkill !== 'function') return []
  const resolved = []
  for (const entry of QUICK_SHORTCUTS) {
    let skill = null
    try {
      skill = resolveSkill(entry.skillSlug)
    } catch {
      // 技能库不可用（通道未就绪 / 数据缺失）时视为解析不到，绝不上抛
      skill = null
    }
    if (!skill || typeof skill !== 'object') continue
    resolved.push(Object.freeze({ ...entry, skill }))
  }
  return Object.freeze(resolved)
}

/**
 * 切换互斥规则：从一条快捷方式切到另一条，提示语与链接**整组替换**，
 * 技能只保留一颗（技能身份由当前条目唯一决定，因此天然不叠加）。
 *
 * @param {string | null} activeId 当前选中的快捷方式 id
 * @param {string} nextId 被点击的快捷方式 id
 * @returns {{ activeId: string | null, links: readonly string[] }}
 *   点同一条即取消（activeId 归 null、链接清空）；点不存在的 id 保持现状
 */
export function applyQuickShortcut(activeId, nextId) {
  const next = QUICK_SHORTCUTS.find((entry) => entry.id === nextId)
  if (!next) return { activeId: activeId || null, links: activeId ? quickShortcutLinks(byId(activeId)) : [] }
  if (activeId === nextId) return { activeId: null, links: [] }
  return { activeId: next.id, links: quickShortcutLinks(next) }
}

/**
 * 取消技能只动技能：提示语与链接卡槽必须原样保留。
 * @param {{ activeId: string | null, links: readonly string[], skill: object | null }} state
 * @returns {{ activeId: string | null, links: readonly string[], skill: null }}
 */
export function clearQuickShortcutSkill(state) {
  return {
    activeId: state?.activeId || null,
    links: Array.isArray(state?.links) ? state.links : [],
    skill: null,
  }
}

/**
 * 判断某个链接卡槽在草稿里是否**已经存在胶囊**：存在则卡槽不可点。
 * 胶囊即提示语槽位令牌 `[视频]` / `[商品]`，带链接时形如 `[视频](https://…)`，
 * 两种形态都含令牌本体，因此一次包含判断即可覆盖。
 *
 * @param {string | null | undefined} draft 输入框草稿
 * @param {string} kind 链接种类
 * @param {(key: string) => string} label 令牌文案（跟随语言）
 * @returns {boolean}
 */
export function hasLinkToken(draft, kind, label) {
  const token = typeof label === 'string' ? label.trim() : ''
  if (!token) return false
  const text = typeof draft === 'string' ? draft : ''
  if (!text) return false
  return text.includes(`[${token}]`)
}

/** 内部：按 id 取条目（不对外暴露，避免调用方绕过解析）。 */
function byId(id) {
  return QUICK_SHORTCUTS.find((entry) => entry.id === id) || null
}
