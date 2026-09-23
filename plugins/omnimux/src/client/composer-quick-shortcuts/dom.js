/**
 * 输入框作用域解析与旧草稿兼容辅助。
 * 在线旧胶囊保留读取、显式关闭和提交通知；新链接由公开引用接口插入。
 * 本模块不挂载胶囊行、不批量删除在线节点，也不发起请求。
 */

import {
  QUICK_LINK_CHIP_CLASS,
  QUICK_LINK_CHIP_INPUT_CLASS,
  QUICK_LINK_CHIP_KINDS,
  QUICK_LINK_CHIP_SELECTOR,
  quickLinkChipSpec,
  quickLinkChipTexts,
} from './linkChip.js'
import { ensureQuickShortcutStyles } from './styles.js'

/** 官方输入框可编辑区选择器（与 attachments 模块保持一致，避免两份真源漂移）。 */
const EDITOR_SELECTORS = [
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
].join(', ')

/** 官方输入框卡片（胶囊行的宿主）。 */
const COMPOSER_CARD_SELECTOR = '[data-composer-card]'

/**
 * 会话作用域根（宿主事实，见 `resolveComposerCard`）：
 * 每个会话自己的输入区都落在自己的 `[data-composer-seat]` 里，
 * 会话整体再包在 `[data-phase]` 的会话根内。
 */
const CONVERSATION_SCOPE_SELECTOR = '[data-composer-seat], [data-phase]'

/** 胶囊出现 / 消失的广播事件：卡槽行据此重算两态（胶囊不进草稿文本，槽位投影看不见它）。 */
export const QUICK_LINK_CHIP_CHANGE_EVENT = 'omnimux:quick-link-chips:changed'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 胶囊图标路径（纯矢量、零 Emoji）：视频用链接图标，商品用包裹图标。 */
const CHIP_ICON_PATHS = Object.freeze({
  link: Object.freeze([
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ]),
  package: Object.freeze([
    'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    'M3.27 6.96 12 12.01l8.73-5.05',
    'M12 22.08V12',
  ]),
})

/** 胶囊内部的输入类事件一律不外传：草稿的按键、粘贴、输入都归宿主，胶囊里的归胶囊。 */
const ISOLATED_EVENTS = Object.freeze([
  'keydown',
  'keypress',
  'keyup',
  'beforeinput',
  'input',
  'paste',
  'cut',
  'copy',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'pointerdown',
  'mousedown',
  'click',
])

/**
 * 取当前会话的官方输入框可编辑区。
 * @returns {HTMLElement | null}
 */
export function findComposerEditor() {
  if (typeof document === 'undefined') return null
  return document.querySelector(EDITOR_SELECTORS)
}

/**
 * 读当前草稿文本。优先读官方输入框快照（含尚未落到 DOM 的草稿），
 * 退回可编辑区文本，再退回空串。
 * @returns {string}
 */
export function readDraft() {
  try {
    const actions = typeof window !== 'undefined' ? window.__omnimuxComposerActions : null
    const draft = actions && typeof actions.getDraft === 'function' ? actions.getDraft() : ''
    if (typeof draft === 'string' && draft) return draft
  } catch {
    // 宿主桥未就绪时退回读 DOM
  }
  const editor = findComposerEditor()
  if (!editor) return ''
  return editor.innerText || editor.textContent || ''
}

/**
 * 整组写入草稿（切换快捷方式时提示语一次替换到位）。
 *
 * 返回值**必须来自桥自己的回执**，不能只看「桥对象存在」：官方输入框的
 * `inputActions.setDraft` 缺失或抛错时，桥会回 false，这里也回 false，
 * 调用方据此整条不生效，不会出现「输入框原样、卡槽与技能胶囊已变」的错位。
 *
 * 不做写后回读校验：桥的 `getDraft` 读的是宿主输入快照，而快照在调用方
 * 最近一次渲染时就已捕获（`live.current.input`），写完立刻回读只会读到旧值，
 * 把每次成功写入都误判成失败。
 *
 * @param {string} text
 * @returns {boolean} 是否真的写入成功
 */
export function writeDraft(text) {
  const value = typeof text === 'string' ? text : ''
  try {
    const actions = typeof window !== 'undefined' ? window.__omnimuxComposerActions : null
    if (!actions || typeof actions.setDraft !== 'function') return false
    return actions.setDraft(value) !== false
  } catch {
    return false
  }
}

/**
 * 把焦点交回输入框。`preventScroll` 是硬要求：否则宿主原生聚焦会把视口
 * 拉回输入框原位，用户正看的列表会被一把拽走。
 */
