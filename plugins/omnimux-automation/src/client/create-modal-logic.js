/**
 * 新建/编辑弹窗的交互判定（纯函数，供组件与单测共用）。
 */

/**
 * 新建/编辑弹窗只允许取消或 ESC 关闭，点旁边不能关。
 *
 * @param {'backdrop' | 'escape' | 'cancel'} reason
 * @returns {boolean}
 */
export function shouldCloseCreateModal(reason) {
  return reason !== 'backdrop'
}

/**
 * 与 Chat 一致：从其他权限切换到完全访问时显示风险确认。
 *
 * @param {string} current
 * @param {string} next
 * @returns {boolean}
 */
export function shouldConfirmFullAccess(current, next) {
  return current !== next && next === 'danger-full-access'
}
