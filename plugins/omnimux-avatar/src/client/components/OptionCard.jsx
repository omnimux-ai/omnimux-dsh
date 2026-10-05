// 单个设定选项瓦片：84×84 固定尺寸，三种呈现（图片 / 色块 / 纯文字）+ 性别特例。
// 与源工作台 option-card.tsx 1:1；图标与角标一律矢量 SVG，不用字符图标。

/**
 * @param {{
 *   categoryId?: string,
 *   kind?: 'media'|'color'|'text',
 *   option: { id: string, label_en: string, imageUrl?: string|null, swatch?: string|null },
 *   selected: boolean,
 *   onClick: () => void,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function OptionCard(props) {
  const { categoryId, kind = 'media', option, selected, onClick, t } = props
  const label = t(option.label_en)
  const cls = `omx-avatar-opt${selected ? ' is-sel' : ''}`

  // 性别卡片：图标缩小置于右上角，标题置于卡片内侧左下角。
  if (categoryId === 'gender') {
    return (
      <button type="button" /* exempt-ui01: 选项瓦片是自定义控件，非 kit 组件语义 */
        className={`${cls} omx-avatar-opt--gender`}
        aria-pressed={selected}
        onClick={onClick}
      >
        {option.imageUrl ? (
          <img
            className="omx-avatar-gender-icon"
            loading="lazy"
            src={option.imageUrl}
            alt={label}
          />
        ) : null}
        <span className="omx-avatar-overlay" />
        <span className="omx-avatar-gender-title">{label}</span>
      </button>
    )
  }

  if (kind === 'color') {
    return (
      <button type="button" /* exempt-ui01: 选项瓦片是自定义控件，非 kit 组件语义 */
        className={cls}
        aria-pressed={selected}
        onClick={onClick}
      >
        <span
          className="omx-avatar-swatch"
          style={{ '--omx-avatar-swatch': option.swatch ?? 'var(--dsw-alias-bg-layer-3)' }}
        />
        <span className="omx-avatar-overlay" />
        <span className="omx-avatar-lbl">{label}</span>
      </button>
    )
  }

  if (kind === 'text') {
    return (
      <button type="button" /* exempt-ui01: 选项瓦片是自定义控件，非 kit 组件语义 */
        className={`${cls} omx-avatar-opt--text`}
        aria-pressed={selected}
        onClick={onClick}
      >
        <span className="omx-avatar-lbl">{label}</span>
      </button>
    )
  }

  return (
    <button type="button" /* exempt-ui01: 选项瓦片是自定义控件，非 kit 组件语义 */
      className={cls}
      aria-pressed={selected}
      onClick={onClick}
    >
      {option.imageUrl ? (
        <img className="omx-avatar-thumb" loading="lazy" src={option.imageUrl} alt={label} />
      ) : (
        <span className="omx-avatar-thumb" />
      )}
      <span className="omx-avatar-overlay" />
      <span className="omx-avatar-lbl">{label}</span>
    </button>
  )
}
