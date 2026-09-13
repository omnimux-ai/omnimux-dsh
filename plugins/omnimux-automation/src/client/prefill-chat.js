/**
 * 底座主对话输入框的草稿填充。
 *
 * 「使用对话创建」把定时任务引导语写进主对话输入框，由用户自己确认发送；
 * 本模块只写草稿与聚焦，绝不查找或点击发送按钮。
 *
 * 官方底座的输入框是 contenteditable 的 `div`（Lexical 编辑器），不是 `<textarea>`，
 * 所以选择器先认座位内的 contenteditable，最后才退回带作用域的 textarea；
 * 没有作用域保护的裸 `textarea` 会命中弹窗与只读预览，一律不用。
 *
 * 写入分两条通道：contenteditable 先走 `execCommand('insertText')`（底座编辑器的正常输入通道），
 * 命令无效时退回 `textContent` + 事件；textarea 走原型 `value` setter（直接 `field.value =`
 * 会被 React 受控输入丢弃）。两条通道最后都回读校验，只有真实写入成功才返回 true。
 */

/**
 * 底座主对话输入框的选择器，按优先级从窄到宽排列：先 contenteditable 座位，
 * 再带作用域的 textarea，最后才是产品自有的输入标记。
 *
 * 必须逐个选择器查询：`querySelectorAll` 按文档顺序返回，写成一条选择器列表时
 * 页面上任意一个更靠前的元素都会压过更窄的座位选择器。
 */
export const COMPOSER_SELECTORS = [
  '[data-composer-seat] [contenteditable="true"]',
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  'div[role="textbox"][contenteditable="true"]',
  '[data-composer-input]',
  '[data-composer-card] textarea',
  '[data-composer-seat] textarea',
  'textarea[data-input-text]',
]

/** 同上，供调试与断言用的合并形式。 */
export const COMPOSER_SELECTOR = COMPOSER_SELECTORS.join(', ')

/**
 * 命令被接受、但宿主编辑器尚未把内容写回 DOM 时的让行时间（毫秒）。
 * Lexical 在 `insertText` 之后异步调和 DOM，立即回读会误判成「没写进去」。
 */
const COMMIT_YIELD_MS = 0

/**
 * 定位主对话输入框：按优先级逐个选择器取第一个可写候选。
 * 只读、禁用或既不是 contenteditable 也不是表单输入的元素不是草稿座位，跳过。
 *
 * @param {{ querySelectorAll: (selector: string) => ArrayLike<unknown> } | null | undefined} [doc]
 * @returns {HTMLElement | null}
 */
export function findComposerField(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null
  for (const selector of COMPOSER_SELECTORS) {
    for (const candidate of Array.from(doc.querySelectorAll(selector))) {
      const field = /** @type {HTMLElement} */ (candidate)
      if (isWritableField(field)) return field
    }
  }
  return null
}

/**
 * 候选元素是否可写：contenteditable 容器，或未只读 / 未禁用的 textarea 与文本输入。
 *
 * @param {unknown} field
 * @returns {boolean}
 */
function isWritableField(field) {
  if (!field || typeof field !== 'object') return false
  const el = /** @type {{ readOnly?: boolean, disabled?: boolean, tagName?: string }} */ (field)
  if (el.readOnly === true || el.disabled === true) return false
  if (isContentEditableField(field)) return true
  return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT'
}

/**
 * 元素是否是可编辑容器。`isContentEditable` 在部分环境（jsdom）没有实现，
 * 所以属性与 Lexical 标记都当作依据。
 *
 * @param {unknown} field
 * @returns {boolean}
 */
function isContentEditableField(field) {
  if (!field || typeof field !== 'object') return false
  const el = /** @type {{ isContentEditable?: boolean, getAttribute?: (name: string) => string | null, __lexicalEditor?: unknown }} */ (field)
  return Boolean(
    el.isContentEditable === true
    || el.getAttribute?.('contenteditable') === 'true'
    || el.__lexicalEditor !== undefined,
  )
}

/**
 * 回读输入框的真实内容：contenteditable 用 textContent，其余用 value。
 *
 * @param {HTMLElement} field
 * @returns {string}
 */
function readFieldText(field) {
  if (isContentEditableField(field)) return String(field.textContent ?? '')
  return String(/** @type {{ value?: unknown }} */ (field).value ?? '')
}

/**
 * 取输入框所在 realm 的事件构造器。跨 realm 时用宿主 realm 的构造器
 * （jsdom 等环境里全局 `Event` 与节点不同源，派发会直接抛类型错误）。
 *
 * @param {HTMLElement} field
 * @param {string} type
 * @returns {typeof Event}
 */
function resolveEventCtor(field, type) {
  const view = field.ownerDocument?.defaultView
  const realmCtor = type === 'input' ? view?.InputEvent : undefined
  if (typeof realmCtor === 'function') return realmCtor
  if (typeof view?.Event === 'function') return view.Event
  if (type === 'input' && typeof InputEvent === 'function') return InputEvent
  return Event
}

/**
 * 派发一次事件；构造器不接受附加字段时退回最简形式。
 *
 * @param {HTMLElement} field
 * @param {string} type
 * @param {Record<string, unknown>} [init]
 */
function dispatchFieldEvent(field, type, init = { bubbles: true }) {
  if (typeof field.dispatchEvent !== 'function') return
  const Ctor = resolveEventCtor(field, type)
  try {
    field.dispatchEvent(new Ctor(type, init))
  } catch {
    try {
      field.dispatchEvent(new Ctor(type, { bubbles: true }))
    } catch {
      // 极端环境里构造事件都会失败，此时只能放弃通知
    }
  }
}

