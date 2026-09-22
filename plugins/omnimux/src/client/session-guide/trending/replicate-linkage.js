/**
 * 「复刻爆款视频」联动契约：把爆款对标卡片变成会话输入框上的**附件 + 技能**双挂载。
 *
 * 复刻不再往输入框草稿里灌整块结构化指令，而是走平台既有的三条真源通道：
 *   1. 会话附件 Store（`ConversationAttachment`）——复刻对象以视频附件进挂件栏，
 *      卡面直接吃封面缩略图（`previewUrl`）与标题；
 *   2. `omnimux:skill:changed` 全局事件——底部工具栏技能药丸据此亮起；
 *   3. 提交时的关联上下文组装（`assemblePromptWithAttachments`）——附件数据随消息
 *      交给模型，但**不**停留在用户气泡里。
 *
 * 本模块只做纯数据：不碰 DOM、不碰 Store，便于 node:test 直接消费。
 */

/** 复刻对象挂载到会话附件栏时使用的来源插件标识。 */
export const REPLICATE_SOURCE_PLUGIN = 'omnimux-inspiration'

/** 未提供标题时的复刻对象兜底标题。 */
export const REPLICATE_FALLBACK_TITLE = '对标爆款视频'

/** 技能药丸的移除与激活共用的全局事件名（由 omnimux-market 的技能选择器消费）。 */
export const SKILL_CHANGED_EVENT = 'omnimux:skill:changed'

/** 附件栏移除复刻对象时广播的事件名，供卡片态与技能药丸反向同步。 */
export const REPLICATE_CLEARED_EVENT = 'omnimux:replicate:cleared'

/**
 * 「复刻爆款视频」技能身份。
 * 与 `session-guide/catalog.js` 里的 `sk-omx-video-deconstruct` 词条同源，
 * 技能选择器按 slug 组装 `/video-deconstruct` 手势令牌。
 */
export const RECREATE_SKILL = Object.freeze({
  id: 'sk-omx-video-deconstruct',
  name: '复刻爆款视频',
  title: '复刻爆款视频',
  slug: 'video-deconstruct',
  description: '拆解爆款视频镜头、运镜、声音并编译为可复刻的最终 Prompt 与制作计划。',
})

/** 复刻对象送进输入框的极简提示词，只表达意图，不携带结构化数据。 */
export const RECREATE_PROMPT = '复刻这条爆款视频'

/**
 * 判断某个技能是否就是复刻技能（技能身份取自事件载荷，字段可能只给其一）。
 *
 * **身份优先于名称**：只要能拿到 id 或 slug 之一，就只按这两个稳定标识判定——
 * 名字是展示文案，会被别的货架条目复用（例如「复刻爆款视频」这款内置货架技能
 * 与复刻技能**同名但不同身份**）。若让名称兜底压过 slug，同名技能就会被认成
 * 复刻技能，进而被复刻板块的卸载清理静默熄灭。名称分支只在 id 与 slug
 * **都缺席**时启用，兼容只带显示名的历史载荷。
 *
 * @param {{ id?: unknown, slug?: unknown, name?: unknown, title?: unknown } | null | undefined} skill
 * @returns {boolean}
 */
export function isRecreateSkill(skill) {
  if (!skill || typeof skill !== 'object') return false
  const id = String(skill.id || '')
  const slug = String(skill.slug || '')
  if (id || slug) {
    return id === RECREATE_SKILL.id || slug === RECREATE_SKILL.slug
  }
  const label = String(skill.name || skill.title || '')
  return label !== '' && label === RECREATE_SKILL.name
}

/**
 * 技能通道的一次变更是否等于「复刻药丸被撤下」。
 *
 * 通道上跑的不止复刻：技能选择器点选别的技能、或点 ✕ 清掉别的技能，
 * 都会广播出去。把它们当成复刻被撤下，会把复刻对象从附件栏静默删掉。
 * 判据因此收紧成两条同时成立——本次是清空，且清掉的正是复刻技能本身。
 *
 * @param {{ id?: unknown, slug?: unknown, name?: unknown, title?: unknown } | null} skill 本次广播的技能
 * @param {{ id?: unknown, slug?: unknown, name?: unknown, title?: unknown } | null} activeSkill 广播后通道里钉着的技能
 * @returns {boolean}
 */
