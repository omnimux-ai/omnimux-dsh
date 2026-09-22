/**
 * 快捷链接胶囊的**纯模型**：胶囊形态、节点属性、以及「胶囊 → 提交文本」的转换。
 *
 * 只做纯数据与纯函数——不碰 DOM、不碰 Store、不发起请求，因此 node:test 可以直接
 * 消费；真实节点的创建与插入在 `dom.js`，两处共用这里这一份形态定义，不各自拼一份。
 *
 * 提交形态按仓库现状对齐，不另发明格式，且**语言无关**（用 `commitLabel`，不用界面语言名）：
 *   - 视频 `[视频](url)`：既有提交桥（`composer-add/AttachmentSubmitBridge.jsx`）与
 *     `composer-video-token.test.js` 钉死的形态，保持不变；
 *   - 商品 `[商品: url]`：既有商品槽位填充形态——`attachments/ProductUrlPopover.tsx`
 *     确认后经 `PromptSlotChips.onReplaceSlot` 写入的正是这一形态，
 *     `attachments/promptSlotDetector.ts` 也按「名称: 值」解析它。
 *
 * 为什么固定名而不是跟随语言：提交文本一旦随界面语言漂移（中文 `[视频](url)`、英文
 * `[Video](url)`），下游就没有唯一形态可认——规格 S6 也只字面写了中文形态。
 * 胶囊**显示名**（`data-omx-chip-label`、胶囊内文字）照旧跟随语言，两者互不影响。
 */

/** 胶囊根节点类名（样式表 `styles.js` 与此处共用一个名字）。 */
export const QUICK_LINK_CHIP_CLASS = 'omx-link-chip'

/** 胶囊内「可粘贴链接」输入框的类名。 */
export const QUICK_LINK_CHIP_INPUT_CLASS = 'omx-link-chip__input'

/**
 * 胶囊宿主行的类名（输入框卡片内、我们自己创建的那一行）。
 *
 * 胶囊不放宿主 contenteditable 里：宿主是 Lexical 编辑器，会清掉根节点下的非受管子节点
 * （浏览器实测：插进可编辑区的胶囊在宿主渲染提示语时被抹掉）。宿主行是宿主 React 不管的
 * 外部子节点，稳定存在，又落在输入框卡片内，视觉上就是「输入框里的链接胶囊」。
 */
export const QUICK_LINK_CHIP_ROW_CLASS = 'omx-link-chip-row'

/**
 * 胶囊及其内部输入框的稳定选择器。
 * 宿主通道据此**让路**：用户往胶囊输入框里粘贴链接时，既有的视频粘贴拦截与提交桥
 * 都不得把它当成草稿里的粘贴。
 */
export const QUICK_LINK_CHIP_SELECTOR = '[data-omx-video-token="true"], [data-omx-product-token="true"]'

/**
 * 两种链接胶囊的形态真源。
 *
 * `tokenAttr` 是提交桥读取用的锚点：视频沿用既有 `data-omx-video-token`（桥已按它读
 * 内部 input 的 value），商品新增对等的 `data-omx-product-token`。
 * `markdown` 标明提交形态（`markdown-link` = `[名称](url)`；`markdown-slot` = `[名称: url]`）。
 * `commitLabel` 是**提交文本里的固定名**（语言无关，见文件头）；`defaultLabel` 只是
 * 胶囊显示名在文案解析器失灵时的中文兜底，两者不可互换。
 */
export const QUICK_LINK_CHIP_SPECS = Object.freeze({
  video: Object.freeze({
    kind: 'video',
    chipAttr: 'video',
    tokenAttr: 'data-omx-video-token',
    icon: 'link',
    defaultLabel: '视频',
    commitLabel: '视频',
    markdown: 'markdown-link',
    placeholderKey: 'quickShortcuts.link.videoPlaceholder',
    placeholder: '粘贴 TikTok 视频链接',
    removeKey: 'quickShortcuts.link.videoRemove',
    removeLabel: '移除视频链接',
  }),
  product: Object.freeze({
    kind: 'product',
    chipAttr: 'product',
    tokenAttr: 'data-omx-product-token',
    icon: 'package',
    defaultLabel: '商品',
    commitLabel: '商品',
    markdown: 'markdown-slot',
    placeholderKey: 'quickShortcuts.link.productPlaceholder',
    placeholder: '粘贴商品链接或 ID',
    removeKey: 'quickShortcuts.link.productRemove',
    removeLabel: '移除商品链接',
  }),
})