/**
 * 通知宿主草稿变了：input（React 受控输入）与 change（原生表单监听）各一次。
 *
 * @param {HTMLElement} field
 * @param {string} text
 */
function dispatchDraftEvents(field, text) {
  dispatchFieldEvent(field, 'input', { bubbles: true, inputType: 'insertText', data: text })
  dispatchFieldEvent(field, 'change', { bubbles: true })
}

/**
 * 聚焦输入框；无焦点实现的环境里静默跳过。
 *
 * @param {HTMLElement} field
 */
function focusField(field) {
  try {
    field.focus?.()
  } catch {
    // 某些替身节点没有焦点实现
  }
}

/**
 * 把光标移到文本末尾，用户的后续输入自然接在草稿后面。
 *
 * @param {HTMLElement} field
 */
function moveCaretToEnd(field) {
  try {
    if (isContentEditableField(field)) {
      const view = field.ownerDocument?.defaultView
      const selection = view?.getSelection?.()
      const doc = field.ownerDocument
      if (!selection || !doc) return
      const range = doc.createRange()
      range.selectNodeContents(field)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    const length = readFieldText(field).length
    /** @type {{ setSelectionRange?: (start: number, end: number) => void }} */ (field).setSelectionRange?.(length, length)
  } catch {
    // 光标只是体验优化，失败不影响草稿写入结果
  }
}

/**
 * 让出一轮宏任务，给宿主编辑器（Lexical）把已接受命令调和进 DOM 的机会。
 *
 * @returns {Promise<void>}
 */
function yieldToHost() {
  if (typeof setTimeout !== 'function') return Promise.resolve()
  return new Promise(resolve => { setTimeout(resolve, COMMIT_YIELD_MS) })
}

/**
 * 用编辑器原生通道写入：先全选容器内容（草稿是整段替换），再执行 insertText。
 * 命令不存在、抛错或被拒绝时返回 false，由调用方退回直接写入。
 *
 * @param {HTMLElement} field
 * @param {string} text
 * @returns {boolean} 命令是否被接受
 */
function tryInsertText(field, text) {
  const doc = field.ownerDocument ?? (typeof document === 'undefined' ? null : document)
  if (typeof doc?.execCommand !== 'function') return false
  try {
    focusField(field)
    const selection = doc.defaultView?.getSelection?.()
    if (selection && typeof selection.selectAllChildren === 'function') {
      selection.selectAllChildren(field)
    }
    return doc.execCommand('insertText', false, text) === true
  } catch {
    return false
  }
}

/**
 * contenteditable 通道：优先 `execCommand('insertText')`，内容没变化才退回
 * `textContent` + input / change 事件。最后回读校验。
 *
 * @param {HTMLElement} field
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function writeContentEditable(field, text) {
  const accepted = tryInsertText(field, text)
  if (readFieldText(field) === text) {
    focusField(field)
    moveCaretToEnd(field)
    return true
  }
  if (accepted) {
    await yieldToHost()
    if (readFieldText(field) === text) {
      focusField(field)
      moveCaretToEnd(field)
      return true
    }
  }
  field.textContent = text
  dispatchDraftEvents(field, text)
  focusField(field)
  const written = readFieldText(field) === text
  moveCaretToEnd(field)
  return written
}

/**
 * textarea / input 通道：走原型 `value` setter，React 受控输入才会同步；
 * 直接 `field.value =` 会被 React 丢弃。最后回读校验。
 *
 * @param {HTMLElement} field
 * @param {string} text
 * @returns {boolean}
 */
function writeTextArea(field, text) {
  focusField(field)
  const setter = resolveValueSetter(field)
  if (typeof setter === 'function') setter.call(field, text)
  else /** @type {{ value: string }} */ (field).value = text
  dispatchDraftEvents(field, text)
  focusField(field)
  const written = readFieldText(field) === text
  moveCaretToEnd(field)
  return written
}

/**
 * 取 value 访问器：优先元素自身原型的描述符，其次宿主 realm 的表单原型。
 *
 * @param {HTMLElement} field
 * @returns {((this: unknown, value: string) => void) | undefined}
 */
function resolveValueSetter(field) {
  const own = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')
  if (typeof own?.set === 'function') return own.set
  const view = field.ownerDocument?.defaultView
  const proto = field.tagName === 'INPUT' ? view?.HTMLInputElement?.prototype : view?.HTMLTextAreaElement?.prototype
  return Object.getOwnPropertyDescriptor(proto ?? {}, 'value')?.set
}

/**
 * 按元素类型分派写入通道。
 *
 * @param {HTMLElement} field
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function writeDraft(field, text) {
  return isContentEditableField(field)
    ? writeContentEditable(field, text)
    : writeTextArea(field, text)
}

/**
 * 把引导语填进主对话输入框并聚焦，光标落在末尾。
 *
 * 输入框不在当前页面（例如主对话尚未挂载）时返回 `false`；
 * 回读校验通过才返回 `true`，写入失败也返回 `false`，不会假装成功。
 *
 * @param {string} text 要填入的草稿
 * @param {{ document?: { querySelectorAll: (selector: string) => ArrayLike<unknown> } }} [options]
 * @returns {Promise<boolean>} 是否成功写入
 */
export async function applyComposerDraft(text, options = {}) {
  if (typeof text !== 'string') return false
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  const field = findComposerField(doc)
  if (field === null) return false
  return writeDraft(field, text)
}
