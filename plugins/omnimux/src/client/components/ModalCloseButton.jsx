import React from 'react'

/**
 * 全局统一模态框关闭按钮 (ModalCloseButton)
 * 具备 36px 正圆形、半透明浮雕背景、细腻微边框、细线几何 X 图标、柔和投影与 hover 微放大动画。
 *
 * @param {Object} props
 * @param {() => void} [props.onClose] 关闭回调函数
 * @param {() => void} [props.onClick] 兼容原生点击回调
 * @param {() => void} [props.onCancel] 兼容部分旧组件的 onCancel 命名
 * @param {'external' | 'top-right' | 'inline'} [props.placement='external'] 定位变体:
 *   - 'external': 悬浮在弹窗外侧右上方 (默认，用于 SplitModalDialog 等大弹窗)
 *   - 'top-right': 绝对定位在弹窗容器内部右上方 (用于单栏弹窗如 LoginGate, QuotaGate, ProductForm 等)
 *   - 'inline': 静态行内流布局 (用于 header 内部 flex 排版)
 * @param {string} [props.ariaLabel='Close'] 无障碍标签
 * @param {string} [props.label] 兼容 label 传参
 * @param {string} [props.title] 悬停提示
 * @param {string} [props.className=''] 附加自定义类名
 * @param {React.CSSProperties} [props.style] 附加行内样式
 * @param {React.ReactNode} [props.icon] 可选自定义图标，缺省时渲染内置标准几何细线 X 图标
 */
export function ModalCloseButton({
  onClose,
  onClick,
  onCancel,
  placement = 'external',
  ariaLabel,
  label,
  title,
  className = '',
  style,
  icon,
  ...rest
}) {
  const handleClick = (e) => {
    e.stopPropagation()
    onClose?.(e)
    onClick?.(e)
    onCancel?.(e)
  }

  const accessibleName = ariaLabel || label || title || 'Close'

  return (
    <button type="button" className={`omnimux-modal-close-btn is-${placement} omnimux-split-modal-close omnimux-insight-close ${className}`} onClick={handleClick} aria-label={accessibleName} title={title || label} style={style} {...rest}> {/* // exempt-ui01: modal close icon button */}
      {icon || (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
    </button>
  )
}
