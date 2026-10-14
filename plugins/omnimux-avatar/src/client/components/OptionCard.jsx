import { useCallback, useState } from 'react'
import { RecoverableMedia } from './RecoverableMedia.jsx'

// 类型使用独立插图与名称行，其他特征按照片、色块、文字或性别图标呈现。

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
  const [media,setMedia]=useState({state:'loading',src:null})
  const onMediaState=useCallback((state,src)=>setMedia({state,src}),[])
  const ready=media.state==='ready'&&media.src===option.imageUrl
  const label = t(option.label_en)
  const cls = `omx-avatar-opt${selected ? ' is-sel' : ''}`

  if(categoryId==='tier')return <button type="button" /* exempt-ui01: 角色类型插图与标签组成独立选择瓦片 */ className={`${cls} omx-avatar-opt--tier`} aria-label={label} aria-pressed={selected} onClick={onClick}>
    <span className="omx-avatar-tier-visual">{option.imageUrl?<RecoverableMedia compact className="omx-avatar-tier-image" src={option.imageUrl} alt="" loading="lazy"/>:null}</span>
    <span className="omx-avatar-tier-label">{label}</span>
  </button>

  // 性别卡片保留图标和常显名称。
  if (categoryId === 'gender') {
    return (
      <button type="button" /* exempt-ui01: 选项瓦片是自定义控件，非 kit 组件语义 */
        className={`${cls} omx-avatar-opt--gender`}
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
      >
        {option.imageUrl ? (
          <RecoverableMedia compact
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
        className={`${cls} omx-avatar-opt--color`}
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
      >
        <span
          className="omx-avatar-swatch"
          style={{ '--avatar-swatch': option.swatch ?? 'var(--dsw-alias-bg-layer-3)' }}
        />
        <span className="omx-avatar-overlay" />
        <span className="omx-avatar-lbl">{label}</span>
      </button>
    )
  }

  if (kind === 'text' || !option.imageUrl && !option.swatch) {
    return (
      <button type="button" /* exempt-ui01: 选项瓦片是自定义控件，非 kit 组件语义 */
        className={`${cls} omx-avatar-opt--text`}
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
      >
        <span className="omx-avatar-lbl">{label}</span>
      </button>
    )
  }

  return (
    <button type="button" /* exempt-ui01: 选项瓦片是自定义控件，非 kit 组件语义 */
      className={`${cls} omx-avatar-opt--media`}
      data-media-ready={ready}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
    >
      {option.imageUrl ? (
        <RecoverableMedia compact onStateChange={onMediaState} className="omx-avatar-thumb" loading="lazy" src={option.imageUrl} alt={label} />
      ) : (
        <span className="omx-avatar-thumb" />
      )}
      <span className="omx-avatar-overlay" />
      <span className="omx-avatar-lbl">{label}</span>
    </button>
  )
}