export function focusComposerEditor() {
  const editor = findComposerEditor()
  if (!editor || typeof editor.focus !== 'function') return false
  try {
    editor.focus({ preventScroll: true })
  } catch {
    try {
      editor.focus()
    } catch {
      return false
    }
  }
  return true
}

/** 胶囊出现 / 消失的广播（卡槽两态的唯一变更信号）。 */
export function notifyQuickLinkChipChange() {
  if (typeof window === 'undefined') return
  try {
    // 事件构造器取宿主 window 自己的那份：跨 realm 建事件在宿主里派发会被拒。
    const Ctor = typeof window.CustomEvent === 'function' ? window.CustomEvent : null
    if (!Ctor) return
    window.dispatchEvent(new Ctor(QUICK_LINK_CHIP_CHANGE_EVENT))
  } catch {
    // 事件通道不可用不影响插入结果本身
  }
}

/**
 * 订阅胶囊变更，返回退订函数。
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeQuickLinkChipChange(listener) {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {}
  window.addEventListener(QUICK_LINK_CHIP_CHANGE_EVENT, listener)
  return () => window.removeEventListener(QUICK_LINK_CHIP_CHANGE_EVENT, listener)
}

/** 纯矢量胶囊图标（零 Emoji，符合 design.md UI04）。 */
function createChipIcon(icon, doc) {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', `${QUICK_LINK_CHIP_CLASS}__icon`)
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '13')
  svg.setAttribute('height', '13')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of CHIP_ICON_PATHS[icon] || CHIP_ICON_PATHS.link) {
    const path = doc.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

/** 纯矢量关闭图标（×）。 */
function createCloseIcon(doc) {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '10')
  svg.setAttribute('height', '10')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const [x1, y1, x2, y2] of [[18, 6, 6, 18], [6, 6, 18, 18]]) {
    const line = doc.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(x1))
    line.setAttribute('y1', String(y1))
    line.setAttribute('x2', String(x2))
    line.setAttribute('y2', String(y2))
    svg.appendChild(line)
  }
  return svg
}

/** 节点属于哪种链接：按 `linkChip.js` 的令牌属性反查，认不出返回空串。 */
function kindOfChipNode(node) {
  if (!node || typeof node.getAttribute !== 'function') return ''
  for (const kind of QUICK_LINK_CHIP_KINDS) {
    const spec = quickLinkChipSpec(kind)
    if (node.getAttribute(spec.tokenAttr) === 'true') return kind
  }
  return ''
}

/**
 * 造一个链接胶囊节点：图标 + 名称 + 分隔线 + 可粘贴链接的输入框 + × 删除按钮。
 *
 * 整体 `contenteditable="false"`：宿主编辑器不得把它拆开或把光标塞进节点内部；
 * 节点里的输入框与按钮各自可用，但按键 / 粘贴 / 点击都在胶囊内就地消化，
 * 不冒泡给草稿（否则回车会触发发送、粘贴会被宿主的视频粘贴拦截截走）。
 *
 * 零 `innerHTML` 拼接（全部 DOM API 写入），零业务内联样式（样式在 `styles.js`）。
 *
 * @param {string} kind 链接种类
 * @param {{ label?: string, t?: (key: string) => string, doc?: Document }} [options]
 * @returns {HTMLElement | null} 造不出来（种类非法 / 没有 document）时回 null
 */
