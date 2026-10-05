// 模型配置：品牌 / 模型 / 渠道三级。
// 源工作台 model-picker.tsx 用的是浏览器原生下拉控件（本仓 UI01 明令禁止），这里改为
// 自带的浮层下拉：button + role=listbox + role=option，支持 Escape 与点击外部关闭。
// 数据来自中枢目录（lib/catalog.js），不再读网关 pricing。

import { useEffect, useMemo, useRef, useState } from 'react'
import { brandsOf, groupsOfModel, imageModels, modelsOfBrand } from '../lib/catalog.js'

/** 下拉箭头：矢量 SVG。 */
function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 渠道倍率后缀：目录给的是 '×1.20' 这类字符串，直接拼；数字则补 ×。 */
function ratioSuffix(group) {
  const ratio = group?.ratio
  if (typeof ratio === 'string' && ratio.trim()) return ` ${ratio.trim()}`
  if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio !== 1) return ` ×${ratio}`
  return ''
}

/**
 * 自带的下拉浮层（非原生 select）。
 * @param {{
 *   label: string,
 *   value: string,
 *   placeholder: string,
 *   options: { value: string, label: string }[],
 *   onChange: (value: string) => void,
 * }} props
 */
function Dropdown(props) {
  const { label, value, placeholder, options, onChange } = props
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    if (typeof document === 'undefined') return undefined
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains?.(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = (options ?? []).find((option) => option.value === value)

  return (
    <div className="omx-avatar-field" ref={wrapRef}>
      <span className="omx-avatar-field-lbl">{label}</span>
      <button type="button" /* exempt-ui01: 自绘下拉触发器，非原生控件 */
        className="omx-avatar-dropdown"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="omx-avatar-dropdown-val">{current ? current.label : placeholder}</span>
        <ChevronDownIcon />
      </button>
      {open ? (
        <div className="omx-avatar-menu" role="listbox" aria-label={label}>
          {(options ?? []).map((option) => (
            <button key={option.value || '__empty'} type="button" /* exempt-ui01: 下拉项是自绘列表项 */
              role="option"
              aria-selected={option.value === value}
              className="omx-avatar-menu-item"
              onClick={() => {
                setOpen(false)
                onChange(option.value)
              }}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   catalog: object|null,
 *   vendorId: string|null,
 *   model: string,
 *   group: string,
 *   onVendor: (id: string|null) => void,
 *   onModel: (name: string) => void,
 *   onGroup: (name: string) => void,
 *   t: (key: string, vars?: Record<string, unknown>) => string,
 * }} props
 */
export function ModelPicker(props) {
  const { catalog, vendorId, model, group, onVendor, onModel, onGroup, t } = props
  const rows = useMemo(() => imageModels(catalog), [catalog])
  const brands = useMemo(() => brandsOf(rows), [rows])
  const scoped = useMemo(
    () => (vendorId ? modelsOfBrand(rows, vendorId) : rows.map((row) => ({ id: row.id, name: row.label || row.id }))),
    [rows, vendorId]
  )
  const groups = useMemo(() => groupsOfModel(rows, model), [rows, model])

  const brandOptions = useMemo(
    () => [
      { value: '', label: t('model.brandAll') },
      ...brands.map((brand) => ({ value: brand.id, label: brand.name })),
    ],
    [brands, t]
  )
  const modelOptions = useMemo(
    () => [
      { value: '', label: t('model.pick') },
      ...scoped.map((row) => ({ value: row.id, label: row.name })),
    ],
    [scoped, t]
  )
  const groupOptions = useMemo(
    () => [
      { value: '', label: t('model.groupDefault') },
      ...groups.map((item) => ({ value: item.id, label: `${item.name}${ratioSuffix(item)}` })),
    ],
    [groups, t]
  )

  return (
    <div className="omx-avatar-picker">
      <Dropdown
        label={t('model.brand')}
        value={vendorId ?? ''}
        placeholder={t('model.brandAll')}
        options={brandOptions}
        onChange={(next) => {
          // 只有真的换了品牌才清空模型与渠道。
          if (next === (vendorId ?? '')) return
          onVendor(next || null)
          onModel('')
          onGroup('')
        }}
      />
      <Dropdown
        label={t('model.model')}
        value={model ?? ''}
        placeholder={t('model.pick')}
        options={modelOptions}
        onChange={(next) => {
          if (next === (model ?? '')) return
          onModel(next)
          onGroup('')
        }}
      />
      <Dropdown
        label={t('model.group')}
        value={group ?? ''}
        placeholder={t('model.groupDefault')}
        options={groupOptions}
        onChange={(next) => {
          if (next === (group ?? '')) return
          onGroup(next)
        }}
      />
    </div>
  )
}