export function shouldReleaseReplicateAttachments(skill, activeSkill) {
  if (skill !== null) return false
  return activeSkill != null && isRecreateSkill(activeSkill)
}

/**
 * 把灵感库媒体地址收敛成工作区相对路径，避免把云端绝对地址写进附件引用。
 * @param {unknown} raw
 * @param {string} fallbackId
 * @returns {string}
 */
function toRelativeMediaPath(raw, fallbackId) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return `inspiration/${fallbackId}.mp4`
  const localMatch = value.match(/\/omnimux\/inspiration\/local\/media\/(.+)$/)
  if (localMatch && localMatch[1]) return `inspiration/${localMatch[1]}`
  if (/^https?:\/\//i.test(value) || value.includes('..')) {
    return `inspiration/${fallbackId}.mp4`
  }
  return `inspiration/${value.replace(/^\/+/, '')}`
}

/**
 * 对标卡片 → 会话附件负载。
 *
 * 卡片行的字段是「封面 `cover` + 来源 `sourceUrl`」，这里如实映射为附件的
 * `previewUrl` 与 `relativePath`；`metadata` 带上卡片身份，提交时随上下文交给模型。
 *
 * @param {object | null | undefined} item 对标卡片行
 * @returns {object | null} 可直接交给 `addAttachment` 的负载；无 id 时返回 null
 */
export function buildReplicateAttachmentPayload(item) {
  if (!item || typeof item !== 'object') return null
  const id = item.id != null ? String(item.id).trim() : ''
  if (!id) return null

  const title = String(item.title || '').trim() || REPLICATE_FALLBACK_TITLE
  // 卡片行用 cover / sourceUrl；兼容其它来源可能给的 coverUrl / videoUrl 命名。
  const previewUrl = String(item.cover || item.coverUrl || item.thumbnail || '').trim()
  const mediaRaw = item.sourceUrl || item.videoUrl || item.relativePath || ''
  const relativePath = toRelativeMediaPath(mediaRaw, id)
  const extensionMatch = relativePath.match(/\.([a-zA-Z0-9]+)$/)
  const extension = extensionMatch ? extensionMatch[1].toUpperCase() : 'MP4'

  return {
    sourcePlugin: REPLICATE_SOURCE_PLUGIN,
    kind: 'video',
    entityId: id,
    title,
    extension,
    relativePath,
    previewUrl,
    duration: item.duration ? String(item.duration) : '',
    metadata: {
      inspirationId: id,
      isRecreateTarget: true,
      title,
      region: item.region || '',
      industry: item.industry || '',
      structure: item.structure || item.angle || '',
      sourceUrl: item.sourceUrl || '',
      views: Number.isFinite(item.views) ? item.views : null,
      engagement: Number.isFinite(item.engagement) ? item.engagement : null,
      cover: previewUrl,
    },
  }
}

/**
 * 从附件负载里取回复刻对象的实体身份，用于卡片态与附件态互认。
 * @param {object | null | undefined} attachment
 * @returns {string} 实体 id，非复刻对象返回空串
 */
export function readReplicateEntityId(attachment) {
  if (!attachment || typeof attachment !== 'object') return ''
  if (!attachment.metadata || attachment.metadata.isRecreateTarget !== true) return ''
  return attachment.entityId != null ? String(attachment.entityId) : ''
}

/**
 * 取回附件栏里当前挂着的复刻对象（同一会话只应有一个）。
 * @param {readonly object[] | null | undefined} attachments
 * @returns {object | null}
 */
export function findReplicateAttachment(attachments) {
  if (!Array.isArray(attachments)) return null
  for (const attachment of attachments) {
    if (readReplicateEntityId(attachment)) return attachment
  }
  return null
}