/** 全部链接种类（顺序即真源顺序）。 */
export const QUICK_LINK_CHIP_KINDS = Object.freeze(Object.keys(QUICK_LINK_CHIP_SPECS))

/**
 * 取某种链接的胶囊形态；认不出的种类返回 null（不上抛、不猜）。
 * @param {string} kind 链接种类（video / product）
 * @returns {object | null}
 */
export function quickLinkChipSpec(kind) {
  if (typeof kind !== 'string' || !kind) return null
  return Object.freeze(QUICK_LINK_CHIP_SPECS)[kind] || null
}

/**
 * 取某种链接在提交桥里的节点选择器。
 * @param {string} kind 链接种类
 * @returns {string} 选择器；认不出的种类返回空串
 */
export function quickLinkChipSelectorFor(kind) {
  const spec = quickLinkChipSpec(kind)
  return spec ? `[${spec.tokenAttr}="true"]` : ''
}

/**
 * 令牌属性名 → 链接种类（反过来读节点用）。
 * @param {string} attrName 例如 `data-omx-product-token`
 * @returns {string} 链接种类；认不出返回空串
 */
export function quickLinkChipKindFromAttr(attrName) {
  if (typeof attrName !== 'string' || !attrName) return ''
  for (const kind of QUICK_LINK_CHIP_KINDS) {
    if (QUICK_LINK_CHIP_SPECS[kind].tokenAttr === attrName) return kind
  }
  return ''
}

/**
 * 胶囊的显示文案（名称 / 占位 / 删除按钮读屏名）。
 * 文案缺失时退回中文原名，绝不渲染空胶囊；传入的 label 优先（跟随界面语言）。
 * @param {string} kind 链接种类
 * @param {string} [label] 当前语言下的链接名称（视频 / 商品）
 * @param {(key: string) => string} [t] 文案解析器
 * @returns {{ name: string, placeholder: string, removeLabel: string } | null}
 */
export function quickLinkChipTexts(kind, label, t) {
  const spec = quickLinkChipSpec(kind)
  if (!spec) return null
  const read = (key, fallback) => {
    if (typeof t !== 'function') return fallback
    const value = t(key)
    return typeof value === 'string' && value && value !== key ? value : fallback
  }
  const name = typeof label === 'string' && label.trim() ? label.trim() : spec.defaultLabel
  return Object.freeze({
    name,
    placeholder: read(spec.placeholderKey, spec.placeholder),
    removeLabel: read(spec.removeKey, spec.removeLabel),
  })
}

/**
 * 胶囊 → 提交文本。空链接不出文本（宁可不提交，也不提交半截标记）。
 *
 * 名称取 `commitLabel`（语言无关的固定名）：提交文本是给下游认的形态，不随界面语言变。
 * @param {string} kind 链接种类
 * @param {string} url 用户填进胶囊的链接或 ID
 * @returns {string} 例如 `[视频](https://…)` 或 `[商品: https://…]`；非法输入返回空串
 */
export function quickLinkChipMarkdown(kind, url) {
  const spec = quickLinkChipSpec(kind)
  const value = typeof url === 'string' ? url.trim() : ''
  if (!spec || !value) return ''
  return spec.markdown === 'markdown-slot' ? `[${spec.commitLabel}: ${value}]` : `[${spec.commitLabel}](${value})`
}

/**
 * 事件目标是否落在某个链接胶囊内部（含其输入框）。
 * 宿主通道据此让路：胶囊里的粘贴、回车都归胶囊自己，不归草稿。
 * @param {EventTarget | null | undefined} target
 * @returns {boolean}
 */
export function isQuickLinkChipTarget(target) {
  if (!target || typeof target !== 'object') return false
  const closest = target.closest
  if (typeof closest !== 'function') return false
  return Boolean(closest.call(target, QUICK_LINK_CHIP_SELECTOR))
}
