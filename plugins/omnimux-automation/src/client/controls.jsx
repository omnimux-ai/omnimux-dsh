/**
 * 工作台本地控件原语。
 *
 * 本插件的视觉是自绘 CSS（`dsh-st-` 前缀 + 官方 `--dsw-alias-*` token），
 * 控件几何与状态样式都由 `styles.js` 独占提供，不能叠加第三方控件的全局样式表。
 * 因此这里保留一个薄 `<button>` 包装，只做形态归一，业务代码统一经此原语出控件。
 *
 * React 组件用 `.jsx`，其余共享逻辑用 `.js`。
 */

import { forwardRef } from 'react'

/**
 * 统一按钮原语：透传全部原生属性与 `ref`，不注入任何内联样式。
 *
 * @param {object} props
 * @param {'button' | 'submit' | 'reset'} [props.type]
 * @returns {import('react').ReactElement}
 */
export const Button = forwardRef(function Button({ type = 'button', children, ...rest }, ref) {
  return <button {...rest} ref={ref} type={type}>{children}</button> // exempt-ui01 自绘 CSS 控件原语；样式由 styles.js 独占，禁止叠加第三方全局样式表
})
