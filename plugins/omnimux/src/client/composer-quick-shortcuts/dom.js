/**
 * 快捷方式与宿主输入框之间的 DOM 桥。
 *
 * 全部动作都收敛到宿主（官方）已有的两件事上：
 *   1. 写草稿走 `window.__omnimuxComposerActions.setDraft`（由
 *      `composer-add/AttachmentSubmitBridge.jsx` 发布，官方输入框草稿的唯一写入口）；
 *   2. 在光标处插入令牌走输入框自身的选区 + `insertText`，
 *      与沿用至今的 `attachments/nativeVideoChip.ts` 回落路径同一手法。
 *
 * 本模块不做任何状态管理，也不发起请求；拿不到宿主能力时一律安静返回 false。
 */

/** 官方输入框可编辑区选择器（与 attachments 模块保持一致，避免两份真源漂移）。 */
const EDITOR_SELECTORS = [
  '[data-composer-card] [contenteditable="true"]',
  '[data-lexical-editor="true"]',
  '[data-composer-input="true"]',
  'div[role="textbox"][contenteditable="true"]',
].join(', ')

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
 * 整组写入草稿（切换快捷方式时提示语与链接一次替换到位）。
 * @param {string} text
 * @returns {boolean} 是否真的写入成功
 */
export function writeDraft(text) {
  const value = typeof text === 'string' ? text : ''
  try {
    const actions = typeof window !== 'undefined' ? window.__omnimuxComposerActions : null
    if (actions && typeof actions.setDraft === 'function') {
      actions.setDraft(value)
      return true
    }
  } catch {
    return false
  }
  return false
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

/**
 * 在光标处插入一段纯文本令牌（链接胶囊）。
 *
 * 顺序：先聚焦输入框 → 有选区就在选区插入；没有选区（焦点不在输入框）则
 * 落到输入框末尾。两种路径都用 `insertText`，因此会正常触发宿主编辑器的
 * 变更事件，草稿快照与卡槽态随之刷新。
 *
 * @param {string} token 要插入的文本，例如 `[视频]`
 * @param {string} [appendText] 输入框为空时一并写入的前缀（用于「提示语 + 胶囊」一次到位）
 * @returns {boolean} 是否插入成功
 */
export function insertTokenAtCursor(token, appendText) {
  const text = typeof token === 'string' ? token : ''
  if (!text) return false
  const editor = findComposerEditor()
  if (!editor) return false
  focusComposerEditor()
  try {
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      const ok = document.execCommand('insertText', false, text)
      if (ok) return true
    }
  } catch {
    // 宿主编辑器不支持 execCommand 时走回落路径
  }
  // 回落：直接写入草稿文本（拿不到光标时插到末尾）
  const base = readDraft()
  const separator = base && !/\s$/.test(base) ? '\n' : ''
  const prefix = typeof appendText === 'string' ? appendText : ''
  return writeDraft(`${base}${separator}${prefix}${text}`)
}

/**
 * 输入框是否已经存在某个链接胶囊（存在则对应卡槽不可点）的判据，
 * 唯一实现在 `catalog.js` 的 `hasLinkToken`（纯函数，卡片行与卡槽行共用）。
 */