export function createQuickLinkChipNode(kind, options) {
  const doc = (options && options.doc) || (typeof document !== 'undefined' ? document : null)
  const spec = quickLinkChipSpec(kind)
  if (!doc || !spec) return null
  const texts = quickLinkChipTexts(kind, options && options.label, options && options.t)
  if (!texts) return null

  const chip = doc.createElement('span')
  chip.className = `${QUICK_LINK_CHIP_CLASS} ${QUICK_LINK_CHIP_CLASS}--${spec.chipAttr}`
  chip.setAttribute('data-composer-chip', spec.chipAttr)
  chip.setAttribute(spec.tokenAttr, 'true')
  chip.setAttribute('data-omx-chip-label', texts.name)
  chip.setAttribute('contenteditable', 'false')
  chip.setAttribute('role', 'group')
  chip.setAttribute('aria-label', texts.name)

  chip.appendChild(createChipIcon(spec.icon, doc))

  const name = doc.createElement('span')
  name.className = `${QUICK_LINK_CHIP_CLASS}__name`
  name.textContent = texts.name
  chip.appendChild(name)

  const divider = doc.createElement('span')
  divider.className = `${QUICK_LINK_CHIP_CLASS}__divider`
  divider.setAttribute('aria-hidden', 'true')
  chip.appendChild(divider)

  const input = doc.createElement('input')
  input.className = QUICK_LINK_CHIP_INPUT_CLASS
  input.setAttribute('type', 'text')
  input.setAttribute('placeholder', texts.placeholder)
  input.setAttribute('aria-label', texts.placeholder)
  input.setAttribute('spellcheck', 'false')
  chip.appendChild(input)

  const remove = doc.createElement('button')
  // 原生 button 是有意的：胶囊是塞进宿主 contenteditable 的原子 DOM 节点
  // （`contenteditable="false"` + 内嵌 input），走不了 JSX 组件通道，也不该为它
  // 把不可编辑区改成 React 树。形态与可访问名由样式表与 aria-label 保证。
  remove.className = `${QUICK_LINK_CHIP_CLASS}__remove`
  remove.setAttribute('type', 'button')
  remove.setAttribute('aria-label', texts.removeLabel)
  remove.setAttribute('title', texts.removeLabel)
  remove.appendChild(createCloseIcon(doc))
  chip.appendChild(remove)

  for (const type of ISOLATED_EVENTS) {
    chip.addEventListener(type, (event) => { event.stopPropagation() })
  }
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    const parent = chip.parentNode
    if (parent) parent.removeChild(chip)
    focusComposerEditor()
    notifyQuickLinkChipChange()
  })

  return chip
}

/**
 * 取**当前会话**的输入框卡片。
 *
 * **为什么必须按会话定位**：宿主可以同时挂载两张卡（分屏、多标签保活），而胶囊的读取、
 * 删除、整组替换原先一律 `document.querySelector`——那样 A 会话的卡槽会把 B 会话的胶囊
 * 算作已填、A 的撤回会删掉 B 的胶囊、提交桥会读走 B 的链接。所以三个动作统一收口到本函数。
 *
 * 定位口径（宿主官方结构，见 `ConversationRoot` / `InputBar`）：
 * `[data-phase]`（会话根）⊃ `[data-composer-seat]`（本会话输入区）⊃ `[data-composer-card]`（输入框卡片）。
 * 本插件的四条快捷方式与提交桥挂在**座位内的输入区 dock**（卡片之外、座位之内），
 * 素材托盘挂在**卡片内**——两者向上找座位（其次会话根）都能唯一命中本会话，再在座位内取卡片。
 *
 * 兜底只有一条，条件写死在这里：调用点不在任何会话输入区里（座位与会话根都找不到，例如
 * 测试夹具），或本会话座位内暂时还没有卡片时，**仅当整个文档里恰好只有一张卡片**才回退到它。
 * 文档里有多张卡片时无从归属会话，宁可返回 null（调用方据此不动作），也不能替别的会话读删。
 *
 * @param {Node | null | undefined} [anchor] 调用方的 DOM 位置（本会话输入区里的任意节点）
 * @returns {Element | null}
 */
export function resolveComposerCard(anchor) {
  const doc = (anchor && anchor.ownerDocument) || (typeof document !== 'undefined' ? document : null)
  if (!doc) return null
  const node = anchor && typeof anchor.closest === 'function' ? anchor : null
  if (node) {
    const seat = node.closest(CONVERSATION_SCOPE_SELECTOR)
    const card = seat ? seat.querySelector(COMPOSER_CARD_SELECTOR) : node.closest(COMPOSER_CARD_SELECTOR)
    if (card) return card
    // 座位在、卡片还没建出来：本会话此刻没有卡片，不回退到别的会话
    if (seat) return null
  }
  const cards = doc.querySelectorAll(COMPOSER_CARD_SELECTOR)
  return cards.length === 1 ? cards[0] : null
}

/**
 * 输入框里现有的链接胶囊种类（按 DOM 顺序去重）。
 * 胶囊不进草稿文本，卡槽两态只能靠读节点，因此这里是唯一读口。
 * @param {Node | null | undefined} [anchor] 调用方的 DOM 位置；读取范围收敛到本会话的输入框卡片
 *   （见 `resolveComposerCard` 的兜底条件）。缺省时按文档兜底，多张卡片下回空数组。
 * @returns {string[]}
 */
export function readQuickLinkChipKinds(anchor) {
  const card = resolveComposerCard(anchor)
  if (!card || typeof card.querySelectorAll !== 'function') return []
  const kinds = []
  for (const node of card.querySelectorAll(QUICK_LINK_CHIP_SELECTOR)) {
    const kind = kindOfChipNode(node)
    if (kind && !kinds.includes(kind)) kinds.push(kind)
  }
  return kinds
}
