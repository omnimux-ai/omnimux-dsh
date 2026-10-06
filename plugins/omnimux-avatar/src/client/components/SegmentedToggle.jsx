// 通用分段切换：div[role=radiogroup] + button[role=radio]。
// 选中态用 aria-checked 表达（不只是颜色），测试与读屏都依赖它。

/**
 * @param {{
 *   value: string,
 *   onChange: (value: string) => void,
 *   options: { value: string, label: string, icon?: unknown }[],
 *   ariaLabel: string,
 *   className?: string,
 * }} props
 */
export function SegmentedToggle(props) {
  const { value, onChange, options, ariaLabel, className } = props
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`omx-avatar-seg${className ? ` ${className}` : ''}`}
    >
      {(options ?? []).map((option) => {
        const active = value === option.value
        return (
          <button key={option.value} type="button" /* exempt-ui01: 分段切换是自定义单选组 */
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            className="omx-avatar-seg-item"
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {/* 纯图标是逐项显式开启的（iconOnly），不能默认隐藏 —— 同组件的其它分段
                控件（如来源切换）靠可见文字识别，默认隐藏会让它们变成无字按钮。 */}
            {option.iconOnly ? null : <span>{option.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
